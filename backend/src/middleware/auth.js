const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT user_id, username, email, role, member_id, is_active FROM users WHERE user_id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Account not found or deactivated.' });
    }
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Role-based access control — server-side enforced
 * @param {...string} roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

/**
 * Members can only access their own data unless they are admin/treasurer
 */
function ownDataOnly(req, res, next) {
  const { role, member_id } = req.user;
  if (role === 'admin' || role === 'treasurer') return next();

  const requestedMemberId = req.params.memberId || req.body.member_id;
  if (requestedMemberId && requestedMemberId !== member_id) {
    return res.status(403).json({ error: 'Access denied. You can only view your own records.' });
  }
  next();
}

module.exports = { authenticate, authorize, ownDataOnly };
