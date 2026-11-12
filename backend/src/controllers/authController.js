// FILE: backend/src/controllers/authController.js  (replaces the existing file)
// CHANGE: added registerMember() and exported it. login/register/getMe are unchanged.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { writeAuditLog } = require('../middleware/audit');
const { sendSuspiciousLoginAlert } = require('../services/smsService');
const logger = require('../utils/logger');

async function login(req, res) {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const result = await pool.query(
      'SELECT user_id, username, email, password_hash, role, member_id, is_active, last_login_ip FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      await recordLoginAttempt({ userId: null, email, ip, userAgent, success: false });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await recordLoginAttempt({ userId: user.user_id, email, ip, userAgent, success: false });
      return res.status(401).json({ error: 'Invalid credentials.' });
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

/**
 * Public self-registration for EXISTING members.
 * The person proves who they are with two facts held on their member record
 * (member number + National ID). The role is always 'member' and is never
 * taken from the request, so nobody can sign themselves up as an admin.
 */
async function registerMember(req, res) {
  const { memberNumber, nationalId, username, email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  // One vague message for every kind of mismatch, so the form cannot be used
  // to discover which member numbers or National IDs exist.
  const NO_MATCH =
    'We could not match those details to a member. Check your member number and National ID, or ask your administrator for help.';

  try {
    const memberResult = await pool.query(
      `SELECT member_id, full_name, status
       FROM members
       WHERE UPPER(member_number) = UPPER($1) AND national_id = $2`,
      [memberNumber, nationalId]
    );
    if (memberResult.rows.length === 0) {
      return res.status(400).json({ error: NO_MATCH });
    }

    const member = memberResult.rows[0];
    if (member.status !== 'active') {
      return res.status(403).json({ error: 'This membership is not active. Please contact your administrator.' });
    }

    const existingForMember = await pool.query('SELECT user_id FROM users WHERE member_id = $1', [member.member_id]);
    if (existingForMember.rows.length > 0) {
      return res.status(409).json({
        error: 'This member already has an account. Please sign in, or ask your administrator for help.',
      });
    }

    const taken = await pool.query('SELECT user_id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists.' });
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
      afterState: { username, email, memberId: member.member_id },
    });
    await recordLoginAttempt({ userId: newUser.user_id, email, ip, userAgent, success: true });

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
    // Two people registering the same email/username at the same moment
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email or username already exists.' });
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

module.exports = { login, register, registerMember, getMe };