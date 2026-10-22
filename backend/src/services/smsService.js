const https = require('https');
const querystring = require('querystring');
const logger = require('../utils/logger');

/**
 * Send SMS via Africa's Talking REST API directly (no SDK dependency)
 * Docs: https://developers.africastalking.com/docs/sms/sending
 */
function sendRawSMS(to, message) {
  return new Promise((resolve, reject) => {
    const isSandbox = process.env.AT_USERNAME === 'sandbox';
    const host = isSandbox
      ? 'api.sandbox.africastalking.com'
      : 'api.africastalking.com';

    const body = querystring.stringify({
      username: process.env.AT_USERNAME,
      to: Array.isArray(to) ? to.join(',') : to,
      message,
      from: process.env.AT_SENDER_ID || 'TARZAN',
    });

    const options = {
      hostname: host,
      path: '/version1/messaging',
      method: 'POST',
      headers: {
        apiKey: process.env.AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendSMS(to, message) {
  try {
    const result = await sendRawSMS(to, message);
    return result;
  } catch (err) {
    logger.error('SMS send failed', { error: err.message, to });
  }
}

async function sendSuspiciousLoginAlert({ phone, fullName, ip, userAgent, timestamp }) {
  const message =
    `[TARZAN SACCO] Security Alert!\n` +
    `Hello ${fullName}, a login to your account was detected from an unrecognized device.\n` +
    `IP: ${ip}\n` +
    `Time: ${timestamp}\n` +
    `If this was not you, contact your SACCO administrator immediately.`;
  return sendSMS(phone, message);
}

async function sendDepositNotification({ phone, fullName, amount, balance, reference, date }) {
  const message =
    `[TARZAN SACCO] Transaction Alert\n` +
    `Dear ${fullName}, your savings deposit of RWF ${Number(amount).toLocaleString()} was recorded.\n` +
    `Ref: ${reference} | Date: ${date}\n` +
    `New Balance: RWF ${Number(balance).toLocaleString()}`;
  return sendSMS(phone, message);
}

async function sendRepaymentNotification({ phone, fullName, amount, outstanding, reference, date }) {
  const message =
    `[TARZAN SACCO] Repayment Recorded\n` +
    `Dear ${fullName}, your loan repayment of RWF ${Number(amount).toLocaleString()} was received.\n` +
    `Ref: ${reference} | Date: ${date}\n` +
    `Outstanding Balance: RWF ${Number(outstanding).toLocaleString()}`;
  return sendSMS(phone, message);
}

async function sendLoanApprovalNotification({ phone, fullName, principal, dueDate }) {
  const message =
    `[TARZAN SACCO] Loan Approved\n` +
    `Dear ${fullName}, your loan of RWF ${Number(principal).toLocaleString()} has been approved.\n` +
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
