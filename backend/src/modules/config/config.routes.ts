import { Router } from 'express';
import { getConfig, updateConfig, getPublicConfig } from './config.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/public', getPublicConfig);
router.get('/', authenticateToken, requireRole(['Superadmin', 'Admin']), getConfig);
router.put('/', authenticateToken, requireRole(['Superadmin', 'Admin']), updateConfig);

export default router;
