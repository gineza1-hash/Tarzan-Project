const router = require('express').Router();
const { body } = require('express-validator');
const { getLoanRepayments, recordRepayment } = require('../controllers/repaymentsController');
const { authenticate, authorize, ownDataOnly } = require('../middleware/auth');

const repaymentValidation = [
  body('loanId').isUUID(),
  body('memberId').isUUID(),
  body('amount').isDecimal().custom(v => parseFloat(v) > 0),
  body('principalComponent').isDecimal().custom(v => parseFloat(v) >= 0),
  body('interestComponent').isDecimal().custom(v => parseFloat(v) >= 0),
  body('referenceCode').trim().notEmpty(),
];

router.get('/loan/:loanId', authenticate, getLoanRepayments);
router.post('/', authenticate, authorize('admin', 'treasurer'), repaymentValidation, recordRepayment);

module.exports = router;
