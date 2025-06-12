import express from 'express';
import { signup, login, logout, updateProfile, checkAuth, verifyOtp, resendOtp, updateFullname } from '../controllers/auth.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.post('/verify', verifyOtp);
router.post('/resend-otp', resendOtp);

router.put('/update-profile', protectRoute, updateProfile);
router.put('/update-fullname', protectRoute, updateFullname);
router.get('/check', protectRoute, checkAuth);

export default router;
