import bcrypt from 'bcryptjs';
import prisma from './db';
import logger from './logger';

/**
 * 确保默认管理员用户存在
 * 在服务器启动时自动调用
 */
export async function ensureAdminUser() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'JIA';
    const adminPassword = process.env.ADMIN_PASSWORD || 'yw551129';

    const existing = await prisma.user.findUnique({
      where: { username: adminUsername },
    });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await prisma.user.create({
        data: {
          username: adminUsername,
          password: hashedPassword,
          role: 'admin',
        },
      });
      logger.info(`Default admin user created: ${adminUsername} / ${adminPassword}`);
    } else {
      logger.info('Admin user already exists');
    }
  } catch (error) {
    logger.error('Failed to ensure admin user:', error);
  }
}

/**
 * 启动时自动检查异常：超过30天未接单的活跃接单人自动标记为 inactive
 */
export async function autoCheckAnomalies() {
  try {
    const now = new Date();
    const threshold = 30;
    const cutoff = new Date(now.getTime() - threshold * 24 * 60 * 60 * 1000);

    // 找出活跃但最近30天内没有订单的接单人
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

    let count = 0;
    for (const taker of staleTakers) {
      const lastDate = taker.orders.length > 0 ? taker.orders[0].orderDate : taker.createdAt;
      if (lastDate < cutoff) {
        await prisma.orderTaker.update({
          where: { id: taker.id },
          data: { status: 'inactive' },
        });
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Auto-inactivated ${count} takers (no orders in ${threshold} days)`);
    }
  } catch (error) {
    logger.error('Failed to auto-check anomalies:', error);
  }
}
