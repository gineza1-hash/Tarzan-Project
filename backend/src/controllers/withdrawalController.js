const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendWithdrawalNotification } = require('../services/smsService');
const logger = require('../utils/logger');

const DAILY_LIMIT = Number(process.env.USSD_DAILY_WITHDRAWAL_LIMIT_RWF || 50000);

async function listWithdrawalRequests(req, res) {
  try {
    const result = await pool.query(
      `SELECT wr.*, m.full_name, m.member_number, m.phone
       FROM withdrawal_requests wr
       JOIN members m ON m.member_id = wr.member_id
       WHERE ($1 = 'admin' OR $1 = 'treasurer' OR wr.member_id = $2)
       ORDER BY wr.requested_at DESC`,
      [req.user.role, req.user.member_id]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    logger.error('List withdrawal requests error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function reviewWithdrawal(req, res) {
  const { requestId } = req.params;
  const { status, reason } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected.' });
  }
  if (status === 'rejected' && (!reason || reason.trim().length < 3)) {
    return res.status(400).json({ error: 'A reason is required when rejecting a withdrawal.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT wr.*, m.full_name, m.phone
       FROM withdrawal_requests wr
       JOIN members m ON m.member_id = wr.member_id
       WHERE wr.request_id = $1
       FOR UPDATE`,
      [requestId]
    );
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }

    const request = requestResult.rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Request cannot be reviewed from status ${request.status}.` });
    }

    const result = await client.query(
      `UPDATE withdrawal_requests
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2, rejection_reason = $3
       WHERE request_id = $4
       RETURNING *`,
      [status, req.user.user_id, status === 'rejected' ? reason.trim() : null, requestId]
    );
    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: status === 'approved' ? 'APPROVE_WITHDRAWAL' : 'REJECT_WITHDRAWAL',
      entityType: 'withdrawal_requests',
      entityId: requestId,
      ipAddress: ip,
      afterState: result.rows[0],
      reason: status === 'rejected' ? reason.trim() : undefined,
    });

    if (request.phone) {
      await sendWithdrawalNotification({
        phone: request.phone,
        fullName: request.full_name,
        amount: Number(request.amount),
        status,
        reason: status === 'rejected' ? reason.trim() : null,
      });
    }
    return res.json({ request: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Review withdrawal error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

async function completeWithdrawal(req, res) {
  const { requestId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      'SELECT * FROM withdrawal_requests WHERE request_id = $1 FOR UPDATE',
      [requestId]
    );
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }
    const request = requestResult.rows[0];
    if (request.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only approved withdrawals can be completed.' });
    }

    const referenceCode = `WDR-${requestId}`;
    const transaction = await client.query(
      `INSERT INTO savings_transactions
         (member_id, amount, transaction_type, transaction_date, recorded_by, reference_code, notes)
       VALUES ($1, $2, 'withdrawal', CURRENT_DATE, $3, $4, $5)
       RETURNING *`,
      [request.member_id, request.amount, req.user.user_id, referenceCode, 'Withdrawal request paid by staff']
    );
    const result = await client.query(
      `UPDATE withdrawal_requests
       SET status = 'completed', completed_at = NOW()
       WHERE request_id = $1
       RETURNING *`,
      [requestId]
    );
    await client.query('COMMIT');
    return res.json({ request: result.rows[0], transaction: transaction.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Complete withdrawal error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

module.exports = { listWithdrawalRequests, reviewWithdrawal, completeWithdrawal, DAILY_LIMIT };
