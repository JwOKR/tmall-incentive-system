import { Router } from 'express';
import {
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  batchCreateOrders,
  batchUpdateOrders,
  batchUpdateStatus,
} from '../controllers/orderController';

const router = Router();

// 批量操作路由（必须在 /:id 之前注册，否则 'batch' 会被当作 id）
router.post('/batch', batchCreateOrders);
router.put('/batch/update', batchUpdateOrders);
router.put('/batch/status', batchUpdateStatus);

// 单条操作路由
router.get('/', getAllOrders);
router.get('/:id', getOrderById);
router.put('/:id', updateOrder);
router.delete('/:id', deleteOrder);

export default router;