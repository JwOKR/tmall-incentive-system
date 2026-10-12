import { Request, Response } from 'express';
import prisma from '../utils/db';
import { formatAmount, groupOrdersByTaker, diffInDays } from '../utils/remindList';
import { parseRefundAlertDays, getRefundAlertDays } from '../services/systemSettingService';

// 生成催单列表（限制最近30天，避免加载全量订单）
export const getRemindList = async (req: Request, res: Response) => {
  try {
    const { type = 'refund', days = '30' } = req.query; // refund | review | both

    // 默认只加载最近N天的订单，避免全量加载
    const daysNum = parseInt(days as string, 10) || 30;
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysNum);

    // 获取未返款/未好评订单
    // isGoodReview 是字符串类型: "pending"(未好评), "reviewed"(已好评), "creating"(作图中), "returned"(已返图)
    const where: any = { orderDate: { gte: dateLimit } };
    if (type === 'refund') {
      where.isRefunded = false;
    } else if (type === 'review') {
      where.isGoodReview = { not: 'reviewed' }; // 未好评的订单
    } else {
      where.OR = [
        { isRefunded: false },
        { isGoodReview: { not: 'reviewed' } } // 未好评的订单
      ];
    }

    const pendingOrders = await prisma.order.findMany({
      where,
      include: {
        taker: { select: { id: true, wechatName: true, wechatId: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    // 按接单人分组（纯逻辑抽到 utils/remindList，与「超期未返款看板」共用同一口径）
    const result = groupOrdersByTaker(pendingOrders);

    // 生成可复制的催单文本（金额格式化复用提醒模块的 formatAmount，口径与看板一致）
    let copyText = `待处理催单列表\n`;
    copyText += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    copyText += `共 ${result.length} 人需处理\n\n`;

    for (const taker of result) {
      copyText += `【${taker.wechatName}】(${taker.wechatId})\n`;
      if (taker.unpaidOrders.length > 0) {
        copyText += `  待返款 ${taker.unpaidOrders.length} 单:\n`;
        for (const o of taker.unpaidOrders) {
          copyText += `    ${o.orderNo19 || '未填写'} - ¥${formatAmount(o.actualPayment)}\n`;
        }
      }
      if (taker.unreviewedOrders.length > 0) {
        copyText += `  待好评 ${taker.unreviewedOrders.length} 单:\n`;
        for (const o of taker.unreviewedOrders) {
          copyText += `    ${o.orderNo19 || '未填写'} - 佣金¥${formatAmount(o.baseCommission)}\n`;
        }
      }
      copyText += `\n`;
    }

    res.json({
      success: true,
      data: {
        list: result,
        copyText,
        totalTakers: result.length,
        totalPendingOrders: pendingOrders.length,
      },
    });
  } catch (error) {
    console.error('Error generating remind list:', error);
    res.status(500).json({ success: false, message: '生成催单列表失败' });
  }
};

// ──────────────────────────────────────
// 超期未返款看板
//
// ⚠️ 与上方催单列表的 days 语义**方向相反**：
//   - 催单列表：days = 「最近 N 天内」（orderDate >= now - N），是催单窗口；
//   - 本看板：  days = 「超过 N 天」（orderDate <= now - N）。
// 两者各自独立、互不影响（催单列表的 where 未做任何改动）。
// ──────────────────────────────────────
export const getRefundAlerts = async (req: Request, res: Response) => {
  try {
    // days：显式传参则解析（1..365，非法回落 30），否则读系统设置
    const days = req.query.days !== undefined
      ? parseRefundAlertDays(req.query.days)
      : await getRefundAlertDays();

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // 多取 1 天的宽松下界（第 N 天当天的不含时分秒歧义），随后在内存里用 diffInDays 精确过滤
    const lowerBound = new Date(todayStart);
    lowerBound.setDate(lowerBound.getDate() - (days - 1));

    const candidates = await prisma.order.findMany({
      where: { isRefunded: false, orderDate: { lte: lowerBound } },
      select: {
        id: true,
        orderNo19: true,
        orderNo: true,
        actualPayment: true,
        baseCommission: true,
        orderDate: true,
        isRefunded: true,
        isGoodReview: true,
        takerId: true,
        taker: { select: { wechatName: true, wechatId: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    // 精确的「超 N 天」语义：自然日差 >= days
    const overdue = candidates.filter((o: any) => diffInDays(o.orderDate, now) >= days);

    // 统计被分组逻辑跳过的订单数：谓词与 groupOrdersByTaker 的
    // `if (!order.takerId || !order.taker) continue;` **完全一致**，
    // 保证任何未纳入分组的订单都会被计数，绝不静默丢弃
    // （含 takerId 有值但关联 taker 对象缺失的情况）。
    let skippedNoTaker = 0;
    for (const o of overdue) {
      if (!o.takerId || !o.taker) skippedNoTaker++;
    }

    // 复用共享分组逻辑，只保留「有未返款订单」的分组
    const groups = groupOrdersByTaker(overdue).filter(g => g.unpaidOrders.length > 0);

    const list = groups
      .map(g => {
        const overdueOrders = g.unpaidOrders.map(o => ({
          orderId: o.orderId,
          orderNo19: o.orderNo19,
          actualPayment: o.actualPayment,
          orderDate: o.orderDate,
          overdueDays: diffInDays(o.orderDate, now),
        }));
        const totalAmount = overdueOrders.reduce((s, o) => s + (o.actualPayment || 0), 0);
        const maxOverdueDays = overdueOrders.reduce((m, o) => Math.max(m, o.overdueDays), 0);
        return {
          takerId: g.takerId,
          wechatName: g.wechatName,
          wechatId: g.wechatId,
          overdueOrders,
          totalAmount,
          maxOverdueDays,
        };
      })
      // 最紧急在前：最长超期天数降序，同分按超期单数降序
      .sort((a, b) => (b.maxOverdueDays - a.maxOverdueDays) || (b.overdueOrders.length - a.overdueOrders.length));

    const totalTakers = list.length;
    const totalOrders = list.reduce((s, g) => s + g.overdueOrders.length, 0);
    const totalAmount = list.reduce((s, g) => s + g.totalAmount, 0);
    const oldestOverdueDays = list.reduce((m, g) => Math.max(m, g.maxOverdueDays), 0);

    // 生成可复制的对账文本（金额用 formatAmount，不加千分号，与催单文本风格一致）
    let copyText = `超期未返款对账（超 ${days} 天）\n`;
    copyText += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    copyText += `共 ${totalTakers} 人 · ${totalOrders} 单 · 合计 ¥${formatAmount(totalAmount)}\n\n`;

    for (const g of list) {
      copyText += `【${g.wechatName}】(${g.wechatId}) · ${g.overdueOrders.length} 单 · 合计 ¥${formatAmount(g.totalAmount)}\n`;
      for (const o of g.overdueOrders) {
        copyText += `  ${o.orderNo19 || '未填写'} - ¥${formatAmount(o.actualPayment)} - 已超期 ${o.overdueDays} 天\n`;
      }
      copyText += `\n`;
    }

    res.json({
      success: true,
      data: {
        days,
        list,
        copyText,
        summary: { days, totalTakers, totalOrders, totalAmount, skippedNoTaker, oldestOverdueDays },
      },
    });
  } catch (error) {
    console.error('Error generating refund alerts:', error);
    res.status(500).json({ success: false, message: '生成超期未返款看板失败' });
  }
};