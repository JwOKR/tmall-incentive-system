import { Request, Response } from 'express';
import prisma from '../utils/db';

// 获取接单间隔天数统计
export const getIntervalStats = async (req: Request, res: Response) => {
  try {
    const { takerId, startDate, endDate } = req.query;

    // 构建查询条件
    const where: any = {
      takerId: { not: null },
    };

    if (takerId) {
      where.takerId = takerId as string;
    }

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate.gte = new Date(startDate as string);
      if (endDate) where.orderDate.lte = new Date(endDate as string);
    }

    // 获取所有有接单人的订单，按接单人分组
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        orderDate: true,
        takerId: true,
        productCode: true,
        actualPayment: true,
      },
      orderBy: {
        orderDate: 'asc',
      },
    });

    // 获取所有接单人信息
    const takers = await prisma.orderTaker.findMany({
      select: {
        id: true,
        wechatName: true,
        wechatId: true,
        status: true,
        totalOrders: true,
      },
    });

    const takerMap = new Map(takers.map(t => [t.id, t]));

    // 按接单人分组
    const takerOrdersMap = new Map<string, typeof orders>();

    orders.forEach(order => {
      if (!order.takerId) return;
      const arr = takerOrdersMap.get(order.takerId) || [];
      arr.push(order);
      takerOrdersMap.set(order.takerId, arr);
    });

    // 计算每个接单人的间隔数据
    const takerIntervals: Array<{
      takerId: string;
      wechatName: string;
      wechatId: string;
      status: string;
      totalOrders: number;
      orderCount: number;
      firstOrderDate: Date | null;
      lastOrderDate: Date | null;
      avgInterval: number | null;
      minInterval: number | null;
      maxInterval: number | null;
      intervals: Array<{
        fromDate: Date;
        toDate: Date;
        intervalDays: number;
      }>;
    }> = [];

    takerOrdersMap.forEach((takerOrders, takerId) => {
      const taker = takerMap.get(takerId);
      if (!taker) return;

      // 按日期排序（已经排序了，但确保一下）
      const sorted = [...takerOrders].sort(
        (a, b) => a.orderDate.getTime() - b.orderDate.getTime()
      );

      const intervals: Array<{
        fromDate: Date;
        toDate: Date;
        intervalDays: number;
      }> = [];

      for (let i = 1; i < sorted.length; i++) {
        const diffMs = sorted[i].orderDate.getTime() - sorted[i - 1].orderDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        intervals.push({
          fromDate: sorted[i - 1].orderDate,
          toDate: sorted[i].orderDate,
          intervalDays: diffDays,
        });
      }

      const intervalValues = intervals.map(i => i.intervalDays);
      const sum = intervalValues.reduce((a, b) => a + b, 0);

      takerIntervals.push({
        takerId,
        wechatName: taker.wechatName,
        wechatId: taker.wechatId,
        status: taker.status,
        totalOrders: taker.totalOrders,
        orderCount: sorted.length,
        firstOrderDate: sorted.length > 0 ? sorted[0].orderDate : null,
        lastOrderDate: sorted.length > 0 ? sorted[sorted.length - 1].orderDate : null,
        avgInterval: intervalValues.length > 0 ? Math.round((sum / intervalValues.length) * 10) / 10 : null,
        minInterval: intervalValues.length > 0 ? Math.min(...intervalValues) : null,
        maxInterval: intervalValues.length > 0 ? Math.max(...intervalValues) : null,
        intervals,
      });
    });

    // 按平均间隔排序（无间隔的排最后）
    takerIntervals.sort((a, b) => {
      if (a.avgInterval === null) return 1;
      if (b.avgInterval === null) return -1;
      return a.avgInterval - b.avgInterval;
    });

    // 全局统计
    const allIntervals = takerIntervals.flatMap(t => t.intervals.map(i => i.intervalDays));
    const globalStats = {
      totalTakers: takerIntervals.length,
      totalOrders: orders.length,
      totalIntervals: allIntervals.length,
      globalAvgInterval: allIntervals.length > 0
        ? Math.round((allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length) * 10) / 10
        : 0,
      globalMinInterval: allIntervals.length > 0 ? Math.min(...allIntervals) : 0,
      globalMaxInterval: allIntervals.length > 0 ? Math.max(...allIntervals) : 0,
    };

    res.json({
      success: true,
      data: {
        stats: globalStats,
        takers: takerIntervals,
      },
    });
  } catch (error) {
    console.error('Error fetching interval stats:', error);
    res.status(500).json({
      success: false,
      message: '获取接单间隔统计失败',
    });
  }
};
