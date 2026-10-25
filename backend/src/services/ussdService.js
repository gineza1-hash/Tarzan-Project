const pool = require('../db/pool');

/**
 * USSD Menu Flow:
 * CON = continue session (show menu)
 * END = end session (final response)
 *
 * Main Menu:
 *   1. Check Savings Balance
 *   2. View Last 3 Transactions
 *   3. Check Loan Balance
 *   4. View Repayment History
 *   0. Exit
 */
async function handleUSSD({ sessionId, serviceCode, phoneNumber, text }) {
  const input = text.trim();
  const steps = input === '' ? [] : input.split('*');

  // Lookup member by phone
  const memberResult = await pool.query(
    `SELECT m.member_id, m.full_name, m.member_number, m.status
     FROM members m
     WHERE m.phone = $1 AND m.status = 'active'
     LIMIT 1`,
    [phoneNumber]
  );

  if (memberResult.rows.length === 0) {
    return `END Sorry, your phone number is not registered with this SACCO. Please contact your administrator.`;
  }

  const member = memberResult.rows[0];

  // Root menu
  if (steps.length === 0) {
    return (
      `CON Welcome to Tarzan SACCO\n` +
      `Hello ${member.full_name.split(' ')[0]}!\n` +
      `1. Savings Balance\n` +
      `2. Last 3 Transactions\n` +
      `3. Loan Balance\n` +
      `4. Repayment History\n` +
      `0. Exit`
    );
  }

  const choice = steps[0];

  // 1 — Savings Balance
  if (choice === '1') {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type IN ('deposit', 'adjustment') AND is_reversed = FALSE THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS balance
       FROM savings_transactions
       WHERE member_id = $1`,
      [member.member_id]
    );
    const balance = parseFloat(result.rows[0].balance).toLocaleString('en-RW');
    return `END Savings Balance\nMember: ${member.full_name}\nNo: ${member.member_number}\nBalance: RWF ${balance}`;
  }

  // 2 — Last 3 Transactions
  if (choice === '2') {
    const result = await pool.query(
      `SELECT transaction_type, amount, transaction_date, reference_code
       FROM savings_transactions
       WHERE member_id = $1 AND is_reversed = FALSE
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 3`,
      [member.member_id]
    );
    if (result.rows.length === 0) {
      return `END No transactions found for your account.`;
    }
    const lines = result.rows
      .map((r) => `${r.transaction_date} | ${r.transaction_type.toUpperCase()} | RWF ${parseFloat(r.amount).toLocaleString('en-RW')}`)
      .join('\n');
    return `END Last Transactions:\n${lines}`;
  }

  // 3 — Loan Balance
  if (choice === '3') {
    const result = await pool.query(
      `SELECT l.loan_id, l.principal, l.status, l.due_date,
              COALESCE(SUM(r.principal_component), 0) AS paid_principal
       FROM loans l
       LEFT JOIN repayments r ON r.loan_id = l.loan_id
       WHERE l.member_id = $1 AND l.status IN ('disbursed', 'approved')
       GROUP BY l.loan_id
       ORDER BY l.created_at DESC
       LIMIT 1`,
      [member.member_id]
    );
    if (result.rows.length === 0) {
      return `END You have no active loans.`;
    }
    const loan = result.rows[0];
    const outstanding = parseFloat(loan.principal) - parseFloat(loan.paid_principal);
    return (
      `END Active Loan\n` +
      `Principal: RWF ${parseFloat(loan.principal).toLocaleString('en-RW')}\n` +
      `Outstanding: RWF ${outstanding.toLocaleString('en-RW')}\n` +
      `Due: ${loan.due_date}\n` +
      `Status: ${loan.status.toUpperCase()}`
    );
  }

  // 4 — Repayment History
  if (choice === '4') {
    const result = await pool.query(
      `SELECT r.amount, r.paid_at, r.reference_code
       FROM repayments r
       WHERE r.member_id = $1
       ORDER BY r.paid_at DESC
       LIMIT 3`,
      [member.member_id]
    );
    if (result.rows.length === 0) {
      return `END No repayments found.`;
    }
    const lines = result.rows
      .map((r) => `${r.paid_at} | RWF ${parseFloat(r.amount).toLocaleString('en-RW')}`)
      .join('\n');
    return `END Last Repayments:\n${lines}`;
  }

  // 0 — Exit
  if (choice === '0') {
    return `END Thank you for using Tarzan SACCO. Goodbye!`;
  }

  return `END Invalid option. Please try again.`;
}

module.exports = { handleUSSD };
