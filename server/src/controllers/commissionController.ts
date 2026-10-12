import { Request, Response } from 'express';
import prisma from '../utils/db';

/**
 * 安全比率计算：当分母 <= 0，或任一操作数为非有限数（NaN / Infinity）时返回 null。
 *
 * 口径选择：分母为 0（或非法）时返回 **null**（不是 0），语义为「不可计算」，
 * 避免前端把 0 误读成「占比 0%」。前端渲染 null 时显示 '—'。
 *
 * 该函数被导出以便单元测试直接驱动（分母为 0 的边界无需构造数据库即可验证）。
 */
export function safeRatio(numerator: number, denominator: number): number | null {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  const r = n / d;
  return Number.isFinite(r) ? r : null;
}

// 佣金成本分析 + ROI 效率（使用数据库聚合，避免加载全量订单到内存）
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
    // 口径说明（务必与全站一致）：
    //   1) totalRefund 恒为「实付 + 基础返佣 + 好评返佣」（见 orderService），故直接 SUM(o.totalRefund)
    //      即与 Dashboard / 接单人详情 / 任务完结 / 导出 同口径，不使用订单页的「显示口径」。
    //   2) 「已好评返佣」只统计 isGoodReview = 'reviewed' 的单 —— isGoodReview 是字符串状态字段，
    //      一律用字符串比较，禁止真值判断（'pending' 等非空字符串真值判断会误命中）。
    //   3) 「未返款」按订单级 isRefunded = 0 判定，绝不掺入分项级 isBaseCommissionRefunded。
    const summaryParams = [...params];
    const [summary] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(o.actualPayment), 0) AS totalPayment,
        COALESCE(SUM(o.baseCommission), 0) AS totalBaseCommission,
        COALESCE(SUM(o.reviewCommission), 0) AS totalReviewCommission,
        COALESCE(SUM(CASE WHEN o.isGoodReview = 'reviewed' THEN o.reviewCommission ELSE 0 END), 0) AS reviewedReviewCommission,
        COALESCE(SUM(CASE WHEN o.isRefunded = 0 THEN 1 ELSE 0 END), 0) AS unpaidOrders,
        COALESCE(SUM(o.totalRefund), 0) AS totalRefundAmount,
        COALESCE(SUM(CASE WHEN o.isRefunded = 0 THEN o.totalRefund ELSE 0 END), 0) AS unpaidRefundAmount
      FROM orders o
      WHERE 1=1${dateFilter}`,
      ...summaryParams,
    );

    const totalOrders = Number(summary.totalOrders);
    const totalPayment = Number(summary.totalPayment);
    const totalBaseCommission = Number(summary.totalBaseCommission);
    const totalReviewCommission = Number(summary.totalReviewCommission);
    const reviewedReviewCommission = Number(summary.reviewedReviewCommission);
    const unpaidOrders = Number(summary.unpaidOrders);
    const totalRefundAmount = Number(summary.totalRefundAmount);
    const unpaidRefundAmount = Number(summary.unpaidRefundAmount);
    const totalCommission = totalBaseCommission + totalReviewCommission;
    // 保留既有字段口径：单均佣金分母为 0 时维持 0（前端与既有用法均依赖，不改动为 null）
    const avgCommissionPerOrder = totalOrders > 0 ? totalCommission / totalOrders : 0;

    // ── 新增 ROI 指标（后端计算，前端只展示）──
    // 返款/实付比（核心 ROI）：佣金成本 ÷ 实付总额；实付为 0 → null
    const commissionToPaymentRatio = safeRatio(totalCommission, totalPayment);
    // 未返款率（口径选定：未返款单数 ÷ 总单数）；总单数为 0 → null
    const unpaidRate = safeRatio(unpaidOrders, totalOrders);

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
        COALESCE(SUM(o.totalRefund), 0) AS totalRefund,
        COALESCE(SUM(CASE WHEN o.isRefunded = 0 THEN 1 ELSE 0 END), 0) AS unpaidOrders
      FROM orders o
      LEFT JOIN order_takers t ON t.id = o.takerId
      WHERE 1=1${dateFilter}
      GROUP BY o.takerId, t.wechatName, t.wechatId
      ORDER BY COALESCE(SUM(o.baseCommission), 0) + COALESCE(SUM(o.reviewCommission), 0) DESC
      LIMIT 50`,
      ...takerParams,
    );

    const byTaker = byTakerRaw.map((d: any) => {
      const orders = Number(d.orders);
      const totalPayment = Number(d.totalPayment);
      const baseCommission = Number(d.baseCommission);
      const reviewCommission = Number(d.reviewCommission);
      const unpaidOrders = Number(d.unpaidOrders);
      const totalCommission = baseCommission + reviewCommission;
      return {
        id: d.takerId || 'unknown',
        name: d.name,
        wechatId: d.wechatId,
        orders,
        totalPayment,
        baseCommission,
        reviewCommission,
        totalRefund: Number(d.totalRefund),
        // 保留既有字段口径（分母为 0 → 0）
        avgCommission: orders > 0 ? totalCommission / orders : 0,
        // 新增：未返款单数 + 两个比率（分母为 0 → null）
        unpaidOrders,
        commissionToPaymentRatio: safeRatio(totalCommission, totalPayment),
        unpaidRate: safeRatio(unpaidOrders, orders),
      };
    });

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

    const byProduct = byProductRaw.map((d: any) => {
      const totalPayment = Number(d.totalPayment);
      const baseCommission = Number(d.baseCommission);
      const reviewCommission = Number(d.reviewCommission);
      return {
        ...d,
        orders: Number(d.orders),
        totalPayment,
        baseCommission,
        reviewCommission,
        // 新增：单商品返款/实付比（分母为 0 → null）
        commissionToPaymentRatio: safeRatio(baseCommission + reviewCommission, totalPayment),
      };
    });

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

    const byMonth = byMonthRaw.map((d: any) => {
      const totalPayment = Number(d.totalPayment);
      const baseCommission = Number(d.baseCommission);
      const reviewCommission = Number(d.reviewCommission);
      return {
        ...d,
        orders: Number(d.orders),
        totalPayment,
        baseCommission,
        reviewCommission,
        totalCommission: baseCommission + reviewCommission,
        // 新增：单月返款/实付比（分母为 0 → null）
        commissionToPaymentRatio: safeRatio(baseCommission + reviewCommission, totalPayment),
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalOrders,
          totalPayment,
          totalBaseCommission,
          totalReviewCommission,
          totalCommission,
          avgCommissionPerOrder,
          // ── 新增 ROI 字段 ──
          reviewedReviewCommission,
          unpaidOrders,
          totalRefundAmount,
          unpaidRefundAmount,
          commissionToPaymentRatio,
          unpaidRate,
        },
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
