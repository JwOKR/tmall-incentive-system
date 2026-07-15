import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog, getClientIp } from '../utils/auditLog';

// 导出全部数据（JSON）
export const exportBackup = async (req: Request, res: Response) => {
  try {
    const [users, takers, tasks, orders, logs, repeatDiscounts] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, username: true, role: true, createdAt: true },
      }),
      prisma.orderTaker.findMany(),
      prisma.task.findMany(),
      prisma.order.findMany(),
      prisma.log.findMany(),
      prisma.repeatDiscount.findMany(),
    ]);

    const backup = {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      data: {
        users: users.map(u => ({ ...u, password: '[REDACTED]' })), // 不导出密码
        orderTakers: takers,
        tasks,
        orders,
        logs,
        repeatDiscounts,
      },
      summary: {
        users: users.length,
        takers: takers.length,
        tasks: tasks.length,
        orders: orders.length,
        logs: logs.length,
        repeatDiscounts: repeatDiscounts.length,
      },
    };

    // 设置下载响应头
    const filename = `tmall-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await createAuditLog({
      action: 'backup_export',
      detail: `导出数据备份: ${takers.length}接单人, ${tasks.length}任务, ${orders.length}订单, ${logs.length}日志, ${repeatDiscounts.length}回头客立减`,
      ipAddress: getClientIp(req),
    });

    res.json(backup);
  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ success: false, message: '导出备份失败' });
  }
};

// 导入备份数据
export const importBackup = async (req: Request, res: Response) => {
  try {
    const { data, mode = 'merge' } = req.body; // mode: merge | overwrite

    if (!data) {
      return res.status(400).json({ success: false, message: '请提供备份数据' });
    }

    const result = {
      takers: { created: 0, skipped: 0, errors: 0 },
      tasks: { created: 0, skipped: 0, errors: 0 },
      orders: { created: 0, skipped: 0, errors: 0 },
      repeatDiscounts: { created: 0, skipped: 0, errors: 0 },
    };

    // 导入接单人
    if (data.orderTakers?.length) {
      for (const taker of data.orderTakers) {
        try {
          if (mode === 'merge') {
            const existing = await prisma.orderTaker.findUnique({
              where: { wechatId: taker.wechatId },
            });
            if (existing) { result.takers.skipped++; continue; }
          }
          await prisma.orderTaker.create({
            data: {
              id: taker.id,
              wechatName: taker.wechatName,
              wechatId: taker.wechatId,
              status: taker.status || 'active',
              totalOrders: taker.totalOrders || 0,
              totalAmount: taker.totalAmount || 0,
              createdAt: taker.createdAt ? new Date(taker.createdAt) : new Date(),
            },
          });
          result.takers.created++;
        } catch { result.takers.errors++; }
      }
    }

    // 导入任务
    if (data.tasks?.length) {
      for (const task of data.tasks) {
        try {
          if (mode === 'merge') {
            const existing = await prisma.task.findUnique({
              where: { id: task.id },
            });
            if (existing) { result.tasks.skipped++; continue; }
          }
          await prisma.task.create({
            data: {
              id: task.id,
              publishDate: task.publishDate ? new Date(task.publishDate) : new Date(),
              productId: task.productId || '',
              productCode: task.productCode || '',
              taoToken: task.taoToken || null,
              price: task.price || 0,
              baseCommission: task.baseCommission ?? 5,
              reviewReward: task.reviewReward ?? 0,
              maxOrders: task.maxOrders ?? 1,
              currentOrders: task.currentOrders ?? 0,
              status: task.status || 'active',
              createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
            },
          });
          result.tasks.created++;
        } catch { result.tasks.errors++; }
      }
    }

    // 导入订单
    if (data.orders?.length) {
      for (const order of data.orders) {
        try {
          if (mode === 'merge') {
            // 用 orderNo19 或 orderNo 去重
            if (order.orderNo19) {
              const existing = await prisma.order.findFirst({ where: { orderNo19: order.orderNo19 } });
              if (existing) { result.orders.skipped++; continue; }
            }
          }
          await prisma.order.create({
            data: {
              id: order.id,
              orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
              taskId: order.taskId || null,
              takerId: order.takerId || null,
              productId: order.productId || '',
              productCode: order.productCode || '',
              orderNo19: order.orderNo19 || null,
              orderNo: order.orderNo || null,
              orderLink: order.orderLink || null,
              actualPayment: order.actualPayment ?? 0,
              totalRefund: order.totalRefund ?? 0,
              isRefunded: order.isRefunded ?? false,
              refundDate: order.refundDate ? new Date(order.refundDate) : null,
              isGoodReview: order.isGoodReview ?? false,
              baseCommission: order.baseCommission ?? 5,
              reviewCommission: order.reviewCommission ?? 0,
              reviewCommissionDate: order.reviewCommissionDate ? new Date(order.reviewCommissionDate) : null,
              remark: order.remark || null,
              createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
            },
          });
          result.orders.created++;
        } catch { result.orders.errors++; }
      }
    }

    // 导入回头客立减
    if (data.repeatDiscounts?.length) {
      for (const rd of data.repeatDiscounts) {
        try {
          if (mode === 'merge') {
            const recordDate = new Date(rd.recordDate);
            const existing = await prisma.repeatDiscount.findUnique({ where: { recordDate } });
            if (existing) { result.repeatDiscounts.skipped++; continue; }
          }
          await prisma.repeatDiscount.create({
            data: {
              id: rd.id,
              recordDate: new Date(rd.recordDate),
              g1GrantAmount: rd.g1GrantAmount ?? 0,
              g1PaymentAmount: rd.g1PaymentAmount ?? 0,
              g1PaymentBuyers: rd.g1PaymentBuyers ?? 0,
              g1PaymentItems: rd.g1PaymentItems ?? 0,
              g2GrantAmount: rd.g2GrantAmount ?? 0,
              g2PaymentAmount: rd.g2PaymentAmount ?? 0,
              g2PaymentBuyers: rd.g2PaymentBuyers ?? 0,
              g2PaymentItems: rd.g2PaymentItems ?? 0,
            },
          });
          result.repeatDiscounts.created++;
        } catch { result.repeatDiscounts.errors++; }
      }
    }

    await createAuditLog({
      action: 'backup_import',
      detail: `导入备份(${mode}): 接单人${result.takers.created}个, 任务${result.tasks.created}个, 订单${result.orders.created}个, 回头客立减${result.repeatDiscounts.created}个`,
      ipAddress: getClientIp(req),
    });

    res.json({
      success: true,
      data: result,
      message: `导入完成: 接单人${result.takers.created}个, 任务${result.tasks.created}个, 订单${result.orders.created}个, 回头客立减${result.repeatDiscounts.created}个`,
    });
  } catch (error) {
    console.error('Backup import error:', error);
    res.status(500).json({ success: false, message: '导入备份失败' });
  }
};
