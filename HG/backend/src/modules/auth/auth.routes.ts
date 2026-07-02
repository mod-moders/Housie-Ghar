import { Router } from 'express';
import { login, logout, getCurrentProfile, changePassword } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getCurrentProfile);
router.post('/change-password', authenticateToken, changePassword);

export default router;
