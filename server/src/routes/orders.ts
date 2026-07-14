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
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

// 批量操作路由（必须在 /:id 之前注册，否则 'batch' 会被当作 id）
router.post('/batch', requireEditPermission('orders'), batchCreateOrders);
router.put('/batch/update', requireEditPermission('orders'), batchUpdateOrders);
router.put('/batch/status', requireEditPermission('orders'), batchUpdateStatus);

// 单条操作路由
router.get('/', requireViewPermission('orders'), getAllOrders);
router.get('/:id', requireViewPermission('orders'), getOrderById);
router.put('/:id', requireEditPermission('orders'), updateOrder);
router.delete('/:id', requireEditPermission('orders'), deleteOrder);

export default router;