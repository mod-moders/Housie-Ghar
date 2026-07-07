import { Router } from 'express';
import { getConfig, getPublicConfig, updateConfig } from './config.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/public', getPublicConfig);
router.get('/', authenticateToken, requireRole(['Superadmin']), getConfig);
router.put('/', authenticateToken, requireRole(['Superadmin']), updateConfig);

export default router;
