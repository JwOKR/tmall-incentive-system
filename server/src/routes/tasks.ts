import { Router } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  batchCreateTasks,
  updateTask,
  deleteTask,
  quickOrder,
} from '../controllers/taskController';

const router = Router();

router.get('/', getAllTasks);
router.get('/:id', getTaskById);
router.post('/', createTask);
router.post('/batch', batchCreateTasks);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);
router.post('/quick-order', quickOrder);

export default router;