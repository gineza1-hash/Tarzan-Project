const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendRepaymentNotification } = require('../services/smsService');
const logger = require('../utils/logger');

async function getLoanRepayments(req, res) {
  const { loanId } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*, u.username AS recorded_by_name
       FROM repayments r
       JOIN users u ON u.user_id = r.recorded_by
       WHERE r.loan_id = $1
       ORDER BY r.paid_at DESC`,
      [loanId]
    );
    return res.json({ repayments: result.rows });
  } catch (err) {
    logger.error('Get repayments error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function recordRepayment(req, res) {
  const { loanId, memberId, amount, principalComponent, interestComponent, feesComponent, paidAt, referenceCode, notes } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate reference check
    const dupCheck = await client.query('SELECT repayment_id FROM repayments WHERE reference_code = $1', [referenceCode]);
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Duplicate reference code. Repayment already recorded.' });
    }

    // Validate loan exists and is disbursed
    const loanResult = await client.query('SELECT * FROM loans WHERE loan_id = $1', [loanId]);
    if (loanResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Loan not found.' });
    }

    const loan = loanResult.rows[0];
    if (!['disbursed', 'approved'].includes(loan.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Repayments can only be recorded for active loans.' });
    }

    // Validate components sum to total
    const componentsSum = parseFloat(principalComponent || 0) + parseFloat(interestComponent || 0) + parseFloat(feesComponent || 0);
    if (Math.abs(componentsSum - parseFloat(amount)) > 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Principal + interest + fees components must equal total amount.' });
    }

    const result = await client.query(
      `INSERT INTO repayments (loan_id, member_id, amount, principal_component, interest_component, fees_component, paid_at, recorded_by, reference_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [loanId, memberId, amount, principalComponent || 0, interestComponent || 0, feesComponent || 0,
       paidAt || new Date(), req.user.user_id, referenceCode, notes || null]
    );

    const repayment = result.rows[0];

    // Check if loan is fully repaid
    const paidResult = await client.query(
      'SELECT COALESCE(SUM(principal_component), 0) AS total_paid FROM repayments WHERE loan_id = $1',
      [loanId]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);
    const outstanding = parseFloat(loan.principal) - totalPaid;

    if (outstanding <= 0) {
      await client.query(`UPDATE loans SET status = 'closed', updated_at = NOW() WHERE loan_id = $1`, [loanId]);
    }

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'RECORD_REPAYMENT',
      entityType: 'repayments',
      entityId: repayment.repayment_id,
      ipAddress: ip,
      afterState: { loanId, memberId, amount, referenceCode },
    });

    // SMS notification
    const memberResult = await pool.query('SELECT full_name, phone FROM members WHERE member_id = $1', [memberId]);
    const member = memberResult.rows[0];
    if (member?.phone) {
      await sendRepaymentNotification({
        phone: member.phone,
        fullName: member.full_name,
        amount: parseFloat(amount),
        outstanding: Math.max(outstanding, 0),
        reference: referenceCode,
        date: paidAt || new Date().toISOString().split('T')[0],
      });
    }

    return res.status(201).json({ repayment, outstandingBalance: Math.max(outstanding, 0) });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Record repayment error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

module.exports = { getLoanRepayments, recordRepayment };
