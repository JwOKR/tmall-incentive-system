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

    // 生成汇总文本：清理浮点尾巴但不四舍五入到2位
    const fmt = (n: number) => {
      const cleaned = parseFloat(n.toPrecision(12));
      return String(cleaned);
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
    // 支持日期范围筛选
    const { startDate, endDate } = req.query;
    
    // 构建缓存key
    const cacheKey = `dashboard:stats:${startDate || 'all'}:${endDate || 'all'}`;
    const cached = getCached<Record<string, unknown>>(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // 计算日期范围
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let dateFilter: any = {};
    let rangeLabel = '全部';
    
    if (startDate && endDate) {
      // 自定义日期范围
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateFilter = { orderDate: { gte: start, lte: end } };
      rangeLabel = `${startDate} 至 ${endDate}`;
    } else if (startDate) {
      // 从开始日期到今天
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      dateFilter = { orderDate: { gte: start } };
      rangeLabel = `${startDate} 至今`;
    } else {
      // 默认：今日数据
      dateFilter = { orderDate: { gte: today } };
      rangeLabel = '今日';
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // ── P2-7 口径统一决策（三项一起改，杜绝「看起来能筛其实不能筛」的半吊子状态）──
    //   1) dailySummary：跟随筛选；未设筛选时保持「近7天」默认窗口，
    //      实际口径通过 dailySummaryLabel 返回给前端（前端只展示，不自行判定）。
    //   2) topTakers：改为按所选区间的真实订单聚合排行（原先是接单人表的历史累计
    //      totalOrders/totalAmount，标「本月」实为全期，口径错误）。
    //   3) pendingRefundCount / pendingReviewCount：在 dateFilter 基础上叠加订单级状态，
    //      跟随筛选。返款用订单级 isRefunded（分项级 isBaseCommissionRefunded 不参与统计），
    //      isGoodReview 是字符串状态字段，一律字符串比较，禁止真值判断。
    const hasDateFilter = Boolean(startDate || endDate);
    const dailyFilter = hasDateFilter ? dateFilter : { orderDate: { gte: sevenDaysAgo } };
    const dailySummaryLabel = hasDateFilter ? rangeLabel : '近7天';

    const [
      orderStats,
      takerCount,
      activeTaskCount,
      todayOrders,
      todayStats,
      rangeOrders,
      rangeStats,
      pendingRefundCount,
      pendingReviewCount,
      topTakersRaw,
      recentOrders,
    ] = await Promise.all([
      // 总数据（不受日期筛选影响；卡片标题即「总」，口径显式为全量）
      prisma.order.aggregate({
        _count: true,
        _sum: { actualPayment: true, totalRefund: true },
      }),
      prisma.orderTaker.count({ where: { status: 'active' } }),
      prisma.task.count({ where: { status: 'active' } }),
      // 今日数据（始终显示；卡片标题即「今日」）
      prisma.order.count({ where: { orderDate: { gte: today } } }),
      prisma.order.aggregate({
        where: { orderDate: { gte: today } },
        _sum: { actualPayment: true, totalRefund: true },
      }),
      // 筛选范围数据
      prisma.order.count({ where: dateFilter }),
      prisma.order.aggregate({
        where: dateFilter,
        _sum: { actualPayment: true, totalRefund: true },
      }),
      // 待返款：跟随筛选（订单级 isRefunded 判定）
      prisma.order.count({ where: { ...dateFilter, isRefunded: false } }),
      // 待好评：跟随筛选（isGoodReview 字符串字段，用字符串比较）
      prisma.order.count({ where: { ...dateFilter, isGoodReview: 'pending' } }),
      // 接单人排行：按所选区间的真实订单聚合（不再是接单人表的历史累计值）
      prisma.order.groupBy({
        by: ['takerId'],
        where: dateFilter,
        _count: { _all: true },
        _sum: { actualPayment: true },
        orderBy: { _count: { takerId: 'desc' } },
        take: 5,
      }),
      // 日汇总明细：跟随筛选；未筛选时为「近7天」默认窗口
      prisma.order.findMany({
        where: dailyFilter,
        select: { orderDate: true, totalRefund: true, isRefunded: true, isGoodReview: true },
      }),
    ]);

    // 补齐接单人昵称（groupBy 只返回 takerId）
    const topTakerIds = topTakersRaw.map((r: any) => r.takerId).filter((id: any) => Boolean(id));
    const topTakerRows = topTakerIds.length > 0
      ? await prisma.orderTaker.findMany({
          where: { id: { in: topTakerIds } },
          select: { id: true, wechatName: true, wechatId: true },
        })
      : [];
    const topTakerMap = new Map<string, any>(topTakerRows.map((t: any): [string, any] => [t.id, t]));
    const topTakers = topTakersRaw.map((r: any) => {
      const taker = r.takerId ? topTakerMap.get(r.takerId) : null;
      return {
        id: r.takerId || 'unknown',
        wechatName: taker?.wechatName || '未匹配',
        wechatId: taker?.wechatId || '',
        totalOrders: Number(r._count?._all ?? 0),
        totalAmount: Number(r._sum?.actualPayment ?? 0),
      };
    });

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
      if (order.isGoodReview === 'reviewed') existing.goodReviewCount++;
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
      // 总数据
      totalOrders: orderStats._count,
      totalAmount: orderStats._sum.actualPayment || 0,
      totalRefund: orderStats._sum.totalRefund || 0,
      activeTakers: takerCount,
      activeTasks: activeTaskCount,
      // 今日数据（始终显示）
      todayOrders,
      todayAmount: todayStats._sum.actualPayment || 0,
      todayReward: todayStats._sum.totalRefund || 0,
      // 筛选范围数据
      rangeLabel,
      rangeOrders,
      rangeAmount: rangeStats._sum.actualPayment || 0,
      rangeReward: rangeStats._sum.totalRefund || 0,
      // 待处理统计
      pendingRefundCount,
      pendingReviewCount,
      topTakers,
      // 口径标签（前端只展示，不自行判定口径）
      dailySummaryLabel,
      topTakersLabel: `${rangeLabel}接单排行`,
      dailySummary,
    };

    // 写入缓存
    setCache(cacheKey, result);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: '获取仪表盘数据失败',
    });
  }
};