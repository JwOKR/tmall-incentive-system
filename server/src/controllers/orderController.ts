import { Request, Response } from 'express';
import { createAuditLog, getClientIp } from '../utils/auditLog';
import * as orderService from '../services/orderService';
import { AuthRequest } from '../middleware/auth';

// ──────────────────────────────────────
// GET /orders
// ──────────────────────────────────────
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const data = await orderService.getOrderList(req.query as orderService.OrderListParams);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: '获取订单列表失败' });
  }
};

// ──────────────────────────────────────
// GET /orders/:id
// ──────────────────────────────────────
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, message: '获取订单详情失败' });
  }
};

// ──────────────────────────────────────
// PUT /orders/:id
// ──────────────────────────────────────
export const updateOrder = async (req: AuthRequest, res: Response) => {
  try {
    const existingOrder = await orderService.getOrderById(req.params.id);
    if (!existingOrder) return res.status(404).json({ success: false, message: '订单不存在' });

    const order = await orderService.updateOrder(req.params.id, req.body);

    // 构建变更详情
    const changes: string[] = [];
    const fields: Record<string, string> = {
      orderNo: '订单编号', orderNo19: '19订单号', actualPayment: '实付款',
      isRefunded: '返款状态', baseCommission: '基础返佣',
      isBaseCommissionRefunded: '基础返佣返款状态',
      reviewCommission: '好评返佣', drawingDate: '作图时间', remark: '备注',
    };
    
    // 好评状态映射
    const reviewStatusMap: Record<string, string> = {
      'pending': '未好评',
      'reviewed': '已好评',
      'creating': '作图中',
      'returned': '已返图',
    };
    
    for (const [key, label] of Object.entries(fields)) {
      const oldVal = (existingOrder as any)[key];
      const newVal = (req.body as any)[key];
      if (newVal !== undefined && String(newVal) !== String(oldVal)) {
        if (key === 'isRefunded') {
          changes.push(`${label}: ${oldVal ? '已返款' : '未返款'} → ${newVal ? '已返款' : '未返款'}`);
        } else if (key === 'isBaseCommissionRefunded') {
          changes.push(`${label}: ${oldVal ? '已返款' : '未返款'} → ${newVal ? '已返款' : '未返款'}`);
        } else {
          changes.push(`${label}: ${oldVal || '空'} → ${newVal}`);
        }
      }
    }
    
    // 单独处理好评状态变更
    if (req.body.isGoodReview !== undefined && req.body.isGoodReview !== existingOrder.isGoodReview) {
      const oldReview = reviewStatusMap[existingOrder.isGoodReview] || existingOrder.isGoodReview || '未好评';
      const newReview = reviewStatusMap[req.body.isGoodReview] || req.body.isGoodReview;
      changes.push(`好评状态: ${oldReview} → ${newReview}`);
    }

    await createAuditLog({
      orderId: req.params.id,
      action: 'update',
      detail: changes.length > 0
        ? `更新订单 ${existingOrder.orderNo || req.params.id}: ${changes.join(', ')}`
        : `更新订单: ${existingOrder.orderNo || req.params.id}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({ success: true, data: order });
  } catch (error: any) {
    const msg = error.message;
    if (msg === 'ORDER_NO_DUPLICATE') return res.status(400).json({ success: false, message: '订单编号已存在，不能重复' });
    if (msg === 'ORDER_NO19_DUPLICATE') return res.status(400).json({ success: false, message: '19订单号已存在，不能重复' });
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, message: '更新订单失败' });
  }
};

// ──────────────────────────────────────
// POST /orders/batch  （批量导入）
// ──────────────────────────────────────
export const batchCreateOrders = async (req: AuthRequest, res: Response) => {
  try {
    const result = await orderService.batchCreateOrders(req.body.orders);

    await createAuditLog({
      action: 'batch_create',
      detail: `批量导入订单: 成功${result.success}条，跳过${result.skipped}条，失败${result.failed}条`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      // 返回**完整** details / errors：前端预览已按行展示校验结果，导入后明细表需要
      // 逐行回显「成功 / 跳过 / 失败 + 原因」。若仍截断到 20/10，问题行会被隐藏、
      // 且明细表「共 N 条」与实际不符，违背「失败与跳过可读」的目标。仅影响响应体形状，不涉及写入语义。
      data: { ...result, duplicates: result.skipped, details: result.details, errors: result.errors },
      message: `导入完成: 成功${result.success}条，跳过${result.skipped}条，失败${result.failed}条`,
    });
  } catch (error: any) {
    if (error.message === 'EMPTY_ORDER_LIST') return res.status(400).json({ success: false, message: '请提供订单列表' });
    console.error('Error batch creating orders:', error);
    res.status(500).json({ success: false, message: '批量导入订单失败' });
  }
};

// ──────────────────────────────────────
// POST /orders/validate-batch  （只读预校验：不写库，导入前给用户看每行判定）
// ──────────────────────────────────────
export const validateBatchOrders = async (req: Request, res: Response) => {
  try {
    const rows = (req.body as any)?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: '请提供待校验的行数据' });
    }
    const data = await orderService.validateBatchOrders(rows);
    res.json({ success: true, data });
  } catch (error: any) {
    if (error?.message === 'EMPTY_ORDER_LIST') {
      return res.status(400).json({ success: false, message: '请提供待校验的行数据' });
    }
    console.error('Error validating orders batch:', error);
    res.status(500).json({ success: false, message: '批量校验失败' });
  }
};

// ──────────────────────────────────────
// PUT /orders/batch  （批量修改）
// ──────────────────────────────────────
export const batchUpdateOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, message: '请提供订单列表' });
    }

    const result = await orderService.batchUpdateOrders(orders);

    await createAuditLog({
      action: 'batch_update',
      detail: `批量修改订单: 成功${result.success}条，未找到${result.notFound}条，失败${result.failed}条`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      // 同 batchCreateOrders：完整回传 details / errors，保证问题行可读（不涉及写入语义）。
      data: { ...result, duplicates: result.notFound, details: result.details, errors: result.errors },
      message: `修改完成: 成功${result.success}条，未找到${result.notFound}条，失败${result.failed}条`,
    });
  } catch (error) {
    console.error('Error batch updating orders:', error);
    res.status(500).json({ success: false, message: '批量修改订单失败' });
  }
};

// ──────────────────────────────────────
// PUT /orders/batch/status
// ──────────────────────────────────────
export const batchUpdateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, field, value } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请提供订单ID列表' });
    }
    if (!['isRefunded', 'isGoodReview', 'isBaseCommissionRefunded'].includes(field)) {
      return res.status(400).json({ success: false, message: '不支持的字段' });
    }

    const updated = await orderService.batchUpdateOrderStatus(ids, field, value);

    // 好评状态映射
    const reviewStatusMap: Record<string, string> = {
      'pending': '未好评',
      'reviewed': '已好评',
      'creating': '作图中',
      'returned': '已返图',
    };

    let statusLabel = '';
    if (field === 'isRefunded') {
      statusLabel = value ? '已返款' : '未返款';
    } else if (field === 'isBaseCommissionRefunded') {
      statusLabel = value ? '基础返佣已返款' : '基础返佣未返款';
    } else {
      statusLabel = reviewStatusMap[String(value)] || String(value);
    }

    await createAuditLog({
      action: 'batch_update',
      detail: `批量标记${updated}个订单为${statusLabel}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({ success: true, data: { updated, total: ids.length }, message: `成功更新${updated}条订单` });
  } catch (error) {
    console.error('Error batch updating status:', error);
    res.status(500).json({ success: false, message: '批量更新状态失败' });
  }
};

// ──────────────────────────────────────
// GET /orders/undo-last  （P2-3 撤销预览：纯只读，供前端二次确认弹窗展示「将还原 N 条」）
// ──────────────────────────────────────
export const getUndoPreview = async (_req: Request, res: Response) => {
  try {
    const preview = await orderService.getUndoPreview();
    res.json({ success: true, data: preview });
  } catch (error) {
    console.error('Error fetching undo preview:', error);
    res.status(500).json({ success: false, message: '获取撤销预览失败' });
  }
};

// ──────────────────────────────────────
// POST /orders/undo-last  （P2-3 撤销最近一次批量操作）
// 幂等：同一快照只允许被撤销一次（服务端原子抢占 consumed）；只支持最近一次，不做多级 undo。
// ──────────────────────────────────────
export const undoLastBatch = async (req: AuthRequest, res: Response) => {
  try {
    const result = await orderService.undoLastBatch();

    const actionLabel: Record<string, string> = {
      batch_create: '批量导入',
      batch_update: '批量修改',
      batch_update_status: '批量标记',
    };

    await createAuditLog({
      action: 'batch_undo',
      detail: `撤销批量操作(${actionLabel[result.action] || result.action}): 还原${result.restored}条${result.failed > 0 ? `，失败${result.failed}条` : ''}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      data: result,
      message: `已撤销${actionLabel[result.action] || result.action}：还原${result.restored}条订单${result.failed > 0 ? `，失败${result.failed}条` : ''}`,
    });
  } catch (error: any) {
    if (error.message === 'NO_UNDOABLE_OPERATION') {
      return res.status(400).json({ success: false, code: 'NO_UNDOABLE_OPERATION', message: '没有可撤销的批量操作（仅支持撤销最近一次，且不能重复撤销）' });
    }
    if (error.message === 'SNAPSHOT_ALREADY_CONSUMED') {
      return res.status(409).json({ success: false, code: 'SNAPSHOT_ALREADY_CONSUMED', message: '该批量操作已被撤销，不能重复撤销' });
    }
    if (error.message === 'CORRUPTED_SNAPSHOT') {
      return res.status(500).json({ success: false, code: 'CORRUPTED_SNAPSHOT', message: '快照数据损坏，无法撤销' });
    }
    console.error('Error undoing last batch:', error);
    res.status(500).json({ success: false, message: '撤销失败' });
  }
};

// ──────────────────────────────────────
// DELETE /orders/:id
// ──────────────────────────────────────
export const deleteOrder = async (req: AuthRequest, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });

    await createAuditLog({
      action: 'delete',
      detail: `删除订单: ${order.orderNo || req.params.id}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    await orderService.deleteOrder(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ success: false, message: '删除订单失败' });
  }
};
