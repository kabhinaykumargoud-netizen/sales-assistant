const router = require('express').Router();
const { register, login, me, updateProfile, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
router.post('/register',        register);
router.post('/login',           login);
router.get('/me',               authenticate, me);
router.patch('/profile',        authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);
module.exports = router;
