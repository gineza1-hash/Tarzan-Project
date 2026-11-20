// FILE: backend/src/routes/auth.js  (replaces the ROUTES file, NOT middleware/auth.js)
// CHANGE: sign-in accepts an email OR a phone number; added the two public member-registration routes.

const router = require('express').Router();
const { body } = require('express-validator');
const { login, register, requestRegistrationCode, registerMember, getMe } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

// Older pages send "email"; newer ones send "identifier" (an email OR a phone number)
function acceptLegacyEmail(req, res, next) {
  if (req.body && req.body.identifier === undefined && req.body.email !== undefined) {
    req.body.identifier = req.body.email;
  }
  next();
}

const loginValidation = [
  body('identifier').trim().notEmpty().withMessage('Enter your email or phone number.').isLength({ max: 100 }),
  body('identifier').if((value) => String(value).includes('@')).isEmail().normalizeEmail(),
  body('identifier')
    .if((value) => !String(value).includes('@'))
    .matches(/^[+0-9 ()-]{9,20}$/)
    .withMessage('Enter your email or the phone number on your account.'),
  body('password').isLength({ min: 6 }),
];

const registerValidation = [
  body('username').trim().isLength({ min: 3 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(['admin', 'treasurer', 'member']),
];

// Public: an existing member creates their own login, verified by an SMS code
const requestCodeValidation = [
  body('nationalId').trim().notEmpty().isLength({ max: 30 }),
  body('phone')
    .trim()
    .matches(/^[+0-9 ()-]{9,20}$/)
    .withMessage('Enter the phone number registered with the SACCO.'),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
];

const registerMemberValidation = [
  body('verificationToken').isString().notEmpty(),
  body('code').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code from the SMS.'),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters.'),
];

router.post('/login', acceptLegacyEmail, loginValidation, validateRequest, login);
router.post('/register', authenticate, authorize('admin'), registerValidation, validateRequest, register);
router.post('/register-member/request-code', requestCodeValidation, validateRequest, requestRegistrationCode);
router.post('/register-member', registerMemberValidation, validateRequest, registerMember);
router.get('/me', authenticate, getMe);

module.exports = router;