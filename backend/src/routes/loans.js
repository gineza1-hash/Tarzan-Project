const router = require('express').Router();
const { body } = require('express-validator');
const { getMemberLoans, createLoan, approveLoan, disburseLoan, getLoanSchedule } = require('../controllers/loansController');
const { authenticate, authorize, ownDataOnly } = require('../middleware/auth');

const loanValidation = [
  body('memberId').isUUID(),
  body('principal').isDecimal().custom(v => parseFloat(v) > 0),
  body('interestMethod').isIn(['flat', 'reducing_balance', 'simple']),
  body('interestRate').isDecimal().custom(v => parseFloat(v) >= 0),
  body('durationMonths').isInt({ min: 1 }),
];

router.get('/member/:memberId', authenticate, ownDataOnly, getMemberLoans);
router.post('/', authenticate, authorize('admin', 'treasurer'), loanValidation, createLoan);
router.patch('/:loanId/approve', authenticate, authorize('admin'), approveLoan);
router.patch('/:loanId/disburse', authenticate, authorize('admin', 'treasurer'), disburseLoan);
router.get('/:loanId/schedule', authenticate, getLoanSchedule);

module.exports = router;
