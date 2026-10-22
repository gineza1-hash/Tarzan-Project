const AfricasTalking = require('africastalking');

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

const sms = at.SMS;

/**
 * Send an SMS message
 * @param {string|string[]} to - Phone number(s) in international format e.g. +250788000000
 * @param {string} message
 */
async function sendSMS(to, message) {
  const recipients = Array.isArray(to) ? to : [to];
  try {
    const result = await sms.send({
      to: recipients,
      message,
      from: process.env.AT_SENDER_ID || 'TARZAN',
    });
    return result;
  } catch (err) {
    // Log but don't crash the main flow
    const logger = require('../utils/logger');
    logger.error('SMS send failed', { error: err.message, to });
  }
}

/**
 * Alert admin/member of a suspicious (unknown device/IP) login
 */
async function sendSuspiciousLoginAlert({ phone, fullName, ip, userAgent, timestamp }) {
  const message =
    `[TARZAN SACCO] Security Alert!\n` +
    `Hello ${fullName}, a login to your account was detected from an unrecognized device.\n` +
    `IP: ${ip}\n` +
    `Time: ${timestamp}\n` +
    `If this was not you, contact your SACCO administrator immediately.`;

  return sendSMS(phone, message);
}

/**
 * Notify member of a savings deposit
 */
async function sendDepositNotification({ phone, fullName, amount, balance, reference, date }) {
  const message =
    `[TARZAN SACCO] Transaction Alert\n` +
    `Dear ${fullName}, your savings deposit of RWF ${amount.toLocaleString()} was recorded.\n` +
    `Ref: ${reference} | Date: ${date}\n` +
    `New Balance: RWF ${balance.toLocaleString()}`;

  return sendSMS(phone, message);
}

/**
 * Notify member of a loan repayment recorded
 */
async function sendRepaymentNotification({ phone, fullName, amount, outstanding, reference, date }) {
  const message =
    `[TARZAN SACCO] Repayment Recorded\n` +
    `Dear ${fullName}, your loan repayment of RWF ${amount.toLocaleString()} was received.\n` +
    `Ref: ${reference} | Date: ${date}\n` +
    `Outstanding Balance: RWF ${outstanding.toLocaleString()}`;

  return sendSMS(phone, message);
}

/**
 * Notify member of loan approval
 */
async function sendLoanApprovalNotification({ phone, fullName, principal, dueDate }) {
  const message =
    `[TARZAN SACCO] Loan Approved\n` +
    `Dear ${fullName}, your loan of RWF ${principal.toLocaleString()} has been approved.\n` +
    `Due Date: ${dueDate}\n` +
    `Please contact your treasurer for disbursement details.`;

  return sendSMS(phone, message);
}

module.exports = {
  sendSMS,
  sendSuspiciousLoginAlert,
  sendDepositNotification,
  sendRepaymentNotification,
  sendLoanApprovalNotification,
};
