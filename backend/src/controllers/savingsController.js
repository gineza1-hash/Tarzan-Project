const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendDepositNotification } = require('../services/smsService');
const logger = require('../utils/logger');

async function getSavingsTransactions(req, res) {
  const { memberId } = req.params;
  const { from, to, type } = req.query;

  try {
    let query = `SELECT st.*, u.username AS recorded_by_name
                 FROM savings_transactions st
                 JOIN users u ON u.user_id = st.recorded_by
                 WHERE st.member_id = $1`;
    const params = [memberId];
    let idx = 2;

    if (from) { query += ` AND st.transaction_date >= $${idx++}`; params.push(from); }
    if (to)   { query += ` AND st.transaction_date <= $${idx++}`; params.push(to); }
    if (type) { query += ` AND st.transaction_type = $${idx++}`; params.push(type); }

    query += ' ORDER BY st.transaction_date DESC, st.created_at DESC';

    const result = await pool.query(query, params);
    return res.json({ transactions: result.rows });
  } catch (err) {
    logger.error('Get savings error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function recordSavingsTransaction(req, res) {
  const { memberId, amount, transactionType, transactionDate, referenceCode, notes } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const memberResult = await client.query(
      'SELECT member_id, status FROM members WHERE member_id = $1 FOR UPDATE',
      [memberId]
    );
    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Member not found.' });
    }
    if (memberResult.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Savings transactions can only be recorded for active members.' });
    }

    // Duplicate reference check
    const dupCheck = await client.query(
      'SELECT transaction_id FROM savings_transactions WHERE reference_code = $1',
      [referenceCode]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Duplicate reference code. Transaction already exists.' });
    }

    // For withdrawals, check sufficient balance
    if (transactionType === 'withdrawal') {
      const balResult = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN transaction_type = 'deposit' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS balance
         FROM savings_transactions WHERE member_id = $1`,
        [memberId]
      );
      const currentBalance = parseFloat(balResult.rows[0].balance);
      if (currentBalance < parseFloat(amount)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient savings balance for withdrawal.' });
      }
    }

    const result = await client.query(
      `INSERT INTO savings_transactions (member_id, amount, transaction_type, transaction_date, recorded_by, reference_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [memberId, amount, transactionType, transactionDate || new Date(), req.user.user_id, referenceCode, notes || null]
    );

    const tx = result.rows[0];

    // Recalculate new balance
    const balResult = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'deposit' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS balance
       FROM savings_transactions WHERE member_id = $1`,
      [memberId]
    );
    const newBalance = parseFloat(balResult.rows[0].balance);

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'RECORD_SAVINGS',
      entityType: 'savings_transactions',
      entityId: tx.transaction_id,
      ipAddress: ip,
      afterState: { memberId, amount, transactionType, referenceCode },
    });

    // SMS notification for deposits
    if (transactionType === 'deposit') {
      const notificationResult = await pool.query('SELECT full_name, phone FROM members WHERE member_id = $1', [memberId]);
      const member = notificationResult.rows[0];
      if (member?.phone) {
        await sendDepositNotification({
          phone: member.phone,
          fullName: member.full_name,
          amount: parseFloat(amount),
          balance: newBalance,
          reference: referenceCode,
          date: transactionDate || new Date().toISOString().split('T')[0],
        });
      }
    }

    return res.status(201).json({ transaction: tx, newBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Record savings error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

async function reverseSavingsTransaction(req, res) {
  const { transactionId } = req.params;
  const { reason } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txResult = await client.query('SELECT * FROM savings_transactions WHERE transaction_id = $1', [transactionId]);
    if (txResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const tx = txResult.rows[0];
    if (tx.is_reversed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction is already reversed.' });
    }

    await client.query(
      `UPDATE savings_transactions
       SET is_reversed = TRUE, reversed_by = $1, reversed_at = NOW(), reversal_reason = $2
       WHERE transaction_id = $3`,
      [req.user.user_id, reason, transactionId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'REVERSE_SAVINGS',
      entityType: 'savings_transactions',
      entityId: transactionId,
      ipAddress: ip,
      beforeState: tx,
      reason,
    });

    return res.json({ message: 'Transaction reversed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Reverse savings error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

module.exports = { getSavingsTransactions, recordSavingsTransaction, reverseSavingsTransaction };
