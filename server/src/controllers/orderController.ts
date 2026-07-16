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
      reviewCommission: '好评返佣', remark: '备注',
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
      data: { ...result, duplicates: result.skipped, details: result.details.slice(0, 20), errors: result.errors.slice(0, 10) },
      message: `导入完成: 成功${result.success}条，跳过${result.skipped}条，失败${result.failed}条`,
    });
  } catch (error: any) {
    if (error.message === 'EMPTY_ORDER_LIST') return res.status(400).json({ success: false, message: '请提供订单列表' });
    console.error('Error batch creating orders:', error);
    res.status(500).json({ success: false, message: '批量导入订单失败' });
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
      data: { ...result, duplicates: result.notFound, details: result.details.slice(0, 20), errors: result.errors.slice(0, 10) },
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
    if (!['isRefunded', 'isGoodReview'].includes(field)) {
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
