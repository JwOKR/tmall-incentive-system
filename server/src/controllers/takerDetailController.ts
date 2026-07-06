import { Request, Response } from 'express';
import prisma from '../utils/db';

// 接单人详情（含历史订单 + 佣金汇总）
export const getTakerDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const taker = await prisma.orderTaker.findUnique({
      where: { id },
    });

    if (!taker) {
      return res.status(404).json({ success: false, message: '接单人不存在' });
    }

    // 历史订单（分页）
    const [orders, totalOrders] = await Promise.all([
      prisma.order.findMany({
        where: { takerId: id },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { orderDate: 'desc' },
        include: {
          task: { select: { productId: true, productCode: true } },
        },
      }),
      prisma.order.count({ where: { takerId: id } }),
    ]);

    // 佣金汇总（全量）
    const allOrders = await prisma.order.findMany({
      where: { takerId: id },
      select: {
        actualPayment: true,
        baseCommission: true,
        reviewCommission: true,
        totalRefund: true,
        isRefunded: true,
        isGoodReview: true,
        orderDate: true,
      },
    });

    const totalActualPayment = allOrders.reduce((s, o) => s + o.actualPayment, 0);
    const totalBaseCommission = allOrders.reduce((s, o) => s + o.baseCommission, 0);
    const totalReviewCommission = allOrders.reduce((s, o) => s + o.reviewCommission, 0);
    const totalRefund = allOrders.reduce((s, o) => s + o.totalRefund, 0);
    const refundedCount = allOrders.filter(o => o.isRefunded).length;
    const goodReviewCount = allOrders.filter(o => o.isGoodReview).length;
    const pendingRefund = totalOrders - refundedCount;
    const pendingReview = totalOrders - goodReviewCount;

    // 最近接单日期
    const lastOrder = allOrders.length > 0
      ? allOrders.reduce((latest, o) => o.orderDate > latest ? o.orderDate : latest, allOrders[0].orderDate)
      : null;
    const daysSinceLastOrder = lastOrder
      ? Math.floor((Date.now() - lastOrder.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // 按月统计
    const monthMap = new Map<string, { orders: number; commission: number }>();
    for (const o of allOrders) {
      const key = o.orderDate.toISOString().slice(0, 7);
      const existing = monthMap.get(key) || { orders: 0, commission: 0 };
      existing.orders++;
      existing.commission += o.baseCommission + o.reviewCommission;
      monthMap.set(key, existing);
    }
    const monthlyStats = Array.from(monthMap.entries())
      .map(([month, d]) => ({ month, ...d }))
      .sort((a, b) => b.month.localeCompare(a.month));

    res.json({
      success: true,
      data: {
        taker,
        orders: {
          list: orders,
          total: totalOrders,
          page: Number(page),
          pageSize: Number(pageSize),
        },
        summary: {
          totalOrders,
          totalActualPayment,
          totalBaseCommission,
          totalReviewCommission,
          totalCommission: totalBaseCommission + totalReviewCommission,
          totalRefund,
          refundedCount,
          goodReviewCount,
          pendingRefund,
          pendingReview,
          lastOrderDate: lastOrder?.toISOString() || null,
          daysSinceLastOrder,
        },
        monthlyStats,
      },
    });
  } catch (error) {
    console.error('Error fetching taker detail:', error);
    res.status(500).json({ success: false, message: '获取接单人详情失败' });
  }
};
