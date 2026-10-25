const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendLoanApprovalNotification } = require('../services/smsService');
const { calculateInterest, calculateMonthlyInstallment } = require('../services/calculationService');
const logger = require('../utils/logger');

async function getMemberLoans(req, res) {
  const { memberId } = req.params;
  try {
    const result = await pool.query(
      `SELECT l.*,
              u.username AS recorded_by_name,
              a.username AS approved_by_name,
              COALESCE(SUM(r.principal_component), 0) AS paid_principal,
              COALESCE(SUM(r.interest_component), 0) AS paid_interest
       FROM loans l
       LEFT JOIN users u ON u.user_id = l.recorded_by
       LEFT JOIN users a ON a.user_id = l.approved_by
       LEFT JOIN repayments r ON r.loan_id = l.loan_id
       WHERE l.member_id = $1
       GROUP BY l.loan_id, u.username, a.username
       ORDER BY l.created_at DESC`,
      [memberId]
    );
    return res.json({ loans: result.rows });
  } catch (err) {
    logger.error('Get loans error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function createLoan(req, res) {
  const { memberId, principal, interestMethod, interestRate, durationMonths, dueDate, notes } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const memberResult = await pool.query(
      'SELECT member_id FROM members WHERE member_id = $1 AND status = $2',
      [memberId, 'active']
    );
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active member not found.' });
    }

    // Check no active loan exists for this member
    const activeCheck = await pool.query(
      `SELECT loan_id FROM loans WHERE member_id = $1 AND status IN ('approved', 'disbursed')`,
      [memberId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Member already has an active loan.' });
    }

    const result = await pool.query(
      `INSERT INTO loans (member_id, principal, interest_method, interest_rate, duration_months, due_date, recorded_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [memberId, principal, interestMethod || 'reducing_balance', interestRate || 0, durationMonths, dueDate || null, req.user.user_id, notes || null]
    );

    const loan = result.rows[0];

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'CREATE_LOAN',
      entityType: 'loans',
      entityId: loan.loan_id,
      ipAddress: ip,
      afterState: { memberId, principal, interestMethod, interestRate, durationMonths },
    });

    return res.status(201).json({ loan });
  } catch (err) {
    logger.error('Create loan error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function approveLoan(req, res) {
  const { loanId } = req.params;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const loanResult = await client.query('SELECT * FROM loans WHERE loan_id = $1', [loanId]);
    if (loanResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Loan not found.' });
    }

    const loan = loanResult.rows[0];
    if (loan.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Loan cannot be approved. Current status: ${loan.status}` });
    }

    const result = await client.query(
      `UPDATE loans SET status = 'approved', approved_by = $1, approved_at = CURRENT_DATE, updated_at = NOW()
       WHERE loan_id = $2 RETURNING *`,
      [req.user.user_id, loanId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'APPROVE_LOAN',
      entityType: 'loans',
      entityId: loanId,
      ipAddress: ip,
      beforeState: { status: 'pending' },
      afterState: { status: 'approved' },
    });

    // SMS notification
    const memberResult = await pool.query('SELECT full_name, phone FROM members WHERE member_id = $1', [loan.member_id]);
    const member = memberResult.rows[0];
    if (member?.phone) {
      await sendLoanApprovalNotification({
        phone: member.phone,
        fullName: member.full_name,
        principal: parseFloat(loan.principal),
        dueDate: loan.due_date,
      });
    }

    return res.json({ loan: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Approve loan error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

async function disburseLoan(req, res) {
  const { loanId } = req.params;
  const ip = req.ip || req.connection.remoteAddress;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const loanResult = await client.query('SELECT * FROM loans WHERE loan_id = $1', [loanId]);
    if (loanResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Loan not found.' });
    }

    const loan = loanResult.rows[0];
    if (loan.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only approved loans can be disbursed.' });
    }

    const result = await client.query(
      `UPDATE loans SET status = 'disbursed', disbursed_at = CURRENT_DATE, updated_at = NOW()
       WHERE loan_id = $1 RETURNING *`,
      [loanId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      userId: req.user.user_id,
      action: 'DISBURSE_LOAN',
      entityType: 'loans',
      entityId: loanId,
      ipAddress: ip,
      beforeState: { status: 'approved' },
      afterState: { status: 'disbursed' },
    });

    return res.json({ loan: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Disburse loan error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

async function getLoanSchedule(req, res) {
  const { loanId } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM loans WHERE loan_id = $1 AND ($2 = ANY(ARRAY[\'admin\', \'treasurer\']) OR member_id = $3)',
      [loanId, req.user.role, req.user.member_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Loan not found.' });

    const loan = result.rows[0];
    const totalInterest = calculateInterest({
      principal: loan.principal,
      interestRate: loan.interest_rate,
      durationMonths: loan.duration_months,
      method: loan.interest_method,
    });
    const monthlyInstallment = calculateMonthlyInstallment({
      principal: loan.principal,
      interestRate: loan.interest_rate,
      durationMonths: loan.duration_months,
    });

    return res.json({
      loanId: loan.loan_id,
      principal: parseFloat(loan.principal),
      interestRate: parseFloat(loan.interest_rate),
      interestMethod: loan.interest_method,
      durationMonths: loan.duration_months,
      totalInterest,
      totalRepayable: parseFloat(loan.principal) + totalInterest,
      monthlyInstallment,
    });
  } catch (err) {
    logger.error('Loan schedule error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getMemberLoans, createLoan, approveLoan, disburseLoan, getLoanSchedule };
