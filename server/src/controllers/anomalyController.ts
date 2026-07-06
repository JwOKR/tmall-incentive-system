import { Request, Response } from 'express';
import prisma from '../utils/db';

// 异常订单预警 + 接单人状态自动变更
export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 1. 重复订单号检测
    const duplicateOrderNos = await prisma.$queryRawUnsafe<Array<{ orderNo: string; count: number }>>(
      `SELECT orderNo, COUNT(*) as count FROM orders WHERE orderNo IS NOT NULL AND orderNo != '' GROUP BY orderNo HAVING count > 1 ORDER BY count DESC LIMIT 20`
    );

    const duplicate19Nos = await prisma.$queryRawUnsafe<Array<{ orderNo19: string; count: number }>>(
      `SELECT orderNo19, COUNT(*) as count FROM orders WHERE orderNo19 IS NOT NULL AND orderNo19 != '' GROUP BY orderNo19 HAVING count > 1 ORDER BY count DESC LIMIT 20`
    );

    // 2. 超长间隔接单人（超过14天未接单的活跃接单人）
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

    const staleThreshold = 14; // 14天
    const staleTakerList = staleTakers
      .filter(t => t.orders.length > 0)
      .map(t => {
        const lastOrderDate = t.orders[0].orderDate;
        const daysSince = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          wechatName: t.wechatName,
          wechatId: t.wechatId,
          lastOrderDate: lastOrderDate.toISOString(),
          daysSinceLastOrder: daysSince,
        };
      })
      .filter(t => t.daysSinceLastOrder >= staleThreshold)
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder);

    // 3. 接单人状态自动变更：超过30天未接单 → inactive
    const autoInactiveThreshold = 30;
    const toInactive = staleTakerList.filter(t => t.daysSinceLastOrder >= autoInactiveThreshold);
    let autoInactivatedCount = 0;

    for (const taker of toInactive) {
      await prisma.orderTaker.update({
        where: { id: taker.id },
        data: { status: 'inactive' },
      });
      autoInactivatedCount++;
    }

    // 4. 汇总
    const totalAnomalies =
      duplicateOrderNos.length + duplicate19Nos.length + staleTakerList.length;

    res.json({
      success: true,
      data: {
        summary: {
          totalAnomalies,
          duplicateOrderNos: duplicateOrderNos.length,
          duplicate19Nos: duplicate19Nos.length,
          staleTakers: staleTakerList.length,
          autoInactivated: autoInactivatedCount,
        },
        duplicateOrderNos: duplicateOrderNos.map(d => ({ orderNo: d.orderNo, count: Number(d.count) })),
        duplicate19Nos: duplicate19Nos.map(d => ({ orderNo19: d.orderNo19, count: Number(d.count) })),
        staleTakers: staleTakerList,
      },
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ success: false, message: '获取异常预警失败' });
  }
};
