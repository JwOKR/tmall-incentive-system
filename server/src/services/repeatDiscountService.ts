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

export interface GroupData {
  grantAmount?: number;   // 发放金额
  paymentAmount?: number; // 支付金额
  paymentBuyers?: number; // 支付买家数
  paymentItems?: number;  // 支付件数
}

export interface RepeatDiscountCreateInput {
  recordDate: string;     // YYYY-MM-DD
  g1?: GroupData;         // 近2年已购用户
  g2?: GroupData;         // 60天沉睡人群
}

export interface RepeatDiscountUpdateInput {
  recordDate?: string;
  g1?: GroupData;
  g2?: GroupData;
}

// ──────────────────────────────────────
// ROI 计算
// ──────────────────────────────────────
export function calcROI(payment: number, grant: number): number {
  if (!grant || grant === 0) return 0;
  return payment / grant;
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

  const existing = await prisma.repeatDiscount.findUnique({ where: { recordDate } });
  if (existing) {
    throw new Error(`${data.recordDate} 已有记录，请直接编辑`);
  }

  return prisma.repeatDiscount.create({
    data: {
      recordDate,
      g1GrantAmount: data.g1?.grantAmount ?? 0,
      g1PaymentAmount: data.g1?.paymentAmount ?? 0,
      g1PaymentBuyers: data.g1?.paymentBuyers ?? 0,
      g1PaymentItems: data.g1?.paymentItems ?? 0,
      g2GrantAmount: data.g2?.grantAmount ?? 0,
      g2PaymentAmount: data.g2?.paymentAmount ?? 0,
      g2PaymentBuyers: data.g2?.paymentBuyers ?? 0,
      g2PaymentItems: data.g2?.paymentItems ?? 0,
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
    const conflict = await prisma.repeatDiscount.findFirst({
      where: { recordDate: newDate, id: { not: id } },
    });
    if (conflict) throw new Error(`${data.recordDate} 已有记录`);
    updateData.recordDate = newDate;
  }

  if (data.g1) {
    if (data.g1.grantAmount !== undefined) updateData.g1GrantAmount = data.g1.grantAmount;
    if (data.g1.paymentAmount !== undefined) updateData.g1PaymentAmount = data.g1.paymentAmount;
    if (data.g1.paymentBuyers !== undefined) updateData.g1PaymentBuyers = data.g1.paymentBuyers;
    if (data.g1.paymentItems !== undefined) updateData.g1PaymentItems = data.g1.paymentItems;
  }

  if (data.g2) {
    if (data.g2.grantAmount !== undefined) updateData.g2GrantAmount = data.g2.grantAmount;
    if (data.g2.paymentAmount !== undefined) updateData.g2PaymentAmount = data.g2.paymentAmount;
    if (data.g2.paymentBuyers !== undefined) updateData.g2PaymentBuyers = data.g2.paymentBuyers;
    if (data.g2.paymentItems !== undefined) updateData.g2PaymentItems = data.g2.paymentItems;
  }

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
      g1GrantAmount: true,
      g1PaymentAmount: true,
      g1PaymentBuyers: true,
      g1PaymentItems: true,
      g2GrantAmount: true,
      g2PaymentAmount: true,
      g2PaymentBuyers: true,
      g2PaymentItems: true,
    },
    _count: true,
  });

  const s = result._sum;
  const totalGrant = (s.g1GrantAmount ?? 0) + (s.g2GrantAmount ?? 0);
  const totalPayment = (s.g1PaymentAmount ?? 0) + (s.g2PaymentAmount ?? 0);
  const totalBuyers = (s.g1PaymentBuyers ?? 0) + (s.g2PaymentBuyers ?? 0);
  const totalItems = (s.g1PaymentItems ?? 0) + (s.g2PaymentItems ?? 0);

  return {
    totalDays: result._count,
    // 合计
    totalGrantAmount: totalGrant,
    totalPaymentAmount: totalPayment,
    totalPaymentBuyers: totalBuyers,
    totalPaymentItems: totalItems,
    totalROI: calcROI(totalPayment, totalGrant),
    // G1
    g1GrantAmount: s.g1GrantAmount ?? 0,
    g1PaymentAmount: s.g1PaymentAmount ?? 0,
    g1PaymentBuyers: s.g1PaymentBuyers ?? 0,
    g1PaymentItems: s.g1PaymentItems ?? 0,
    g1ROI: calcROI(s.g1PaymentAmount ?? 0, s.g1GrantAmount ?? 0),
    // G2
    g2GrantAmount: s.g2GrantAmount ?? 0,
    g2PaymentAmount: s.g2PaymentAmount ?? 0,
    g2PaymentBuyers: s.g2PaymentBuyers ?? 0,
    g2PaymentItems: s.g2PaymentItems ?? 0,
    g2ROI: calcROI(s.g2PaymentAmount ?? 0, s.g2GrantAmount ?? 0),
  };
}
