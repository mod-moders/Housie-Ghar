import { Router } from 'express';
import { login, logout, getCurrentProfile, updateOwnProfile } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getCurrentProfile);
router.patch('/me', authenticateToken, updateOwnProfile);

export default router;
