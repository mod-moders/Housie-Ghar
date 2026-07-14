import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser, designateCfo } from './users.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Staff management (Financial Admin or Superadmin)
router.get('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), listUsers);
router.post('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), createUser);
router.patch('/:id', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), updateUser);
router.delete('/:id', authenticateToken, requireRole(['Superadmin']), deleteUser);

// CFO designation — Superadmin only
router.patch('/:id/cfo', authenticateToken, requireRole(['Superadmin']), designateCfo);

export default router;
