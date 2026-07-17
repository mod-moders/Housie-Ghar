import { Router } from 'express';
import { getConfig, updateConfig, getPublicConfig, getShareGroups, resetDatabase } from './config.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/public', getPublicConfig);
router.get('/share-groups', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), getShareGroups);
router.get('/', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getConfig);
router.put('/', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), updateConfig);
router.post('/reset-database', authenticateToken, requireRole(['Superadmin']), resetDatabase);

export default router;
