import prisma from '../utils/db';
import { parseExcelDate } from '../utils/parseExcelDate';

// ──────────────────────────────────────
// 布尔值解析（支持 Excel 各种格式）
// ──────────────────────────────────────
export function parseBoolValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === '是' || v === '已返款' || v === '已好评' || v === '有';
  }
  return false;
}

// ──────────────────────────────────────
// 好评状态解析（支持多种输入格式）
// ──────────────────────────────────────
export function parseReviewStatus(value: unknown): string {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'reviewed' || v === '已好评' || v === 'true' || v === '1' || v === '是') return 'reviewed';
    if (v === 'creating' || v === '作图中') return 'creating';
    if (v === 'returned' || v === '已返图') return 'returned';
    return 'pending';
  }
  if (typeof value === 'boolean') return value ? 'reviewed' : 'pending';
  if (typeof value === 'number') return value !== 0 ? 'reviewed' : 'pending';
  return 'pending';
}

// ──────────────────────────────────────
// 类型定义
// ──────────────────────────────────────
export interface OrderListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isRefunded?: string;
  isGoodReview?: string;
  startDate?: string;
  endDate?: string;
}

export interface BatchImportResult {
  success: number;
  failed: number;
  skipped: number;
  details: Array<{ orderNo?: string | null; orderNo19?: string | null; status: string; reason?: string; taker?: string; task?: string }>;
  errors: string[];
}

// ──────────────────────────────────────
// 查询：订单列表
// ──────────────────────────────────────
export async function getOrderList(params: OrderListParams) {
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const { search, isRefunded, isGoodReview, startDate, endDate } = params;

  // 用 any 构建动态条件，最后传给 Prisma
  const where: any = {};

  if (isRefunded !== undefined && isRefunded !== '') where.isRefunded = isRefunded === 'true';
  if (isGoodReview !== undefined && isGoodReview !== '') where.isGoodReview = isGoodReview;

  if (search) {
    where.OR = [
      { orderNo: { contains: search } },
      { orderNo19: { contains: search } },
      { productId: { contains: search } },
      { productCode: { contains: search } },
      { remark: { contains: search } },
      { taker: { OR: [{ wechatName: { contains: search } }, { wechatId: { contains: search } }] } },
    ];
  }

  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) where.orderDate.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { orderDate: 'desc' },
      include: {
        task: { select: { id: true, productId: true, productCode: true } },
        taker: { select: { id: true, wechatName: true, wechatId: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { list: orders, total, page, pageSize };
}

// ──────────────────────────────────────
// 查询：订单详情
// ──────────────────────────────────────
export async function getOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      task: true,
      taker: true,
      logs: { orderBy: { createdAt: 'desc' } },
    },
  });
}

// ──────────────────────────────────────
// 更新：单个订单
// ──────────────────────────────────────
export interface UpdateOrderInput {
  orderNo?: string;
  orderNo19?: string;
  orderLink?: string;
  actualPayment?: number;
  isRefunded?: boolean;
  refundDate?: string;
  isGoodReview?: boolean;
  baseCommission?: number;
  reviewCommission?: number;
  reviewCommissionDate?: string;
  remark?: string;
}

export async function updateOrder(id: string, input: UpdateOrderInput) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error('ORDER_NOT_FOUND');

  // 唯一性校验
  if (input.orderNo && input.orderNo !== existing.orderNo) {
    const dup = await prisma.order.findFirst({ where: { orderNo: input.orderNo } });
    if (dup) throw new Error('ORDER_NO_DUPLICATE');
  }
  if (input.orderNo19 && input.orderNo19 !== existing.orderNo19) {
    const dup = await prisma.order.findFirst({ where: { orderNo19: input.orderNo19 } });
    if (dup) throw new Error('ORDER_NO19_DUPLICATE');
  }

  const newActual = input.actualPayment !== undefined ? Number(input.actualPayment) : existing.actualPayment;
  const newBase = input.baseCommission !== undefined ? Number(input.baseCommission) : existing.baseCommission;
  const order = await prisma.order.update({
    where: { id },
    data: {
      orderNo: input.orderNo,
      orderNo19: input.orderNo19,
      orderLink: input.orderLink,
      actualPayment: input.actualPayment !== undefined ? Number(input.actualPayment) : undefined,
      totalRefund: newActual + newBase + newReview,
      isRefunded: input.isRefunded !== undefined ? Boolean(input.isRefunded) : undefined,
      refundDate: input.refundDate !== undefined ? parseExcelDate(input.refundDate) : undefined,
      isGoodReview: input.isGoodReview !== undefined ? String(input.isGoodReview) : undefined,
      baseCommission: input.baseCommission !== undefined ? Number(input.baseCommission) : undefined,
      reviewCommission: input.reviewCommission !== undefined ? Number(input.reviewCommission) : undefined,
      reviewCommissionDate: input.reviewCommissionDate !== undefined ? parseExcelDate(input.reviewCommissionDate) : undefined,
      remark: input.remark,
    },
    include: { task: true, taker: true },
  });

  // 自动更新任务状态
  if (existing.taskId) {
    await autoUpdateTaskStatus(existing.taskId);
  }

  return order;
}

