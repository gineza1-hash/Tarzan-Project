const pool = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Write an entry to the audit_logs table
 */
async function writeAuditLog({ userId, action, entityType, entityId, ipAddress, userAgent, beforeState, afterState, reason }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, before_state, after_state, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId || null,
        action,
        entityType,
        entityId || null,
        ipAddress || null,
        userAgent || null,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        reason || null,
      ]
    );
  } catch (err) {
    logger.error('Audit log write failed', { error: err.message });
  }
}

module.exports = { writeAuditLog };
