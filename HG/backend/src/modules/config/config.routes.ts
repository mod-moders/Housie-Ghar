import { Router } from 'express';
import { getConfig, updateConfig } from './config.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/', authenticateToken, requireRole(['Superadmin']), getConfig);
router.put('/', authenticateToken, requireRole(['Superadmin']), updateConfig);

export default router;
