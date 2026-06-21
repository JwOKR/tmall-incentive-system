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
