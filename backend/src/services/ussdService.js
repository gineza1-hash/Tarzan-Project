const pool = require('../db/pool');
const crypto = require('crypto');
const { sendDepositNotification } = require('./smsService');
const DAILY_WITHDRAWAL_LIMIT = Number(process.env.USSD_DAILY_WITHDRAWAL_LIMIT_RWF || 50000);

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber).replace(/\D/g, '');
}

function parseDemoDepositAmount(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isDemoDepositsEnabled() {
  return process.env.USSD_DEMO_DEPOSITS === 'true' && process.env.AT_USERNAME === 'sandbox';
}

function parsePositiveAmount(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function demoDepositReference(sessionId, input) {
  const hash = crypto.createHash('sha256').update(`${sessionId}:${input}`).digest('hex');
  return `USSD-DEMO-${hash.slice(0, 40)}`;
}

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
 *   5. Demo Deposit (sandbox only)
 *   6. Request Withdrawal
 *   7. Apply for Loan
 *   0. Exit
 */
async function handleUSSD({ sessionId, serviceCode, phoneNumber, text }) {
  const input = text.trim();
  const steps = input === '' ? [] : input.split('*');

  // Lookup member by phone
  const memberResult = await pool.query(
    `SELECT m.member_id, m.full_name, m.member_number, m.status
     FROM members m
     WHERE regexp_replace(m.phone, '[^0-9]', '', 'g') = $1
       AND m.status = 'active'
     LIMIT 1`,
    [normalizePhoneNumber(phoneNumber)]
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
      (isDemoDepositsEnabled() ? `5. Demo Deposit (sandbox)\n` : '') +
      `6. Request Withdrawal\n` +
      `7. Apply for Loan\n` +
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
       LIMIT 5`,
      [member.member_id]
    );
    if (result.rows.length === 0) {
      return `END No transactions found for your account.`;
    }
    const lines = result.rows
      .map((r) => `${r.transaction_date} | ${r.transaction_type.toUpperCase()} | RWF ${parseFloat(r.amount).toLocaleString('en-RW')}`)
      .join('\n');
    return `END Recent Transactions:\n${lines}`;
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

  // 5 — Demo Deposit (sandbox only)
  if (choice === '5') {
    if (!isDemoDepositsEnabled()) {
      return `END Deposits are not available through USSD yet.`;
    }

    if (steps.length === 1) {
      return `CON DEMO MODE - no real money will be moved.\nEnter deposit amount in RWF:\n0. Cancel`;
    }

    const amountInput = steps[1];
    if (amountInput === '0') {
      return `END Demo deposit cancelled.`;
    }

    const amount = parseDemoDepositAmount(amountInput);
    if (amount === null) {
      return `CON Invalid amount.\nEnter a positive amount in RWF:\n0. Cancel`;
    }

    const referenceCode = demoDepositReference(sessionId, input);
    const existingResult = await pool.query(
      `SELECT amount
       FROM savings_transactions
       WHERE reference_code = $1`,
      [referenceCode]
    );
    if (existingResult.rows.length > 0) {
      return `END DEMO deposit already recorded: RWF ${Number(existingResult.rows[0].amount).toLocaleString('en-RW')}`;
    }

    const adminResult = await pool.query(
      `SELECT user_id
       FROM users
       WHERE role = 'admin' AND is_active = TRUE
       ORDER BY created_at
       LIMIT 1`
    );
    if (adminResult.rows.length === 0) {
      throw new Error('No active admin user available for demo USSD deposit');
    }

    const result = await pool.query(
      `INSERT INTO savings_transactions
         (member_id, amount, transaction_type, transaction_date, recorded_by, reference_code, notes)
       VALUES ($1, $2, 'deposit', CURRENT_DATE, $3, $4, $5)
       RETURNING amount, reference_code`,
      [
        member.member_id,
        amount,
        adminResult.rows[0].user_id,
        referenceCode,
        'USSD demo deposit; no mobile-money payment was processed',
      ]
    );

    const balanceResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type IN ('deposit', 'adjustment') AND is_reversed = FALSE THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS balance
       FROM savings_transactions
       WHERE member_id = $1`,
      [member.member_id]
    );

    await sendDepositNotification({
      phone: phoneNumber,
      fullName: member.full_name,
      amount: Number(result.rows[0].amount),
      balance: Number(balanceResult.rows[0].balance),
      reference: result.rows[0].reference_code,
      date: new Date().toISOString().split('T')[0],
    });

    return (
      `END DEMO deposit recorded\n` +
      `Amount: RWF ${amount.toLocaleString('en-RW')}\n` +
      `New Balance: RWF ${Number(balanceResult.rows[0].balance).toLocaleString('en-RW')}\n` +
      `No real money was moved.`
    );
  }

  // 6 — Withdrawal request; payment remains subject to staff approval.
  if (choice === '6') {
    if (steps.length === 1) {
      return `CON Enter withdrawal amount in RWF:\n0. Cancel`;
    }
    const amountInput = steps[1];
    if (amountInput === '0') return `END Withdrawal request cancelled.`;
    const amount = parsePositiveAmount(amountInput);
    if (amount === null) return `CON Invalid amount.\nEnter a positive amount in RWF:\n0. Cancel`;
    if (amount > DAILY_WITHDRAWAL_LIMIT) {
      return `END The maximum daily withdrawal limit is RWF ${DAILY_WITHDRAWAL_LIMIT.toLocaleString('en-RW')}.`;
    }

    const balanceResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type IN ('deposit', 'adjustment') AND is_reversed = FALSE THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND is_reversed = FALSE THEN amount ELSE 0 END), 0) AS balance
       FROM savings_transactions WHERE member_id = $1`,
      [member.member_id]
    );
    const balance = Number(balanceResult.rows[0].balance);
    if (balance < amount) return `END Insufficient savings balance.`;

    const dailyResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS requested
       FROM withdrawal_requests
       WHERE member_id = $1
         AND status IN ('pending', 'approved')
         AND requested_at::date = CURRENT_DATE`,
      [member.member_id]
    );
    const requestedToday = Number(dailyResult.rows[0].requested);
    if (requestedToday + amount > DAILY_WITHDRAWAL_LIMIT) {
      return `END Your daily withdrawal limit would be exceeded.`;
    }

    const reference = `USSD-WDR-${crypto.createHash('sha256').update(`${sessionId}:${input}`).digest('hex').slice(0, 32)}`;
    const duplicate = await pool.query(
      'SELECT request_id FROM withdrawal_requests WHERE notes = $1',
      [reference]
    );
    if (duplicate.rows.length > 0) return `END Withdrawal request already submitted.`;

    const request = await pool.query(
      `INSERT INTO withdrawal_requests (member_id, amount, notes)
       VALUES ($1, $2, $3)
       RETURNING request_id`,
      [member.member_id, amount, reference]
    );
    return (
      `END Withdrawal request submitted.\n` +
      `Amount: RWF ${amount.toLocaleString('en-RW')}\n` +
      `Request: ${request.rows[0].request_id.slice(0, 8)}\n` +
      `Staff approval is required before payment.`
    );
  }

  // 7 — Loan application; staff approval is required.
  if (choice === '7') {
    if (steps.length === 1) return `CON Enter requested loan amount in RWF:\n0. Cancel`;
    if (steps[1] === '0') return `END Loan application cancelled.`;
    const amount = parsePositiveAmount(steps[1]);
    if (amount === null) return `CON Invalid amount.\nEnter a positive amount in RWF:\n0. Cancel`;
    if (steps.length === 2) return `CON Enter repayment period in months:\n0. Cancel`;
    if (steps[2] === '0') return `END Loan application cancelled.`;
    if (!/^[1-9]\d?$/.test(steps[2])) return `CON Enter a repayment period from 1 to 99 months:\n0. Cancel`;
    const durationMonths = Number(steps[2]);
    if (steps.length === 3) return `CON Enter a short loan purpose:\n0. Cancel`;
    if (steps[3] === '0') return `END Loan application cancelled.`;
    const purpose = steps.slice(3).join(' ').trim();
    if (purpose.length < 3 || purpose.length > 100) return `CON Enter a purpose between 3 and 100 characters:\n0. Cancel`;

    const activeLoan = await pool.query(
      `SELECT loan_id FROM loans WHERE member_id = $1 AND status IN ('pending', 'approved', 'disbursed') LIMIT 1`,
      [member.member_id]
    );
    if (activeLoan.rows.length > 0) return `END You already have an active or pending loan.`;
    const admin = await pool.query(
      `SELECT user_id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY created_at LIMIT 1`
    );
    if (admin.rows.length === 0) throw new Error('No active admin user available for USSD loan application');

    const application = await pool.query(
      `INSERT INTO loans
         (member_id, principal, interest_method, interest_rate, duration_months, status, recorded_by, notes)
       VALUES ($1, $2, 'reducing_balance', 0, $3, 'pending', $4, $5)
       RETURNING loan_id`,
      [member.member_id, amount, durationMonths, admin.rows[0].user_id, `USSD application purpose: ${purpose}`]
    );
    return `END Loan application submitted.\nApplication: ${application.rows[0].loan_id.slice(0, 8)}\nStaff approval is required.`;
  }

  // 0 — Exit
  if (choice === '0') {
    return `END Thank you for using Tarzan SACCO. Goodbye!`;
  }

  return `END Invalid option. Please try again.`;
}

module.exports = {
  handleUSSD,
  normalizePhoneNumber,
  parseDemoDepositAmount,
  parsePositiveAmount,
  isDemoDepositsEnabled,
};
