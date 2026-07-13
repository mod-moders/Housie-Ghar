import { Router } from 'express';
import { login, logout, getCurrentProfile, updateOwnProfile, changeOwnPassword } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getCurrentProfile);
router.patch('/me', authenticateToken, updateOwnProfile);
router.post('/change-password', authenticateToken, changeOwnPassword);

export default router;
