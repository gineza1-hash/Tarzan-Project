const router = require('express').Router();
const { getDashboardSummary, getTransactionReport, getAuditLog } = require('../controllers/reportsController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/dashboard', authenticate, authorize('admin', 'treasurer'), getDashboardSummary);
router.get('/transactions', authenticate, authorize('admin', 'treasurer'), getTransactionReport);
router.get('/audit', authenticate, authorize('admin'), getAuditLog);

module.exports = router;