// ──────────────────────────────────────
// 批量导入（事务内逐条处理，保证数据一致性）
// ──────────────────────────────────────
export async function batchCreateOrders(rawOrders: any[]): Promise<BatchImportResult> {
  if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
    throw new Error('EMPTY_ORDER_LIST');
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const details: BatchImportResult['details'] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of rawOrders) {
      try {
        const orderNoStr = item.orderNo ? String(item.orderNo).trim() : null;
        const orderNo19Str = item.orderNo19 ? String(item.orderNo19).trim() : null;
        const remarkStr = item.remark ? String(item.remark).trim() : null;

        // 查找接单人
        const wechatNameStr = item.wechatName ? String(item.wechatName).trim() : null;
        const wechatIdStr = item.wechatId ? String(item.wechatId).trim() : null;
        let taker: { id: string; wechatName: string } | null = null;
        if (wechatNameStr || wechatIdStr) {
          taker = await tx.orderTaker.findFirst({
            where: {
              OR: [
                ...(wechatIdStr ? [{ wechatId: wechatIdStr }] : []),
                ...(wechatNameStr ? [{ wechatName: wechatNameStr }] : []),
              ],
            },
          });
        }

        // 查找任务
        const productIdStr = item.productId ? String(item.productId).trim() : null;
        const productCodeStr = item.productCode ? String(item.productCode).trim() : null;
        let task: { id: string; productId: string; productCode: string; baseCommission: number } | null = null;
        if (productIdStr || productCodeStr) {
          task = await tx.task.findFirst({
            where: {
              OR: [
                ...(productIdStr ? [{ productId: productIdStr }] : []),
                ...(productCodeStr ? [{ productCode: productCodeStr }] : []),
              ],
              status: 'active',
            },
            orderBy: { createdAt: 'desc' },
          });
        }

        // 重复检查
        if (orderNoStr) {
          const existing = await tx.order.findFirst({ where: { orderNo: orderNoStr } });
          if (existing) { skipped++; details.push({ orderNo: orderNoStr, status: 'skipped', reason: '订单编号已存在' }); continue; }
        }
        if (orderNo19Str) {
          const existing = await tx.order.findFirst({ where: { orderNo19: orderNo19Str } });
          if (existing) { skipped++; details.push({ orderNo: orderNoStr, orderNo19: orderNo19Str, status: 'skipped', reason: '19订单号已存在' }); continue; }
        }

        const actualPayment = Number(item.actualPayment) || 0;
        const baseCommission = Number(item.baseCommission) || (task ? task.baseCommission : 5);
        const reviewCommission = Number(item.reviewCommission) || 0;
        const orderDate = parseExcelDate(item.orderDate) || new Date();
        const orderLink = orderNoStr
          ? `https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=${orderNoStr}`
          : '';

        await tx.order.create({
          data: {
            orderDate,
            orderNo: orderNoStr,
            orderNo19: orderNo19Str,
            orderLink: item.orderLink || orderLink,
            taskId: task?.id || null,
            takerId: taker?.id || null,
            productId: productIdStr || (task ? task.productId : ''),
            productCode: productCodeStr || (task ? task.productCode : ''),
            actualPayment,
            baseCommission,
            reviewCommission,
            totalRefund: actualPayment + baseCommission + reviewCommission,
            isRefunded: parseBoolValue(item.isRefunded),
            refundDate: parseExcelDate(item.refundDate),
            isGoodReview: parseReviewStatus(item.isGoodReview),
            reviewCommissionDate: parseExcelDate(item.reviewCommissionDate),
            remark: remarkStr,
          },
        });

        if (task) {
          await tx.task.update({ where: { id: task.id }, data: { currentOrders: { increment: 1 } } });
        }
        if (taker) {
          await tx.orderTaker.update({
            where: { id: taker.id },
            data: { totalOrders: { increment: 1 }, totalAmount: { increment: actualPayment } },
          });
        }

        success++;
        details.push({ orderNo: orderNoStr, status: 'success', taker: taker?.wechatName || '未匹配', task: task?.productId || '未匹配' });
      } catch (e) {
        failed++;
        errors.push(`${item.orderNo || item.orderNo19 || '未知'}: ${(e as Error).message}`);
      }
    }
  });

  return { success, failed, skipped, details, errors };
}

