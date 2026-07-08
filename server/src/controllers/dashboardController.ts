import { Request, Response } from 'express';
import prisma from '../utils/db';

// 简单内存缓存（生产环境可替换为 Redis）
const statsCache = new Map<string, { data: unknown; expires: number }>();
const STATS_TTL_MS = 30_000; // 30 秒缓存

function getCached<T>(key: string): T | null {
  const entry = statsCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    statsCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = STATS_TTL_MS) {
  statsCache.set(key, { data, expires: Date.now() + ttlMs });
}

// 生成激励汇总文本
export const getIncentiveSummary = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    
    // 如果没有指定日期，使用今天
    const targetDate = date ? new Date(date as string) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 获取指定日期的订单
    const orders = await prisma.order.findMany({
      where: {
        orderDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        taker: {
          select: {
            wechatName: true,
          },
        },
      },
      orderBy: {
        orderDate: 'asc',
      },
    });

    // 生成汇总文本
    const fmt = (n: number) => {
      const fixed = n.toFixed(2);
      return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
    };
    const dateStr = targetDate.toISOString().split('T')[0];
    const dateFormatted = dateStr.replace(/-/g, '.');
    const totalActualPayment = orders.reduce((sum, o) => sum + o.actualPayment, 0);
    const totalCommission = orders.reduce((sum, o) => sum + o.baseCommission, 0);
    
    let summaryText = `${dateStr}天猫激励订单\n`;
    summaryText += `合计${orders.length}单，合计激励本金：${fmt(totalActualPayment)}\n\n`;
    summaryText += `微信昵称-19订单号-实付\n\n`;

    orders.forEach(order => {
      const wechatName = order.taker?.wechatName || '未知';
      const orderNo = order.orderNo19 || '未填写';
      const actualPayment = fmt(order.actualPayment);
      summaryText += `${wechatName}-${orderNo}-${actualPayment}\n`;
    });

    summaryText += `\n${dateStr}天猫激励佣金合计${fmt(totalCommission)}元\n`;
    summaryText += `日期 单数 佣金\n`;
    summaryText += `${dateFormatted} ${orders.length} ${fmt(totalCommission)}`;

    res.json({
      success: true,
      data: {
        text: summaryText,
        date: dateStr,
        orderCount: orders.length,
        totalCommission: orders.reduce((sum, o) => sum + o.baseCommission, 0),
      },
    });
  } catch (error) {
    console.error('Error generating incentive summary:', error);
    res.status(500).json({
      success: false,
      message: '生成激励汇总失败',
    });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // 检查缓存
    const cached = getCached<Record<string, unknown>>('dashboard:stats');
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // 并行执行所有独立查询，减少响应延迟
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      orderStats,
      takerCount,
      activeTaskCount,
      todayOrders,
      todayStats,
      pendingRefundCount,
      pendingReviewCount,
      topTakers,
      recentOrders,
    ] = await Promise.all([
      prisma.order.aggregate({
        _count: true,
        _sum: { actualPayment: true, totalRefund: true },
      }),
      prisma.orderTaker.count({ where: { status: 'active' } }),
      prisma.task.count({ where: { status: 'active' } }),
      prisma.order.count({ where: { orderDate: { gte: today } } }),
      prisma.order.aggregate({
        where: { orderDate: { gte: today } },
        _sum: { actualPayment: true, totalRefund: true },
      }),
      prisma.order.count({ where: { isRefunded: false } }),
      prisma.order.count({ where: { isGoodReview: false } }),
      prisma.orderTaker.findMany({
        take: 5,
        orderBy: { totalOrders: 'desc' },
        select: { id: true, wechatName: true, wechatId: true, totalOrders: true, totalAmount: true },
      }),
      prisma.order.findMany({
        where: { orderDate: { gte: sevenDaysAgo } },
        select: { orderDate: true, totalRefund: true, isRefunded: true, isGoodReview: true },
      }),
    ]);

    // 按日期分组统计
    const dailyMap = new Map<string, {
      orderCount: number;
      totalRefund: number;
      refundedCount: number;
      goodReviewCount: number;
    }>();

    recentOrders.forEach(order => {
      const dateStr = order.orderDate.toISOString().split('T')[0];
      const existing = dailyMap.get(dateStr) || {
        orderCount: 0,
        totalRefund: 0,
        refundedCount: 0,
        goodReviewCount: 0,
      };
      existing.orderCount++;
      existing.totalRefund += order.totalRefund;
      if (order.isRefunded) existing.refundedCount++;
      if (order.isGoodReview) existing.goodReviewCount++;
      dailyMap.set(dateStr, existing);
    });

    const dailySummary = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        orderCount: stats.orderCount,
        totalRefund: stats.totalRefund,
        refundedCount: stats.refundedCount,
        pendingCount: stats.orderCount - stats.refundedCount,
        goodReviewCount: stats.goodReviewCount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const result = {
      totalOrders: orderStats._count,
      totalAmount: orderStats._sum.actualPayment || 0,
      totalRefund: orderStats._sum.totalRefund || 0,
      activeTakers: takerCount,
      activeTasks: activeTaskCount,
      todayOrders,
      todayAmount: todayStats._sum.actualPayment || 0,
      todayReward: todayStats._sum.totalRefund || 0,
      pendingRefundCount,
      pendingReviewCount,
      topTakers,
      dailySummary,
    };

    // 写入缓存
    setCache('dashboard:stats', result);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: '获取仪表盘数据失败',
    });
  }
};