import { Request, Response } from 'express';
import prisma from '../utils/db';

// 佣金成本分析
export const getCommissionStats = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        taker: { select: { id: true, wechatName: true, wechatId: true } },
        task: { select: { productId: true, productCode: true } },
      },
    });

    // 按接单人分组
    const takerMap = new Map<string, { name: string; wechatId: string; orders: number; totalPayment: number; baseCommission: number; reviewCommission: number; totalRefund: number }>();
    // 按商品分组
    const productMap = new Map<string, { code: string; orders: number; totalPayment: number; baseCommission: number; reviewCommission: number }>();
    // 按月分组
    const monthMap = new Map<string, { orders: number; totalPayment: number; baseCommission: number; reviewCommission: number }>();

    for (const order of orders) {
      // 接单人
      const takerId = order.takerId || 'unknown';
      const takerKey = takerId;
      if (!takerMap.has(takerKey)) {
        takerMap.set(takerKey, {
          name: order.taker?.wechatName || '未匹配',
          wechatId: order.taker?.wechatId || '',
          orders: 0, totalPayment: 0, baseCommission: 0, reviewCommission: 0, totalRefund: 0,
        });
      }
      const t = takerMap.get(takerKey)!;
      t.orders++;
      t.totalPayment += order.actualPayment;
      t.baseCommission += order.baseCommission;
      t.reviewCommission += order.reviewCommission;
      t.totalRefund += order.totalRefund;

      // 商品
      const productKey = order.productCode || order.productId;
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          code: order.productCode || order.productId, orders: 0,
          totalPayment: 0, baseCommission: 0, reviewCommission: 0,
        });
      }
      const p = productMap.get(productKey)!;
      p.orders++;
      p.totalPayment += order.actualPayment;
      p.baseCommission += order.baseCommission;
      p.reviewCommission += order.reviewCommission;

      // 月份
      const monthKey = order.orderDate.toISOString().slice(0, 7); // YYYY-MM
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { orders: 0, totalPayment: 0, baseCommission: 0, reviewCommission: 0 });
      }
      const m = monthMap.get(monthKey)!;
      m.orders++;
      m.totalPayment += order.actualPayment;
      m.baseCommission += order.baseCommission;
      m.reviewCommission += order.reviewCommission;
    }

    // 全局统计
    const totalOrders = orders.length;
    const totalPayment = orders.reduce((s, o) => s + o.actualPayment, 0);
    const totalBaseCommission = orders.reduce((s, o) => s + o.baseCommission, 0);
    const totalReviewCommission = orders.reduce((s, o) => s + o.reviewCommission, 0);
    const totalCommission = totalBaseCommission + totalReviewCommission;
    const avgCommissionPerOrder = totalOrders > 0 ? totalCommission / totalOrders : 0;

    // 排序
    const byTaker = Array.from(takerMap.entries())
      .map(([id, d]) => ({ id, ...d, avgCommission: d.orders > 0 ? (d.baseCommission + d.reviewCommission) / d.orders : 0 }))
      .sort((a, b) => (b.baseCommission + b.reviewCommission) - (a.baseCommission + a.reviewCommission));

    const byProduct = Array.from(productMap.entries())
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => (b.baseCommission + b.reviewCommission) - (a.baseCommission + a.reviewCommission));

    const byMonth = Array.from(monthMap.entries())
      .map(([month, d]) => ({ month, ...d, totalCommission: d.baseCommission + d.reviewCommission }))
      .sort((a, b) => b.month.localeCompare(a.month));

    res.json({
      success: true,
      data: {
        summary: { totalOrders, totalPayment, totalBaseCommission, totalReviewCommission, totalCommission, avgCommissionPerOrder },
        byTaker: byTaker.slice(0, 50),
        byProduct: byProduct.slice(0, 30),
        byMonth,
      },
    });
  } catch (error) {
    console.error('Error fetching commission stats:', error);
    res.status(500).json({ success: false, message: '获取佣金统计失败' });
  }
};
