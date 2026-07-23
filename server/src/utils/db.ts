import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Prisma 5.10 的 @default(now()) 用 new Date() 生成 UTC 时间
// 此 middleware 将所有 DateTime 字段从 UTC 转为北京时间（+8 小时）
const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATETIME_FIELDS = ['createdAt', 'updatedAt', 'publishDate', 'orderDate', 'refundDate', 'reviewCommissionDate', 'recordDate'];

function toBeijingTime(value: any): any {
  if (value instanceof Date) {
    return new Date(value.getTime() + TIMEZONE_OFFSET_MS);
  }
  return value;
}

function convertDataTimeFields(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(convertDataTimeFields);
  }
  const result = { ...data };
  for (const field of DATETIME_FIELDS) {
    if (field in result) {
      result[field] = toBeijingTime(result[field]);
    }
  }
  return result;
}

prisma.$use(async (params, next) => {
  const actions = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
  if (actions.includes(params.action) && params.args?.data) {
    params.args.data = convertDataTimeFields(params.args.data);
  }
  if (params.action === 'upsert' && params.args?.create) {
    params.args.create = convertDataTimeFields(params.args.create);
  }
  if (params.action === 'upsert' && params.args?.update) {
    params.args.update = convertDataTimeFields(params.args.update);
  }
  return next(params);
});

export default prisma;
