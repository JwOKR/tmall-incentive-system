import { Request, Response } from 'express';
import prisma from '../utils/db';

// 生成催单列表
export const getRemindList = async (req: Request, res: Response) => {
  try {
    const { type = 'refund' } = req.query; // refund | review | both

    // 获取所有接单人
    const takers = await prisma.orderTaker.findMany({
      where: { status: 'active' },
      select: { id: true, wechatName: true, wechatId: true },
    });

    // 获取未返款/未好评订单
    const where: any = {};
    if (type === 'refund') where.isRefunded = false;
    else if (type === 'review') where.isGoodReview = false;
    else {
      where.OR = [{ isRefunded: false }, { isGoodReview: false }];
    }

    const pendingOrders = await prisma.order.findMany({
      where,
      include: {
        taker: { select: { id: true, wechatName: true, wechatId: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    // 按接单人分组
    const takerMap = new Map<string, {
      wechatName: string;
      wechatId: string;
      unpaidOrders: Array<{ orderId: string; orderNo19: string | null; actualPayment: number; orderDate: Date }>;
      unreviewedOrders: Array<{ orderId: string; orderNo19: string | null; baseCommission: number; orderDate: Date }>;
    }>();

    for (const order of pendingOrders) {
      if (!order.takerId || !order.taker) continue;
      const tid = order.takerId;
      if (!takerMap.has(tid)) {
        takerMap.set(tid, {
          wechatName: order.taker.wechatName,
          wechatId: order.taker.wechatId,
          unpaidOrders: [],
          unreviewedOrders: [],
        });
      }
      const entry = takerMap.get(tid)!;
      if (!order.isRefunded) {
        entry.unpaidOrders.push({
          orderId: order.id,
          orderNo19: order.orderNo19,
          actualPayment: order.actualPayment,
          orderDate: order.orderDate,
        });
      }
      if (!order.isGoodReview) {
        entry.unreviewedOrders.push({
          orderId: order.id,
          orderNo19: order.orderNo19,
          baseCommission: order.baseCommission,
          orderDate: order.orderDate,
        });
      }
    }

    // 转为数组并排序（待处理数量最多的排前面）
    const result = Array.from(takerMap.entries())
      .map(([id, data]) => ({
        takerId: id,
        ...data,
        totalPending: data.unpaidOrders.length + data.unreviewedOrders.length,
      }))
      .sort((a, b) => b.totalPending - a.totalPending);

    // 生成可复制的催单文本
    const fmt = (n: number) => {
      const fixed = n.toFixed(2);
      return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
    };

    let copyText = `待处理催单列表\n`;
    copyText += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    copyText += `共 ${result.length} 人需处理\n\n`;

    for (const taker of result) {
      copyText += `【${taker.wechatName}】(${taker.wechatId})\n`;
      if (taker.unpaidOrders.length > 0) {
        copyText += `  待返款 ${taker.unpaidOrders.length} 单:\n`;
        for (const o of taker.unpaidOrders) {
          copyText += `    ${o.orderNo19 || '未填写'} - ¥${fmt(o.actualPayment)}\n`;
        }
      }
      if (taker.unreviewedOrders.length > 0) {
        copyText += `  待好评 ${taker.unreviewedOrders.length} 单:\n`;
        for (const o of taker.unreviewedOrders) {
          copyText += `    ${o.orderNo19 || '未填写'} - 佣金¥${fmt(o.baseCommission)}\n`;
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
