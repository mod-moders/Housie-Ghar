import { Router } from 'express';
import { listUsers, createUser, updateUser } from './users.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Staff management (Admin or Superadmin)
router.get('/', authenticateToken, requireRole(['Admin', 'Superadmin']), listUsers);
router.post('/', authenticateToken, requireRole(['Admin', 'Superadmin']), createUser);
router.patch('/:id', authenticateToken, requireRole(['Admin', 'Superadmin']), updateUser);

export default router;
