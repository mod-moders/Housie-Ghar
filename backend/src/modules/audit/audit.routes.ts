import { Router } from 'express';
import { getAuditLog } from './audit.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/', authenticateToken, requireRole(['Superadmin', 'Admin']), getAuditLog);

export default router;
