// FILE: backend/src/routes/members.js  (replaces the existing file)
// CHANGE: the member number is no longer required in the create request (it is generated).

const router = require('express').Router();
const { body } = require('express-validator');
const { getAllMembers, getMemberById, createMember, updateMember, getMemberSummary } = require('../controllers/membersController');
const { authenticate, authorize, ownDataOnly } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const createValidation = [
  body('fullName').trim().isLength({ min: 2 }),
  body('phone').optional().isMobilePhone(),
  body('email').optional().isEmail().normalizeEmail(),
];

router.get('/', authenticate, authorize('admin', 'treasurer'), getAllMembers);
router.post('/', authenticate, authorize('admin', 'treasurer'), createValidation, validateRequest, createMember);
router.get('/:memberId', authenticate, ownDataOnly, getMemberById);
router.patch('/:memberId', authenticate, authorize('admin', 'treasurer'), updateMember);
router.get('/:memberId/summary', authenticate, ownDataOnly, getMemberSummary);

module.exports = router;