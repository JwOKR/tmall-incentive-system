import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Prisma 5.10 的 @default(now()) 用 new Date() 生成 UTC 时间
// 此 middleware 强制将 DateTime 字段设为北京时间，覆盖 Prisma 的 UTC 默认值
const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

function nowBeijing(): Date {
  return new Date(Date.now() + TIMEZONE_OFFSET_MS);
}

// create 操作时强制设置 createdAt/updatedAt 为北京时间
const CREATE_FIELDS = ['createdAt', 'updatedAt', 'publishDate', 'orderDate', 'recordDate'];

function forceBeijingOnCreate(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => forceBeijingOnCreate(item));
  }
  const result = { ...data };
  const now = nowBeijing();
  for (const field of CREATE_FIELDS) {
    // 如果用户没传该字段，或者传的是 Date 对象（Prisma 生成的 UTC），都强制覆盖为北京时间
    if (!result[field] || result[field] instanceof Date) {
      result[field] = now;
    }
  }
  return result;
}

// update 操作时将 updatedAt 设为北京时间
function forceBeijingOnUpdate(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const result = { ...data };
  if ('updatedAt' in result && (!result.updatedAt || result.updatedAt instanceof Date)) {
    result.updatedAt = nowBeijing();
  }
  return result;
}

prisma.$use(async (params, next) => {
  // create / createMany：强制所有时间字段为北京时间
  if (params.action === 'create' || params.action === 'createMany') {
    if (params.args?.data) {
      params.args.data = forceBeijingOnCreate(params.args.data);
    }
  }

  // update / updateMany：updatedAt 强制北京时间
  if (params.action === 'update' || params.action === 'updateMany') {
    if (params.args?.data) {
      params.args.data = forceBeijingOnUpdate(params.args.data);
    }
  }

  // upsert：create 和 update 分别处理
  if (params.action === 'upsert') {
    if (params.args?.create) {
      params.args.create = forceBeijingOnCreate(params.args.create);
    }
    if (params.args?.update) {
      params.args.update = forceBeijingOnUpdate(params.args.update);
    }
  }

  return next(params);
});

export default prisma;
