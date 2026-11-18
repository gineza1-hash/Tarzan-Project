// FILE: backend/src/routes/auth.js  (replaces the routes file, NOT middleware/auth.js)
// CHANGE: added the public POST /api/auth/register-member route and its validation.

const router = require('express').Router();
const { body } = require('express-validator');
const { login, register, registerMember, getMe } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
];

const registerValidation = [
  body('username').trim().isLength({ min: 3 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(['admin', 'treasurer', 'member']),
];

// Public: an existing member creates their own login
const registerMemberValidation = [
  body('memberNumber').trim().notEmpty().isLength({ max: 20 }),
  body('nationalId').trim().notEmpty().isLength({ max: 30 }),
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[A-Za-z0-9._-]+$/)
    .withMessage('Username can use letters, numbers, dots, dashes and underscores only (at least 3 characters).'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters.'),
];

router.post('/login', loginValidation, validateRequest, login);
router.post('/register', authenticate, authorize('admin'), registerValidation, validateRequest, register);
router.post('/register-member', registerMemberValidation, validateRequest, registerMember);
router.get('/me', authenticate, getMe);

module.exports = router;