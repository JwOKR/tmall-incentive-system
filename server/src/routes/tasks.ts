import { Router } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  batchCreateTasks,
  updateTask,
  deleteTask,
  quickOrder,
  refreshAllTaskStatus,
} from '../controllers/taskController';
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('tasks'), getAllTasks);
router.get('/:id', requireViewPermission('tasks'), getTaskById);
router.post('/', requireEditPermission('tasks'), createTask);
router.post('/batch', requireEditPermission('tasks'), batchCreateTasks);
router.put('/:id', requireEditPermission('tasks'), updateTask);
router.delete('/:id', requireEditPermission('tasks'), deleteTask);
router.post('/quick-order', requireEditPermission('tasks'), quickOrder);
router.post('/refresh-status', requireEditPermission('tasks'), refreshAllTaskStatus);

export default router;
