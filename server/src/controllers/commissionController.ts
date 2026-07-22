import { Request, Response } from 'express';
import prisma from '../utils/db';

// 佣金成本分析（使用数据库聚合，避免加载全量订单到内存）
export const getCommissionStats = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    // 构建日期过滤条件
    let dateFilter = '';
    const params: any[] = [];
    if (startDate) {
      params.push(new Date(startDate as string));
      dateFilter += ` AND o."orderDate" >= $${params.length}`;
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      params.push(end);
      dateFilter += ` AND o."orderDate" <= $${params.length}`;
    }

    // 全局统计：使用 SQL 聚合
    const summaryParams = [...params];
    const [summary] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COUNT(*)::int AS "totalOrders",
        COALESCE(SUM(o."actualPayment"), 0)::float AS "totalPayment",
        COALESCE(SUM(o."baseCommission"), 0)::float AS "totalBaseCommission",
        COALESCE(SUM(o."reviewCommission"), 0)::float AS "totalReviewCommission"
      FROM "Order" o
      WHERE 1=1${dateFilter}`,
      ...summaryParams,
    );

    const totalOrders = summary.totalOrders;
    const totalPayment = summary.totalPayment;
    const totalBaseCommission = summary.totalBaseCommission;
    const totalReviewCommission = summary.totalReviewCommission;
    const totalCommission = totalBaseCommission + totalReviewCommission;
    const avgCommissionPerOrder = totalOrders > 0 ? totalCommission / totalOrders : 0;

    // 按接单人分组聚合
    const takerParams = [...params];
    const byTakerRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        o."takerId",
        COALESCE(t."wechatName", '未匹配') AS name,
        COALESCE(t."wechatId", '') AS "wechatId",
        COUNT(*)::int AS orders,
        COALESCE(SUM(o."actualPayment"), 0)::float AS "totalPayment",
        COALESCE(SUM(o."baseCommission"), 0)::float AS "baseCommission",
        COALESCE(SUM(o."reviewCommission"), 0)::float AS "reviewCommission",
        COALESCE(SUM(o."totalRefund"), 0)::float AS "totalRefund"
      FROM "Order" o
      LEFT JOIN "OrderTaker" t ON t.id = o."takerId"
      WHERE 1=1${dateFilter}
      GROUP BY o."takerId", t."wechatName", t."wechatId"
      ORDER BY COALESCE(SUM(o."baseCommission"), 0) + COALESCE(SUM(o."reviewCommission"), 0) DESC
      LIMIT 50`,
      ...takerParams,
    );

    const byTaker = byTakerRaw.map((d) => ({
      id: d.takerId || 'unknown',
      name: d.name,
      wechatId: d.wechatId,
      orders: d.orders,
      totalPayment: d.totalPayment,
      baseCommission: d.baseCommission,
      reviewCommission: d.reviewCommission,
      totalRefund: d.totalRefund,
      avgCommission: d.orders > 0 ? (d.baseCommission + d.reviewCommission) / d.orders : 0,
    }));

    // 按商品分组聚合
    const productParams = [...params];
    const byProductRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COALESCE(o."productCode", o."productId") AS id,
        COALESCE(o."productCode", o."productId") AS code,
        COUNT(*)::int AS orders,
        COALESCE(SUM(o."actualPayment"), 0)::float AS "totalPayment",
        COALESCE(SUM(o."baseCommission"), 0)::float AS "baseCommission",
        COALESCE(SUM(o."reviewCommission"), 0)::float AS "reviewCommission"
      FROM "Order" o
      WHERE 1=1${dateFilter}
      GROUP BY COALESCE(o."productCode", o."productId")
      ORDER BY COALESCE(SUM(o."baseCommission"), 0) + COALESCE(SUM(o."reviewCommission"), 0) DESC
      LIMIT 30`,
      ...productParams,
    );

    const byProduct = byProductRaw;

    // 按月分组聚合
    const monthParams = [...params];
    const byMonthRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        TO_CHAR(o."orderDate", 'YYYY-MM') AS month,
        COUNT(*)::int AS orders,
        COALESCE(SUM(o."actualPayment"), 0)::float AS "totalPayment",
        COALESCE(SUM(o."baseCommission"), 0)::float AS "baseCommission",
        COALESCE(SUM(o."reviewCommission"), 0)::float AS "reviewCommission"
      FROM "Order" o
      WHERE 1=1${dateFilter}
      GROUP BY TO_CHAR(o."orderDate", 'YYYY-MM')
      ORDER BY month DESC`,
      ...monthParams,
    );

    const byMonth = byMonthRaw.map((d) => ({
      ...d,
      totalCommission: d.baseCommission + d.reviewCommission,
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
