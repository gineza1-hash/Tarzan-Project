const router = require('express').Router();
const { body } = require('express-validator');
const { login, register, getMe } = require('../controllers/authController');
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

router.post('/login', loginValidation, validateRequest, login);
router.post('/register', authenticate, authorize('admin'), registerValidation, validateRequest, register);
router.get('/me', authenticate, getMe);

module.exports = router;
