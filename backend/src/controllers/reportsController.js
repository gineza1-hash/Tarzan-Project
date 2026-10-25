const pool = require('../db/pool');
const logger = require('../utils/logger');

async function getDashboardSummary(req, res) {
  try {
    const [membersResult, savingsResult, loansResult, repaymentsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active FROM members`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'deposit' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS total_deposits,
                         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS total_withdrawals
                  FROM savings_transactions`),
      pool.query(`SELECT COUNT(*) AS total,
                         COUNT(*) FILTER (WHERE status = 'disbursed') AS active,
                         COALESCE(SUM(l.principal - COALESCE(r.paid_principal, 0))
                           FILTER (WHERE l.status IN ('disbursed', 'approved')), 0) AS total_outstanding_principal
                  FROM loans l
                  LEFT JOIN (
                    SELECT loan_id, SUM(principal_component) AS paid_principal
                    FROM repayments
                    GROUP BY loan_id
                  ) r ON r.loan_id = l.loan_id`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total_collected FROM repayments`),
    ]);

    const savings = savingsResult.rows[0];
    return res.json({
      members: {
        total: parseInt(membersResult.rows[0].total),
        active: parseInt(membersResult.rows[0].active),
      },
      savings: {
        totalDeposits: parseFloat(savings.total_deposits),
        totalWithdrawals: parseFloat(savings.total_withdrawals),
        netBalance: parseFloat(savings.total_deposits) - parseFloat(savings.total_withdrawals),
      },
      loans: {
        total: parseInt(loansResult.rows[0].total),
        active: parseInt(loansResult.rows[0].active),
        totalOutstandingPrincipal: parseFloat(loansResult.rows[0].total_outstanding_principal),
      },
      repayments: {
        totalCollected: parseFloat(repaymentsResult.rows[0].total_collected),
      },
    });
  } catch (err) {
    logger.error('Dashboard summary error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function getTransactionReport(req, res) {
  const { from, to, type, memberId } = req.query;

  try {
    let query = `SELECT st.*, m.full_name, m.member_number, u.username AS recorded_by_name
                 FROM savings_transactions st
                 JOIN members m ON m.member_id = st.member_id
                 JOIN users u ON u.user_id = st.recorded_by
                 WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (from)     { query += ` AND st.transaction_date >= $${idx++}`; params.push(from); }
    if (to)       { query += ` AND st.transaction_date <= $${idx++}`; params.push(to); }
    if (type)     { query += ` AND st.transaction_type = $${idx++}`; params.push(type); }
    if (memberId) { query += ` AND st.member_id = $${idx++}`; params.push(memberId); }

    query += ' ORDER BY st.transaction_date DESC, st.created_at DESC';

    const result = await pool.query(query, params);
    return res.json({ transactions: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error('Transaction report error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function getAuditLog(req, res) {
  const { from, to, action, entityType } = req.query;

  try {
    let query = `SELECT al.*, u.username
                 FROM audit_logs al
                 LEFT JOIN users u ON u.user_id = al.user_id
                 WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (from)       { query += ` AND al.timestamp >= $${idx++}`; params.push(from); }
    if (to)         { query += ` AND al.timestamp <= $${idx++}`; params.push(to); }
    if (action)     { query += ` AND al.action = $${idx++}`; params.push(action); }
    if (entityType) { query += ` AND al.entity_type = $${idx++}`; params.push(entityType); }

    query += ' ORDER BY al.timestamp DESC LIMIT 500';

    const result = await pool.query(query, params);
    return res.json({ logs: result.rows });
  } catch (err) {
    logger.error('Audit log error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getDashboardSummary, getTransactionReport, getAuditLog };
