import { Request, Response } from 'express';
import prisma from '../utils/db';

// 佣金成本分析（使用数据库聚合，避免加载全量订单到内存）
export const getCommissionStats = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    // 构建日期过滤条件（MySQL语法）
    let dateFilter = '';
    const params: any[] = [];
    if (startDate) {
      params.push(new Date(startDate as string));
      dateFilter += ` AND o.orderDate >= ?`;
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      params.push(end);
      dateFilter += ` AND o.orderDate <= ?`;
    }

    // 全局统计：使用 SQL 聚合（MySQL语法）
    const summaryParams = [...params];
    const [summary] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(o.actualPayment), 0) AS totalPayment,
        COALESCE(SUM(o.baseCommission), 0) AS totalBaseCommission,
        COALESCE(SUM(o.reviewCommission), 0) AS totalReviewCommission
      FROM orders o
      WHERE 1=1${dateFilter}`,
      ...summaryParams,
    );

    const totalOrders = Number(summary.totalOrders);
    const totalPayment = Number(summary.totalPayment);
    const totalBaseCommission = Number(summary.totalBaseCommission);
    const totalReviewCommission = Number(summary.totalReviewCommission);
    const totalCommission = totalBaseCommission + totalReviewCommission;
    const avgCommissionPerOrder = totalOrders > 0 ? totalCommission / totalOrders : 0;

    // 按接单人分组聚合（MySQL语法）
    const takerParams = [...params];
    const byTakerRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        o.takerId,
        COALESCE(t.wechatName, '未匹配') AS name,
        COALESCE(t.wechatId, '') AS wechatId,
        COUNT(*) AS orders,
        COALESCE(SUM(o.actualPayment), 0) AS totalPayment,
        COALESCE(SUM(o.baseCommission), 0) AS baseCommission,
        COALESCE(SUM(o.reviewCommission), 0) AS reviewCommission,
        COALESCE(SUM(o.totalRefund), 0) AS totalRefund
      FROM orders o
      LEFT JOIN order_takers t ON t.id = o.takerId
      WHERE 1=1${dateFilter}
      GROUP BY o.takerId, t.wechatName, t.wechatId
      ORDER BY COALESCE(SUM(o.baseCommission), 0) + COALESCE(SUM(o.reviewCommission), 0) DESC
      LIMIT 50`,
      ...takerParams,
    );

    const byTaker = byTakerRaw.map((d) => ({
      id: d.takerId || 'unknown',
      name: d.name,
      wechatId: d.wechatId,
      orders: Number(d.orders),
      totalPayment: Number(d.totalPayment),
      baseCommission: Number(d.baseCommission),
      reviewCommission: Number(d.reviewCommission),
      totalRefund: Number(d.totalRefund),
      avgCommission: Number(d.orders) > 0 ? (Number(d.baseCommission) + Number(d.reviewCommission)) / Number(d.orders) : 0,
    }));

    // 按商品分组聚合（MySQL语法）
    const productParams = [...params];
    const byProductRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COALESCE(o.productCode, o.productId) AS id,
        COALESCE(o.productCode, o.productId) AS code,
        COUNT(*) AS orders,
        COALESCE(SUM(o.actualPayment), 0) AS totalPayment,
        COALESCE(SUM(o.baseCommission), 0) AS baseCommission,
        COALESCE(SUM(o.reviewCommission), 0) AS reviewCommission
      FROM orders o
      WHERE 1=1${dateFilter}
      GROUP BY COALESCE(o.productCode, o.productId)
      ORDER BY COALESCE(SUM(o.baseCommission), 0) + COALESCE(SUM(o.reviewCommission), 0) DESC
      LIMIT 30`,
      ...productParams,
    );

    const byProduct = byProductRaw.map(d => ({
      ...d,
      orders: Number(d.orders),
      totalPayment: Number(d.totalPayment),
      baseCommission: Number(d.baseCommission),
      reviewCommission: Number(d.reviewCommission),
    }));

    // 按月分组聚合（MySQL语法：DATE_FORMAT替代TO_CHAR）
    const monthParams = [...params];
    const byMonthRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        DATE_FORMAT(o.orderDate, '%Y-%m') AS month,
        COUNT(*) AS orders,
        COALESCE(SUM(o.actualPayment), 0) AS totalPayment,
        COALESCE(SUM(o.baseCommission), 0) AS baseCommission,
        COALESCE(SUM(o.reviewCommission), 0) AS reviewCommission
      FROM orders o
      WHERE 1=1${dateFilter}
      GROUP BY DATE_FORMAT(o.orderDate, '%Y-%m')
      ORDER BY month DESC`,
      ...monthParams,
    );

    const byMonth = byMonthRaw.map((d) => ({
      ...d,
      orders: Number(d.orders),
      totalPayment: Number(d.totalPayment),
      baseCommission: Number(d.baseCommission),
      reviewCommission: Number(d.reviewCommission),
      totalCommission: Number(d.baseCommission) + Number(d.reviewCommission),
    }));

    res.json({
      success: true,
      data: {
        summary: { totalOrders, totalPayment, totalBaseCommission, totalReviewCommission, totalCommission, avgCommissionPerOrder },
        byTaker,
        byProduct,
        byMonth,
      },
    });
  } catch (error) {
    console.error('Error fetching commission stats:', error);
    res.status(500).json({ success: false, message: '获取佣金统计失败' });
  }
};
