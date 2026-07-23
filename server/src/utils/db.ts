import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// 显式设置 MySQL 会话时区为北京时间，确保 @default(now()) 和 @updatedAt 写入正确的时间
// 偏移量格式 '+08:00' 不依赖 MySQL 时区表，兼容性最好
prisma.$executeRawUnsafe("SET time_zone = '+08:00'").catch((err) => {
  console.error('Failed to set MySQL session timezone:', err);
});

export default prisma;
