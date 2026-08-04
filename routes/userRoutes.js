const express = require('express');
const router = express.Router();
const {
  UserSignup,
  ActivateSubscription, // Added
  UserLogin,
  GetAllUsers,
  ForgotPassword,
  ResetPassword,
  ChangePassword,
  GetUser
} = require('../controllers/userController'); // Updated to match new controller naming
const { authenticateUser, authenticateAdmin } = require('../middleware/authMiddleware');

// Public routes
router.post('/signup', UserSignup);
router.post('/login', UserLogin);
router.post('/forgot-password', ForgotPassword); // Public route for password reset request
router.post('/reset-password', ResetPassword); // Public route for password reset

// Protected routes (require authentication)
router.get('/allusers', authenticateAdmin, GetAllUsers); // Admin only
router.get('/:id', authenticateUser, GetUser); // Get own user profile
router.post('/change-password', authenticateUser, ChangePassword); // Change own password

// Subscription activation — uses authenticated user id from JWT
router.post('/activate-subscription', authenticateUser, ActivateSubscription);

module.exports = router;