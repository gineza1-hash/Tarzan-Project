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

async function createMember(req, res) {
  const { memberNumber, fullName, phone, email, nationalId, joinedAt } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const duplicate = await pool.query(
      'SELECT member_id FROM members WHERE member_number = $1 OR national_id = $2',
      [memberNumber, nationalId || null]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'Member number or National ID already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO members (member_number, full_name, phone, email, national_id, joined_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [memberNumber, fullName, phone || null, email || null, nationalId || null, joinedAt || new Date(), req.user.user_id]
    );

    const member = result.rows[0];

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
    logger.error('Create member error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function updateMember(req, res) {
  const { memberId } = req.params;
  const { fullName, phone, email } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const before = await pool.query('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (before.rows.length === 0) return res.status(404).json({ error: 'Member not found.' });

    const result = await pool.query(
      `UPDATE members SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone),
       email = COALESCE($3, email), updated_at = NOW()
       WHERE member_id = $4 RETURNING *`,
      [fullName, phone, email, memberId]
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

async function updateMemberStatus(req, res) {
  const { memberId } = req.params;
  const { status, reason } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!validateMemberStatus(status) || !status) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }
  if (status === 'inactive' && (!reason || reason.trim().length < 3)) {
    return res.status(400).json({ error: 'A reason is required when deactivating a member.' });
  }

  try {
    const before = await pool.query('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (before.rows.length === 0) return res.status(404).json({ error: 'Member not found.' });

    const result = await pool.query(
      `UPDATE members
       SET status = $1,
           deactivated_at = CASE WHEN $1 = 'inactive' THEN NOW() ELSE NULL END,
           deactivated_by = CASE WHEN $1 = 'inactive' THEN $2 ELSE NULL END,
           deactivation_reason = CASE WHEN $1 = 'inactive' THEN $3 ELSE NULL END,
           updated_at = NOW()
       WHERE member_id = $4
       RETURNING *`,
      [status, req.user.user_id, status === 'inactive' ? reason.trim() : null, memberId]
    );

    await writeAuditLog({
      userId: req.user.user_id,
      action: status === 'inactive' ? 'DEACTIVATE_MEMBER' : 'REACTIVATE_MEMBER',
      entityType: 'members',
      entityId: memberId,
      ipAddress: ip,
      beforeState: before.rows[0],
      afterState: result.rows[0],
      reason: status === 'inactive' ? reason.trim() : 'Member reactivated',
    });

    return res.json({ member: result.rows[0] });
  } catch (err) {
    logger.error('Update member status error', { error: err.message });
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

module.exports = {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  updateMemberStatus,
  getMemberSummary,
  validateMemberStatus,
};
