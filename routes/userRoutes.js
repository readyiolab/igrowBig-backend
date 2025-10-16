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
const { authenticateUser } = require('../middleware/authMiddleware');

// Public routes
router.post('/signup', UserSignup);
router.post('/login', UserLogin);
router.post('/forgot-password', ForgotPassword); // Public route for password reset request
router.post('/reset-password', ResetPassword); // Public route for password reset

// Protected routes (require authentication)
router.get('/allusers', authenticateUser, GetAllUsers); // Get all users (admin or authenticated)
router.get('/:id', authenticateUser, GetUser); // Get own user profile
router.post('/change-password', authenticateUser, ChangePassword); // Change own password

// New: Subscription activation (could be from webhook or admin; protect if needed)
router.post('/activate-subscription', authenticateUser, ActivateSubscription); // Or make public if from payment gateway

module.exports = router;