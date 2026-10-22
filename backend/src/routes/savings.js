const router = require('express').Router();
const { body } = require('express-validator');
const { getSavingsTransactions, recordSavingsTransaction, reverseSavingsTransaction } = require('../controllers/savingsController');
const { authenticate, authorize, ownDataOnly } = require('../middleware/auth');

const savingsValidation = [
  body('memberId').isUUID(),
  body('amount').isDecimal({ decimal_digits: '0,2' }).custom(v => parseFloat(v) > 0),
  body('transactionType').isIn(['deposit', 'withdrawal', 'adjustment']),
  body('referenceCode').trim().notEmpty(),
];

router.get('/member/:memberId', authenticate, ownDataOnly, getSavingsTransactions);
router.post('/', authenticate, authorize('admin', 'treasurer'), savingsValidation, recordSavingsTransaction);
router.patch('/:transactionId/reverse', authenticate, authorize('admin'), reverseSavingsTransaction);

module.exports = router;
