import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// 诊断：启动时检查 MySQL 会话时区是否正确
// timezone=local 配合容器的 TZ=Asia/Shanghai，会话时区应为 +08:00
prisma.$queryRaw`SELECT @@session.time_zone AS session_tz, NOW() AS db_now`
  .then((result: any) => {
    console.log('[timezone] session_timeZone:', result[0]?.session_tz, '| db_now:', result[0]?.db_now);
  })
  .catch((err) => {
    console.error('[timezone] Failed to check session timezone:', err);
  });

export default prisma;
