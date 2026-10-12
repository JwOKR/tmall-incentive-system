import { Router } from 'express';
import {
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  batchCreateOrders,
  batchUpdateOrders,
  batchUpdateStatus,
  validateBatchOrders,
  getUndoPreview,
  undoLastBatch,
} from '../controllers/orderController';
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

// 批量操作路由（必须在 /:id 之前注册，否则 'batch' 会被当作 id）
router.post('/batch', requireEditPermission('orders'), batchCreateOrders);
router.post('/validate-batch', requireEditPermission('orders'), validateBatchOrders);
router.put('/batch/update', requireEditPermission('orders'), batchUpdateOrders);
router.put('/batch/status', requireEditPermission('orders'), batchUpdateStatus);

// P2-3 批量撤销：GET 为纯只读预览（供二次确认弹窗），POST 执行撤销。
// 同样必须注册在 /:id 之前，否则 'undo-last' 会被当作 id。
router.get('/undo-last', requireViewPermission('orders'), getUndoPreview);
router.post('/undo-last', requireEditPermission('orders'), undoLastBatch);

// 单条操作路由
router.get('/', requireViewPermission('orders'), getAllOrders);
router.get('/:id', requireViewPermission('orders'), getOrderById);
router.put('/:id', requireEditPermission('orders'), updateOrder);
router.delete('/:id', requireEditPermission('orders'), deleteOrder);

export default router;