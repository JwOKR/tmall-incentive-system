import prisma from '../utils/db';

// ──────────────────────────────────────
// 类型定义
// ──────────────────────────────────────
export interface RepeatDiscountListParams {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}

export interface RepeatDiscountCreateInput {
  recordDate: string;       // YYYY-MM-DD
  grantAmount?: number;     // 发放金额
  paymentAmount?: number;   // 支付金额
  paymentBuyers?: number;   // 支付买家数
  paymentItems?: number;    // 支付件数
}

export interface RepeatDiscountUpdateInput {
  recordDate?: string;
  grantAmount?: number;
  paymentAmount?: number;
  paymentBuyers?: number;
  paymentItems?: number;
}

// ──────────────────────────────────────
// 查询：列表
// ──────────────────────────────────────
export async function getRepeatDiscountList(params: RepeatDiscountListParams) {
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const { startDate, endDate } = params;

  const where: any = {};

  if (startDate || endDate) {
    where.recordDate = {};
    if (startDate) where.recordDate.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.recordDate.lte = end;
    }
  }

  const [list, total] = await Promise.all([
    prisma.repeatDiscount.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { recordDate: 'desc' },
    }),
    prisma.repeatDiscount.count({ where }),
  ]);

  return { list, total, page, pageSize };
}

// ──────────────────────────────────────
// 查询：单条
// ──────────────────────────────────────
export async function getRepeatDiscountById(id: string) {
  return prisma.repeatDiscount.findUnique({ where: { id } });
}

// ──────────────────────────────────────
// 新增
// ──────────────────────────────────────
export async function createRepeatDiscount(data: RepeatDiscountCreateInput) {
  const recordDate = new Date(data.recordDate);

  // 检查日期是否已存在
  const existing = await prisma.repeatDiscount.findUnique({ where: { recordDate } });
  if (existing) {
    throw new Error(`${data.recordDate} 已有记录，请直接编辑`);
  }

  return prisma.repeatDiscount.create({
    data: {
      recordDate,
      grantAmount: data.grantAmount ?? 0,
      paymentAmount: data.paymentAmount ?? 0,
      paymentBuyers: data.paymentBuyers ?? 0,
      paymentItems: data.paymentItems ?? 0,
    },
  });
}

// ──────────────────────────────────────
// 编辑
// ──────────────────────────────────────
export async function updateRepeatDiscount(id: string, data: RepeatDiscountUpdateInput) {
  const updateData: any = {};

  if (data.recordDate !== undefined) {
    const newDate = new Date(data.recordDate);
    // 检查新日期是否与其他记录冲突
    const conflict = await prisma.repeatDiscount.findFirst({
      where: { recordDate: newDate, id: { not: id } },
    });
    if (conflict) {
      throw new Error(`${data.recordDate} 已有记录`);
    }
    updateData.recordDate = newDate;
  }

  if (data.grantAmount !== undefined) updateData.grantAmount = data.grantAmount;
  if (data.paymentAmount !== undefined) updateData.paymentAmount = data.paymentAmount;
  if (data.paymentBuyers !== undefined) updateData.paymentBuyers = data.paymentBuyers;
  if (data.paymentItems !== undefined) updateData.paymentItems = data.paymentItems;

  return prisma.repeatDiscount.update({ where: { id }, data: updateData });
}

// ──────────────────────────────────────
// 删除
// ──────────────────────────────────────
export async function deleteRepeatDiscount(id: string) {
  return prisma.repeatDiscount.delete({ where: { id } });
}

// ──────────────────────────────────────
// 汇总统计
// ──────────────────────────────────────
export async function getRepeatDiscountSummary(startDate?: string, endDate?: string) {
  const where: any = {};

  if (startDate || endDate) {
    where.recordDate = {};
    if (startDate) where.recordDate.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.recordDate.lte = end;
    }
  }

  const result = await prisma.repeatDiscount.aggregate({
    where,
    _sum: {
      grantAmount: true,
      paymentAmount: true,
      paymentBuyers: true,
      paymentItems: true,
    },
    _count: true,
  });

  return {
    totalDays: result._count,
    totalGrantAmount: result._sum.grantAmount ?? 0,
    totalPaymentAmount: result._sum.paymentAmount ?? 0,
    totalPaymentBuyers: result._sum.paymentBuyers ?? 0,
    totalPaymentItems: result._sum.paymentItems ?? 0,
  };
}
