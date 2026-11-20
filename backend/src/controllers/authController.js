// FILE: backend/src/controllers/authController.js  (replaces the existing file)
// CHANGE: added requestRegistrationCode() and registerMember() (self-registration: details first, then an
//         SMS code; email optional; the account is named after the member, e.g. "Sonia Keza").
//         login() now accepts an email OR the phone number on the member's record.
//         register/getMe are unchanged.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendSuspiciousLoginAlert, sendSMS } = require('../services/smsService');
const logger = require('../utils/logger');

/** Accounts that match what was typed: an email, or a phone number from the member's record. */
async function findLoginCandidates(identifier) {
  if (identifier.includes('@')) {
    const result = await pool.query(
      'SELECT user_id, username, email, password_hash, role, member_id, is_active, last_login_ip FROM users WHERE email = $1',
      [identifier]
    );
    return result.rows;
  }

  const digits = lastNineDigits(identifier);
  if (digits.length < 9) return [];
  const result = await pool.query(
    `SELECT u.user_id, u.username, u.email, u.password_hash, u.role, u.member_id, u.is_active, u.last_login_ip
     FROM users u
     JOIN members m ON m.member_id = u.member_id
     WHERE RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 9) = $1`,
    [digits]
  );
  return result.rows;
}

async function login(req, res) {
  const { password } = req.body;
  // Members can sign in with the phone number on their member record instead of an email.
  // "email" is still accepted so older pages keep working.
  const identifier = String(req.body.identifier ?? req.body.email ?? '').trim();
  const email = identifier; // what is written to login_attempts
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const candidates = await findLoginCandidates(identifier);

    if (candidates.length === 0) {
      await recordLoginAttempt({ userId: null, email, ip, userAgent, success: false });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    let user;
    if (candidates.length === 1) {
      user = candidates[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        await recordLoginAttempt({ userId: user.user_id, email, ip, userAgent, success: false });
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
    } else {
      // Two accounts share this phone number (a family, for example).
      // The password tells them apart, and a wrong password gives the same vague answer as ever.
      const matches = [];
      for (const candidate of candidates.filter((c) => c.is_active)) {
        if (await bcrypt.compare(password, candidate.password_hash)) matches.push(candidate);
      }
      if (matches.length !== 1) {
        await recordLoginAttempt({ userId: null, email, ip, userAgent, success: false });
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      user = matches[0];
    }

    // Suspicious login detection: new IP address
    const isSuspicious = user.last_login_ip && user.last_login_ip !== ip;

    if (isSuspicious) {
      await recordLoginAttempt({ userId: user.user_id, email, ip, userAgent, success: true, flagged: true });

      // Fetch member phone for SMS alert
      if (user.member_id) {
        const memberResult = await pool.query(
          'SELECT full_name, phone FROM members WHERE member_id = $1',
          [user.member_id]
        );
        const member = memberResult.rows[0];
        if (member?.phone) {
          await sendSuspiciousLoginAlert({
            phone: member.phone,
            fullName: member.full_name,
            ip,
            userAgent,
            timestamp: new Date().toISOString(),
          });
        }
      }

      await writeAuditLog({
        userId: user.user_id,
        action: 'SUSPICIOUS_LOGIN',
        entityType: 'users',
        entityId: user.user_id,
        ipAddress: ip,
        userAgent,
        reason: `Login from new IP: ${ip} (previous: ${user.last_login_ip})`,
      });
    } else {
      await recordLoginAttempt({ userId: user.user_id, email, ip, userAgent, success: true });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $1 WHERE user_id = $2',
      [ip, user.user_id]
    );

    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        memberId: user.member_id,
      },
      suspicious: isSuspicious,
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function register(req, res) {
  const { username, email, password, role, memberId } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, member_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, username, email, role, member_id, created_at`,
      [username, email, passwordHash, role || 'member', memberId || null]
    );

    const newUser = result.rows[0];

    await writeAuditLog({
      userId: req.user?.user_id || null,
      action: 'CREATE_USER',
      entityType: 'users',
      entityId: newUser.user_id,
      ipAddress: ip,
      afterState: { username, email, role },
    });

    return res.status(201).json({ user: newUser });
  } catch (err) {
    logger.error('Register error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// =====================================================================
// Member self-registration with an SMS verification code
//
//   Step 1  POST /api/auth/register-member/request-code
//           National ID + phone number  ->  a 6-digit code is texted to the
//           phone number on the member's record (member numbers are
//           system-generated, so members are not asked for theirs)
//   Step 2  POST /api/auth/register-member
//           code + username/email/password  ->  the login is created
//
// No new tables. The code itself is never stored: it travels inside a signed,
// 10-minute token only as an HMAC hash. Send and wrong-guess counts are kept
// in audit_logs, which also gives admins a trail.
// =====================================================================
const REG_PURPOSE = 'member-register';
const CODE_TTL_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const MAX_WRONG_CODES = 5; // per member, per 15 minutes

// One vague message for every kind of mismatch, so the form cannot be used to
// discover which member numbers or National IDs exist.
const NO_MATCH =
  'We could not match those details to a member. Check your National ID and phone number, or ask your administrator for help.';

/** Last 9 digits, so 0788 123 456, +250788123456 and 788123456 all count as the same number. */
function lastNineDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-9);
}

/** A different key from login tokens, so the two kinds can never be swapped. */
function registrationSecret() {
  return `${process.env.JWT_SECRET}:${REG_PURPOSE}`;
}

function hashCode(memberId, code) {
  return crypto.createHmac('sha256', registrationSecret()).update(`${memberId}:${code}`).digest('hex');
}

/**
 * TESTING ONLY. With SMS_DEV_ECHO=true the code is also written to the backend
 * console and returned to the browser, so registration can be tried without a
 * working SMS account. It is ignored whenever NODE_ENV is 'production'.
 */
function devEcho() {
  return process.env.SMS_DEV_ECHO === 'true' && process.env.NODE_ENV !== 'production';
}

function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length <= 6) return '••••' + p.slice(-2);
  return p.slice(0, 4) + '•'.repeat(p.length - 7) + p.slice(-3);
}

/** Africa's Talking answers statusCode 101 ("Sent") for each accepted recipient. */
function smsAccepted(result) {
  const recipients = result && result.SMSMessageData && result.SMSMessageData.Recipients;
  return Array.isArray(recipients) && recipients.some((r) => r.statusCode === 101 || r.status === 'Success');
}

/** Written directly (not swallowed like writeAuditLog) because the limits depend on it. */
async function logRegistrationEvent(action, memberId, ip, userAgent) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent)
     VALUES (NULL, $1, 'members', $2, $3, $4)`,
    [action, memberId, ip, userAgent]
  );
}

/** "SONIA KEZA GENDANEZA" -> "Sonia Keza Gendaneza", "jean-claude o'neil" -> "Jean-Claude O'Neil" */
function tidyName(fullName) {
  return String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (match, separator, letter) => separator + letter.toUpperCase());
}

/**
 * Self-registered logins are named after the person ("Sonia Keza"), so nobody has to invent a
 * username and the account shows a real name. Names are not unique, so when two people share one
 * a number is added ("Sonia Keza 2"). The member number stays the member's ID and is not used here.
 */
async function pickUsername(member) {
  const base = (tidyName(member.full_name) || String(member.member_number)).slice(0, 44).trim();
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base} ${i + 1}`;
    const taken = await pool.query('SELECT user_id FROM users WHERE LOWER(username) = LOWER($1)', [candidate]);
    if (taken.rows.length === 0) return candidate;
  }
  return null;
}

async function requestRegistrationCode(req, res) {
  const { nationalId, phone } = req.body;
  const email = req.body.email ? String(req.body.email).trim() : null;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    // The National ID is unique, so it finds exactly one member. The phone number the
    // person types must be the one on that member's record (in any common format).
    const typedPhone = lastNineDigits(phone);
    if (typedPhone.length < 9) {
      return res.status(400).json({ error: NO_MATCH });
    }

    const memberResult = await pool.query(
      `SELECT member_id, member_number, full_name, phone, status
       FROM members
       WHERE national_id = $1
         AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 9) = $2`,
      [nationalId, typedPhone]
    );
    if (memberResult.rows.length === 0) {
      return res.status(400).json({ error: NO_MATCH });
    }

    const member = memberResult.rows[0];
    if (member.status !== 'active') {
      return res.status(403).json({ error: 'This membership is not active. Please contact your administrator.' });
    }

    const existing = await pool.query('SELECT user_id FROM users WHERE member_id = $1', [member.member_id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'This member already has an account. Please sign in, or ask your administrator for help.',
      });
    }

    if (email) {
      const emailTaken = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
      if (emailTaken.rows.length > 0) {
        return res.status(409).json({ error: 'That email is already used by another account. Use a different one, or leave it empty.' });
      }
    }

    // Protect the member's phone from being flooded with messages
    const history = await pool.query(
      `SELECT COUNT(*)::int AS recent,
              EXTRACT(EPOCH FROM (NOW() - MAX(timestamp)))::int AS seconds_since_last
       FROM audit_logs
       WHERE action = 'REGISTER_CODE_SENT' AND entity_id = $1 AND timestamp > NOW() - INTERVAL '1 hour'`,
      [member.member_id]
    );
    const { recent, seconds_since_last: sinceLast } = history.rows[0];
    if (recent >= MAX_CODES_PER_HOUR) {
      return res.status(429).json({ error: 'Too many codes were requested. Please try again in an hour.' });
    }
    if (sinceLast !== null && sinceLast < RESEND_SECONDS) {
      return res.status(429).json({
        error: `Please wait ${RESEND_SECONDS - sinceLast} seconds before asking for another code.`,
      });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await logRegistrationEvent('REGISTER_CODE_SENT', member.member_id, ip, userAgent);

    const sms = await sendSMS(
      member.phone,
      `[TARZAN SACCO] Your verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you did not ask for it, ignore this message.`
    );
    if (!smsAccepted(sms) && !devEcho()) {
      return res.status(502).json({ error: 'We could not send the SMS right now. Please try again shortly.' });
    }
    if (devEcho()) {
      logger.info(`[DEV] Registration code for ${member.member_number}: ${code}`);
    }

    const verificationToken = jwt.sign(
      { purpose: REG_PURPOSE, memberId: member.member_id, codeHash: hashCode(member.member_id, code) },
      registrationSecret(),
      { expiresIn: `${CODE_TTL_MINUTES}m` }
    );

    const body = {
      verificationToken,
      phoneHint: maskPhone(member.phone),
      expiresInMinutes: CODE_TTL_MINUTES,
    };
    if (devEcho()) body.devCode = code;
    return res.json(body);
  } catch (err) {
    logger.error('Registration code error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * Creates the login once the SMS code checks out.
 * The role is always 'member' and is never read from the request.
 */
async function registerMember(req, res) {
  const { verificationToken, code, password } = req.body;
  const email = req.body.email ? String(req.body.email).trim() : null; // optional
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  let payload;
  try {
    payload = jwt.verify(verificationToken, registrationSecret());
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(400).json({
      error: expired
        ? 'This code has expired. Please ask for a new one.'
        : 'This verification is not valid. Please start again.',
    });
  }
  if (payload.purpose !== REG_PURPOSE || !payload.memberId) {
    return res.status(400).json({ error: 'This verification is not valid. Please start again.' });
  }

  try {
    // Only a few wrong guesses per member, so a 6-digit code cannot be brute-forced
    const failures = await pool.query(
      `SELECT COUNT(*)::int AS failures
       FROM audit_logs
       WHERE action = 'REGISTER_CODE_FAILED' AND entity_id = $1 AND timestamp > NOW() - INTERVAL '15 minutes'`,
      [payload.memberId]
    );
    if (failures.rows[0].failures >= MAX_WRONG_CODES) {
      return res.status(429).json({ error: 'Too many incorrect codes. Please wait 15 minutes, then ask for a new code.' });
    }

    const expected = Buffer.from(String(payload.codeHash), 'hex');
    const given = Buffer.from(hashCode(payload.memberId, code), 'hex');
    const codeOk = expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!codeOk) {
      await logRegistrationEvent('REGISTER_CODE_FAILED', payload.memberId, ip, userAgent);
      return res.status(400).json({ error: 'That code is not correct.' });
    }

    const memberResult = await pool.query('SELECT member_id, member_number, full_name, status FROM members WHERE member_id = $1', [payload.memberId]);
    const member = memberResult.rows[0];
    if (!member || member.status !== 'active') {
      return res.status(403).json({ error: 'This membership is not active. Please contact your administrator.' });
    }

    const existingForMember = await pool.query('SELECT user_id FROM users WHERE member_id = $1', [member.member_id]);
    if (existingForMember.rows.length > 0) {
      return res.status(409).json({
        error: 'This member already has an account. Please sign in, or ask your administrator for help.',
      });
    }

    if (email) {
      const emailTaken = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
      if (emailTaken.rows.length > 0) {
        return res.status(409).json({ error: 'That email is already used by another account. Use a different one, or leave it empty.' });
      }
    }

    const username = await pickUsername(member);
    if (!username) {
      return res.status(409).json({ error: 'We could not create a username for you. Please ask your administrator for help.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, member_id, last_login_at, last_login_ip)
       VALUES ($1, $2, $3, 'member', $4, NOW(), $5)
       RETURNING user_id, username, email, role, member_id`,
      [username, email, passwordHash, member.member_id, ip]
    );
    const newUser = result.rows[0];

    await writeAuditLog({
      userId: newUser.user_id,
      action: 'SELF_REGISTER',
      entityType: 'users',
      entityId: newUser.user_id,
      ipAddress: ip,
      userAgent,
      afterState: { username, email, memberId: member.member_id, verifiedBy: 'sms' },
    });
    await recordLoginAttempt({ userId: newUser.user_id, email: email || username, ip, userAgent, success: true });

    // Sign the new member straight in, exactly like a normal login.
    const token = jwt.sign(
      { userId: newUser.user_id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      token,
      user: {
        userId: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        memberId: newUser.member_id,
      },
      suspicious: false,
    });
  } catch (err) {
    // Two people registering the same email at the same moment
    if (err.code === '23505') {
      const onEmail = String(err.constraint || '').includes('email');
      return res.status(409).json({
        error: onEmail
          ? 'That email is already used by another account. Use a different one, or leave it empty.'
          : 'We could not create the account just now. Please try again.',
      });
    }
    // The database still insists on an email: run the one-time update (see make-email-optional.js)
    if (err.code === '23502' && err.column === 'email') {
      return res.status(400).json({
        error: 'Creating an account without an email needs a one-time database update. Please enter an email for now, or ask your administrator.',
      });
    }
    logger.error('Member registration error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function getMe(req, res) {
  return res.json({ user: req.user });
}

async function recordLoginAttempt({ userId, email, ip, userAgent, success, flagged = false }) {
  try {
    await pool.query(
      `INSERT INTO login_attempts (user_id, email, ip_address, user_agent, success, flagged)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, email, ip, userAgent, success, flagged]
    );
  } catch (err) {
    logger.error('Failed to record login attempt', { error: err.message });
  }
}

module.exports = { login, register, requestRegistrationCode, registerMember, getMe };