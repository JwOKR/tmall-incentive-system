import { Router } from 'express';
import {
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  batchCreateOrders,
} from '../controllers/orderController';

const router = Router();

router.get('/', getAllOrders);
router.get('/:id', getOrderById);
router.put('/:id', updateOrder);
router.delete('/:id', deleteOrder);
router.post('/batch', batchCreateOrders);

export default router;