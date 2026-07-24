import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Prisma 5.10 的 @default(now()) 用客户端 new Date() 生成 UTC 时间
// 此 middleware 在 create 时删除时间字段，让 MySQL 的 DEFAULT CURRENT_TIMESTAMP (NOW()) 生效
// MySQL 容器已设 TZ=Asia/Shanghai，NOW() 返回北京时间

// 所有可能有 @default(now()) 的时间字段
const TIME_FIELDS = ['createdAt', 'updatedAt', 'publishDate', 'orderDate', 'recordDate'];

function stripTimeFields(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => stripTimeFields(item));
  }
  const result = { ...data };
  for (const field of TIME_FIELDS) {
    // 只删除 Prisma 自动生成的 Date 对象，保留用户明确传入的非 Date 值（如字符串）
    if (field in result && result[field] instanceof Date) {
      delete result[field];
    }
  }
  return result;
}

prisma.$use(async (params, next) => {
  // create / createMany：删除 Prisma 自动生成的时间，让 MySQL 用 NOW()
  if (params.action === 'create' || params.action === 'createMany') {
    if (params.args?.data) {
      params.args.data = stripTimeFields(params.args.data);
    }
  }

  // upsert 的 create 部分同样处理
  if (params.action === 'upsert' && params.args?.create) {
    params.args.create = stripTimeFields(params.args.create);
  }

  // update 操作：updatedAt 由 MySQL ON UPDATE CURRENT_TIMESTAMP 自动处理
  // 不需要在 middleware 里设置

  return next(params);
});

export default prisma;
