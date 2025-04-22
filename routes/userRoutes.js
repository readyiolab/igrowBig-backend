const express = require('express');
const router = express.Router();
const {
  UserSignup,
  UserLogin,
  GetAllUsers,
  ForgotPassword,   
ResetPassword,
  ChangePassword,
  GetUser
} = require('../controllers/userController'); // Updated to match new controller naming
const { authenticateUser } = require('../middleware/authMiddleware');

router.post('/signup', UserSignup);
router.post('/login', UserLogin);

// Protected routes
router.get('/:id', authenticateUser, GetUser);
router.get('/allusers', authenticateUser, GetAllUsers); // Get all users
router.post('/forgot-password', ForgotPassword); // Public route for password reset request
router.post('/reset-password', ResetPassword); // Public route for password reset
router.post('/change-password', authenticateUser, ChangePassword); // Protected route for changing password

module.exports = router;