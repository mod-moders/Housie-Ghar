import { Router } from 'express';
import { listThemes, setActiveTheme } from './themes.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/', listThemes);
router.put('/active', authenticateToken, requireRole(['Superadmin']), setActiveTheme);

export default router;
