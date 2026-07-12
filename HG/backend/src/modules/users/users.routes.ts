import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser, designateCfo } from './users.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Staff management (Admin or Superadmin)
router.get('/', authenticateToken, requireRole(['Admin', 'Superadmin']), listUsers);
router.post('/', authenticateToken, requireRole(['Admin', 'Superadmin']), createUser);
router.patch('/:id', authenticateToken, requireRole(['Admin', 'Superadmin']), updateUser);

// Hard delete — Superadmin only; accounts with history 409 (suspend instead)
router.delete('/:id', authenticateToken, requireRole(['Superadmin']), deleteUser);

// CFO designation — Superadmin only
router.patch('/:id/cfo', authenticateToken, requireRole(['Superadmin']), designateCfo);

export default router;
