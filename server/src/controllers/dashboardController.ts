import { Request, Response } from 'express';
import prisma from '../utils/db';

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
    const dateStr = targetDate.toISOString().split('T')[0];
    const dateFormatted = dateStr.replace(/-/g, '.');
    const totalActualPayment = orders.reduce((sum, o) => sum + o.actualPayment, 0);
    const totalCommission = orders.reduce((sum, o) => sum + o.baseCommission, 0);
    
    let summaryText = `${dateStr}激励订单\n`;
    summaryText += `合计${orders.length}单，合计激励本金：${totalActualPayment.toFixed(2)}\n\n`;
    summaryText += `微信昵称-订单号-实付\n\n`;

    orders.forEach(order => {
      const wechatName = order.taker?.wechatName || '未知';
      const orderNo = order.orderNo || '未填写';
      const actualPayment = order.actualPayment.toFixed(2);
      summaryText += `${wechatName}-${orderNo}-${actualPayment}\n`;
    });

    summaryText += `\n${dateStr}激励佣金合计${totalCommission.toFixed(2)}元\n`;
    summaryText += `日期 单数 佣金\n`;
    summaryText += `${dateFormatted} ${orders.length} ${totalCommission.toFixed(2)}`;

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
    // 获取总订单数和总金额
    const orderStats = await prisma.order.aggregate({
      _count: true,
      _sum: {
        actualPayment: true,
        totalRefund: true,
      },
    });

    // 获取接单人数量
    const takerCount = await prisma.orderTaker.count({
      where: { status: 'active' },
    });

    // 获取任务数量
    const taskCount = await prisma.task.count();

    // 获取活跃任务数量
    const activeTaskCount = await prisma.task.count({
      where: { status: 'active' },
    });

    // 获取今日新增订单
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await prisma.order.count({
      where: {
        orderDate: {
          gte: today,
        },
      },
    });

    // 获取今日金额和返款
    const todayStats = await prisma.order.aggregate({
      where: {
        orderDate: {
          gte: today,
        },
      },
      _sum: {
        actualPayment: true,
        totalRefund: true,
      },
    });

    // 获取待返款订单数
    const pendingRefundCount = await prisma.order.count({
      where: {
        isRefunded: false,
      },
    });

    // 获取待好评订单数
    const pendingReviewCount = await prisma.order.count({
      where: {
        isGoodReview: false,
      },
    });

    // 获取接单人排行榜
    const topTakers = await prisma.orderTaker.findMany({
      take: 5,
      orderBy: {
        totalOrders: 'desc',
      },
      select: {
        id: true,
        wechatName: true,
        wechatId: true,
        totalOrders: true,
        totalAmount: true,
      },
    });

    // 获取按接单日期分组的汇总数据（最近7天）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    // 获取最近7天的订单
    const recentOrders = await prisma.order.findMany({
      where: {
        orderDate: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        orderDate: true,
        totalRefund: true,
        isRefunded: true,
        isGoodReview: true,
      },
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
      if (order.isGoodReview) existing.goodReviewCount++;
      
      dailyMap.set(dateStr, existing);
    });

    // 转换为数组并排序
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

    res.json({
      success: true,
      data: {
        totalOrders: orderStats._count,
        totalAmount: orderStats._sum.actualPayment || 0,
        totalRefund: orderStats._sum.totalRefund || 0,
        activeTakers: takerCount,
        totalTasks: taskCount,
        activeTasks: activeTaskCount,
        todayOrders,
        todayAmount: todayStats._sum.actualPayment || 0,
        todayReward: todayStats._sum.totalRefund || 0,
        pendingRefundCount,
        pendingReviewCount,
        topTakers,
        dailySummary,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: '获取仪表盘数据失败',
    });
  }
};