// ──────────────────────────────────────
// 批量修改（事务内逐条）
// ──────────────────────────────────────
export async function batchUpdateOrders(rawOrders: any[]) {
  let success = 0;
  let failed = 0;
  let notFound = 0;
  const errors: string[] = [];
  const details: any[] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of rawOrders) {
      try {
        const orderNoStr = item.orderNo ? String(item.orderNo).trim() : null;
        const orderNo19Str = item.orderNo19 ? String(item.orderNo19).trim() : null;

        if (!orderNoStr && !orderNo19Str) {
          failed++;
          errors.push('某条记录缺少订单编号或19订单号，已跳过');
          continue;
        }

        const existingOrder = await tx.order.findFirst({
          where: {
            OR: [
              ...(orderNoStr ? [{ orderNo: orderNoStr }] : []),
              ...(orderNo19Str ? [{ orderNo19: orderNo19Str }] : []),
            ],
          },
        });

        if (!existingOrder) {
          notFound++;
          details.push({ orderNo: orderNoStr || orderNo19Str, status: 'not_found', reason: '订单不存在' });
          continue;
        }

        const updateData: any = {};

        if (item.wechatName || item.wechatId) {
          const wechatNameStr = item.wechatName ? String(item.wechatName).trim() : null;
          const wechatIdStr = item.wechatId ? String(item.wechatId).trim() : null;
          const taker = await tx.orderTaker.findFirst({
            where: {
              OR: [
                ...(wechatIdStr ? [{ wechatId: wechatIdStr }] : []),
                ...(wechatNameStr ? [{ wechatName: wechatNameStr }] : []),
              ],
            },
          });
          if (taker) updateData.takerId = taker.id;
        }

        if (item.actualPayment !== '' && item.actualPayment != null) updateData.actualPayment = Number(item.actualPayment) || 0;
        if (item.baseCommission !== '' && item.baseCommission != null) updateData.baseCommission = Number(item.baseCommission) || 0;
        if (item.reviewCommission !== '' && item.reviewCommission != null) updateData.reviewCommission = Number(item.reviewCommission) || 0;
        if (item.remark !== '' && item.remark !== undefined) updateData.remark = String(item.remark).trim() || null;
        if (item.isRefunded !== '' && item.isRefunded != null) updateData.isRefunded = parseBoolValue(item.isRefunded);
        if (item.refundDate !== '' && item.refundDate != null) updateData.refundDate = parseExcelDate(item.refundDate);
        if (item.isGoodReview !== '' && item.isGoodReview != null) updateData.isGoodReview = parseReviewStatus(item.isGoodReview);
        if (item.reviewCommissionDate !== '' && item.reviewCommissionDate != null) updateData.reviewCommissionDate = parseExcelDate(item.reviewCommissionDate);
        if (item.orderNo19 && !existingOrder.orderNo19) updateData.orderNo19 = orderNo19Str;

        const newActual = updateData.actualPayment ?? existingOrder.actualPayment;
        const newBase = updateData.baseCommission ?? existingOrder.baseCommission;
        const newReview = updateData.reviewCommission ?? existingOrder.reviewCommission;
        updateData.totalRefund = newActual + newBase + newReview;

        if (Object.keys(updateData).length <= 1) {
          notFound++;
          details.push({ orderNo: orderNoStr || orderNo19Str, status: 'skipped', reason: '无需更新的字段' });
          continue;
        }

        await tx.order.update({ where: { id: existingOrder.id }, data: updateData });

        const changes: string[] = [];
        if (updateData.isRefunded !== undefined && updateData.isRefunded !== existingOrder.isRefunded)
          changes.push(`返款状态: ${existingOrder.isRefunded ? '已返款' : '未返款'} → ${updateData.isRefunded ? '已返款' : '未返款'}`);
        if (updateData.isGoodReview !== undefined && updateData.isGoodReview !== existingOrder.isGoodReview)
          changes.push(`好评状态: ${existingOrder.isGoodReview ? '已好评' : '未好评'} → ${updateData.isGoodReview ? '已好评' : '未好评'}`);
        if (updateData.actualPayment !== undefined) changes.push(`实付款: ${existingOrder.actualPayment} → ${updateData.actualPayment}`);
        if (updateData.baseCommission !== undefined) changes.push(`基础返佣: ${existingOrder.baseCommission} → ${updateData.baseCommission}`);
        if (updateData.reviewCommission !== undefined) changes.push(`好评返佣: ${existingOrder.reviewCommission} → ${updateData.reviewCommission}`);
        if (updateData.remark !== undefined) changes.push(`备注: ${existingOrder.remark || '空'} → ${updateData.remark || '空'}`);

        success++;
        details.push({ orderNo: orderNoStr || orderNo19Str, status: 'success', changes: changes.join(', ') });
      } catch (e) {
        failed++;
        errors.push(`${item.orderNo || item.orderNo19 || '未知'}: ${(e as Error).message}`);
      }
    }
  });

  return { success, failed, notFound, details, errors };
}

