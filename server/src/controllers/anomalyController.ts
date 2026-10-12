import { Request, Response } from 'express';
import prisma from '../utils/db';

// 异常订单预警（**纯只读**，不再在 GET 内改库）
export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 1. 双单号全空检测 = 无法对账的废单。
    //    @unique 对 NULL 不生效（MySQL 允许多个 NULL），这类行不会被唯一约束拦住，
    //    是唯一会真正溜进来的脏数据来源。
    //    注：orderNo / orderNo19 的精确重复由数据库唯一约束保证，不可能存在，故不做重复检测。
    const missingNoWhere = {
      AND: [
        { OR: [{ orderNo: null }, { orderNo: '' }] },
        { OR: [{ orderNo19: null }, { orderNo19: '' }] },
      ],
    };
    const missingOrderNoCount = await prisma.order.count({ where: missingNoWhere });
    const missingOrderNoOrders = await prisma.order.findMany({
      where: missingNoWhere,
      select: {
        id: true,
        actualPayment: true,
        orderDate: true,
        taker: { select: { wechatName: true, wechatId: true } },
      },
      orderBy: { orderDate: 'desc' },
      take: 50,
    });

    // 2. 超长间隔接单人（超过 14 天未接单的活跃接单人）——纯读取，不做状态变更
    const staleTakers = await prisma.orderTaker.findMany({
      where: { status: 'active' },
      include: {
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 1,
          select: { orderDate: true },
        },
      },
    });

    const staleThreshold = 14; // 展示阈值
    const staleTakerList = staleTakers
      .map(t => {
        const lastOrderDate = t.orders.length > 0 ? t.orders[0].orderDate : null;
        // 与 bootstrap.autoCheckAnomalies 同一口径：从未接单时以注册时间为最后一次活动
        const lastActivity = lastOrderDate ?? t.createdAt;
        const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          wechatName: t.wechatName,
          wechatId: t.wechatId,
          lastOrderDate: lastOrderDate ? lastOrderDate.toISOString() : null,
          lastActivityAt: lastActivity.toISOString(),
          daysSinceLastOrder: daysSince,
          neverOrdered: lastOrderDate === null,
        };
      })
      .filter(t => t.daysSinceLastOrder >= staleThreshold)
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder);

    res.json({
      success: true,
      data: {
        summary: {
          totalAnomalies: missingOrderNoCount + staleTakerList.length,
          missingOrderNo: missingOrderNoCount, // 双单号全空（总数，非展示数）
          staleTakers: staleTakerList.length,
        },
        missingOrderNoOrders: missingOrderNoOrders.map(o => ({
          id: o.id,
          actualPayment: o.actualPayment,
          orderDate: o.orderDate.toISOString(),
          wechatName: o.taker?.wechatName ?? null,
          wechatId: o.taker?.wechatId ?? null,
        })),
        staleTakers: staleTakerList,
      },
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ success: false, message: '获取异常预警失败' });
  }
};
