const router = require('express').Router();
const { listWithdrawalRequests, reviewWithdrawal, completeWithdrawal } = require('../controllers/withdrawalController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, listWithdrawalRequests);
router.patch('/:requestId/review', authenticate, authorize('admin', 'treasurer'), reviewWithdrawal);
router.patch('/:requestId/complete', authenticate, authorize('admin', 'treasurer'), completeWithdrawal);

module.exports = router;