// ──────────────────────────────────────
// 批量更新状态（事务内）
// ──────────────────────────────────────
export async function batchUpdateOrderStatus(ids: string[], field: 'isRefunded' | 'isGoodReview', value: boolean | string) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { id: true, actualPayment: true, baseCommission: true, reviewCommission: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      const updateData: any = { [field]: value };
      if (field === 'isRefunded' && value) updateData.refundDate = new Date();
      if (field === 'isGoodReview' && value === 'reviewed') updateData.reviewCommissionDate = new Date();
      updateData.totalRefund = order.actualPayment + order.baseCommission + order.reviewCommission;

      await tx.order.update({ where: { id: order.id }, data: updateData });
    }
  });

  return orders.length;
}

// ──────────────────────────────────────
// 删除订单（事务内级联）
// ──────────────────────────────────────
export async function deleteOrder(id: string) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error('ORDER_NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    await tx.log.deleteMany({ where: { orderId: id } });
    await tx.order.delete({ where: { id } });
    if (existing.taskId) {
      await tx.task.update({ where: { id: existing.taskId }, data: { currentOrders: { decrement: 1 } } });
    }
    if (existing.takerId) {
      await tx.orderTaker.update({
        where: { id: existing.takerId },
        data: { totalOrders: { decrement: 1 }, totalAmount: { decrement: existing.actualPayment } },
      });
    }
  });
}

// 自动更新任务状态
async function autoUpdateTaskStatus(taskId: string) {
  if (!taskId) return;
  
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      orders: {
        select: {
          isRefunded: true,
          isGoodReview: true,
        },
      },
    },
  });
  
  if (!task) return;
  
  // 统计订单状态
  const totalOrders = task.orders.length;
  const refundedOrders = task.orders.filter(o => o.isRefunded).length;
  const reviewedOrders = task.orders.filter(o => o.isGoodReview === 'reviewed').length;
  
  // 更新已接人数
  await prisma.task.update({
    where: { id: taskId },
    data: { currentOrders: totalOrders },
  });
  
  // 自动更新任务状态逻辑：
  // 1. 如果所有订单都已返款且已好评，任务完成
  // 2. 如果已接人数达到上限，任务完成
  // 3. 否则保持活跃状态
  const allOrdersCompleted = totalOrders > 0 && refundedOrders === totalOrders && reviewedOrders === totalOrders;
  const reachedMaxOrders = totalOrders >= task.maxOrders;
  
  if (allOrdersCompleted || reachedMaxOrders) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' },
    });
  }
}

