import { Router } from 'express';
import { requireAuth, authorize } from '../middleware/auth.js';
import { overview, listUsers, setRole } from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth, authorize('admin'));
router.get('/overview', overview);
router.get('/users', listUsers);
router.patch('/users/:id/role', setRole);
export default router;
