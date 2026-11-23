// FILE: backend/src/controllers/membersController.js  
// CHANGE: createMember() now generates the member number (RW-001, RW-002, ...) instead of
//         reading it from the request. Everything else in this file is unchanged.

const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

function validateMemberStatus(status) {
  return status === undefined || status === 'active' || status === 'inactive';
}

async function getAllMembers(req, res) {
  try {
    const result = await pool.query(
      `SELECT m.*, u.username, u.email AS user_email
       FROM members m
       LEFT JOIN users u ON u.member_id = m.member_id
       ORDER BY m.joined_at DESC`
    );
    return res.json({ members: result.rows });
  } catch (err) {
    logger.error('Get members error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function getMemberById(req, res) {
  const { memberId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Member not found.' });
    return res.json({ member: result.rows[0] });
  } catch (err) {
    logger.error('Get member error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Member numbers are assigned by the system, never typed in: RW-001, RW-002, ...
const MEMBER_NUMBER_PREFIX = 'RW-';
const MEMBER_NUMBER_LOCK = 727001; // any fixed number; every create waits for this same lock

/**
 * Next free member number: one more than the highest existing RW-number.
 * Must run inside a transaction that already holds the lock (see createMember).
 */
async function nextMemberNumber(client) {
  const result = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(member_number FROM '^RW-([0-9]+)$')::bigint), 0) AS last
     FROM members
     WHERE member_number ~ '^RW-[0-9]+$'`
  );
  const next = Number(result.rows[0].last) + 1;
  return MEMBER_NUMBER_PREFIX + String(next).padStart(3, '0');
}

async function createMember(req, res) {
  // memberNumber is deliberately NOT read from the request: it is generated below.
  const { fullName, phone, email, nationalId, joinedAt } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Two people adding members at the same moment must not receive the same number.
    // The lock makes the second one wait until the first has saved.
    await client.query(`SELECT pg_advisory_xact_lock(${MEMBER_NUMBER_LOCK})`);

    if (nationalId) {
      const duplicate = await client.query('SELECT member_id FROM members WHERE national_id = $1', [nationalId]);
      if (duplicate.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'National ID already exists.' });
      }
    }

    const memberNumber = await nextMemberNumber(client);

    const result = await client.query(
      `INSERT INTO members (member_number, full_name, phone, email, national_id, joined_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [memberNumber, fullName, phone || null, email || null, nationalId || null, joinedAt || new Date(), req.user.user_id]
    );
    const member = result.rows[0];

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'CREATE_MEMBER',
      entityType: 'members',
      entityId: member.member_id,
      ipAddress: ip,
      afterState: { memberNumber, fullName },
    });

    return res.status(201).json({ member });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      // the database's own UNIQUE rules are the last line of defence
      const onNationalId = String(err.constraint || '').includes('national_id');
      return res.status(409).json({
        error: onNationalId
          ? 'National ID already exists.'
          : 'Could not assign a member number just now. Please try again.',
      });
    }
    logger.error('Create member error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

async function updateMember(req, res) {
  const { memberId } = req.params;
  const { fullName, phone, email, status } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!validateMemberStatus(status)) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }

  try {
    const before = await pool.query('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (before.rows.length === 0) return res.status(404).json({ error: 'Member not found.' });

    const result = await pool.query(
      `UPDATE members SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone),
       email = COALESCE($3, email), status = COALESCE($4, status), updated_at = NOW()
       WHERE member_id = $5 RETURNING *`,
      [fullName, phone, email, status, memberId]
    );

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'UPDATE_MEMBER',
      entityType: 'members',
      entityId: memberId,
      ipAddress: ip,
      beforeState: before.rows[0],
      afterState: result.rows[0],
    });

    return res.json({ member: result.rows[0] });
  } catch (err) {
    logger.error('Update member error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function getMemberSummary(req, res) {
  const { memberId } = req.params;
  try {
    const [savingsResult, loansResult] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN transaction_type IN ('deposit', 'adjustment') AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS total_deposits,
           COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS total_withdrawals
         FROM savings_transactions WHERE member_id = $1`,
        [memberId]
      ),
      pool.query(
        `SELECT l.loan_id, l.principal, l.status,
                COALESCE(SUM(r.principal_component), 0) AS paid_principal
         FROM loans l
         LEFT JOIN repayments r ON r.loan_id = l.loan_id
         WHERE l.member_id = $1
         GROUP BY l.loan_id`,
        [memberId]
      ),
    ]);

    const savings = savingsResult.rows[0];
    const balance = parseFloat(savings.total_deposits) - parseFloat(savings.total_withdrawals);

    const activeLoans = loansResult.rows.filter((l) => ['disbursed', 'approved'].includes(l.status));
    const totalOutstanding = activeLoans.reduce(
      (sum, l) => sum + (parseFloat(l.principal) - parseFloat(l.paid_principal)),
      0
    );

    return res.json({
      savingsBalance: parseFloat(balance.toFixed(2)),
      totalDeposits: parseFloat(savings.total_deposits),
      totalWithdrawals: parseFloat(savings.total_withdrawals),
      activeLoans: activeLoans.length,
      totalOutstandingLoan: parseFloat(totalOutstanding.toFixed(2)),
    });
  } catch (err) {
    logger.error('Member summary error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getAllMembers, getMemberById, createMember, updateMember, getMemberSummary, validateMemberStatus };