import prisma from '../utils/db';
import { parseExcelDate } from '../utils/parseExcelDate';
import { getReviewCommissionAmount } from './systemSettingService';

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

/**
 * 判断本次写入是否把订单标记为「已好评」。
 *
 * 说明：UpdateOrderInput.isGoodReview 的声明类型是 boolean，但前端下拉/批量接口
 * 实际传的是状态字符串（'reviewed' / 'creating' / 'returned' / 'pending'）。
 * 这里统一走 parseReviewStatus 归一化，既兼容字符串 'reviewed'，也兼容 true/1/'是' 等历史写法。
 */
function isMarkedReviewed(value: unknown): boolean {
  return parseReviewStatus(value) === 'reviewed';
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
  sortField?: string;
  sortDirection?: string;
  /** JSON-encoded per-column filters from the orders table. */
  columnFilters?: string | Record<string, string>;
}

/** 允许按接单人关联表字段排序的字段白名单 */
type TakerSortField = 'wechatName' | 'wechatId' | 'taobaoNickname';

/**
 * 排序字段白名单。
 * - 值类型为本表字段名（string），直接按该字段排序；
 * - 值类型为 { taker: TakerSortField } 时，按接单人关联表字段排序，
 *   产出 { taker: { 字段: 方向 } }。
 *
 * 这里刻意**展平**存字段名而不存对象：早期版本存的是 { taker: { 字段: 字段 } }，
 * 构造时不得不靠 Object.keys(...) 反推键名，而 Object.keys 取到的是外层键 'taker'，
 * 产出非法的 { taker: { taker: 方向 } }（Prisma 报 Unknown field）。
 * 直接存字段名后 Object.keys 彻底消失，该 bug 无法再现；同时 TakerSortField
 * 是字面量联合，字段名打错会直接编译失败。
 */
const ORDER_SORT_FIELDS: Record<string, string | { taker: TakerSortField }> = {
  productId: 'productId',
  productCode: 'productCode',
  orderNo: 'orderNo',
  orderNo19: 'orderNo19',
  orderDate: 'orderDate',
  isRefunded: 'isRefunded',
  isGoodReview: 'isGoodReview',
  refundDate: 'refundDate',
  reviewCommissionDate: 'reviewCommissionDate',
  drawingDate: 'drawingDate',
  actualPayment: 'actualPayment',
  baseCommission: 'baseCommission',
  isBaseCommissionRefunded: 'isBaseCommissionRefunded',
  reviewCommission: 'reviewCommission',
  remark: 'remark',
  wechatName: { taker: 'wechatName' },
  wechatId: { taker: 'wechatId' },
  taobaoNickname: { taker: 'taobaoNickname' },
};

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
  // 必须用 hasOwnProperty 而非真值判断：ORDER_SORT_FIELDS['__proto__'] 会沿原型链
  // 返回 Object.prototype（truthy），真值判断会被穿透，导致非法字段不回落 orderDate。
  const sortField = params.sortField && Object.prototype.hasOwnProperty.call(ORDER_SORT_FIELDS, params.sortField)
    ? params.sortField : 'orderDate';
  const sortDirection = params.sortDirection === 'asc' ? 'asc' : 'desc';
  // 本表字段直接用字段名；关联表字段走 { taker: { 字段: 方向 } }
  const sortSpec = ORDER_SORT_FIELDS[sortField];
  const orderBy: Record<string, any> = typeof sortSpec === 'string'
    ? { [sortSpec]: sortDirection }
    : { taker: { [sortSpec.taker]: sortDirection } };

  // Build a Prisma-safe where clause from a strict field whitelist.
  const where: Record<string, any> = {};
  if (isRefunded !== undefined && isRefunded !== '') where.isRefunded = isRefunded === 'true';
  if (isGoodReview !== undefined && isGoodReview !== '') where.isGoodReview = isGoodReview;

  const filterInput: Record<string, string> = typeof params.columnFilters === 'string'
    ? (() => { try { return JSON.parse(params.columnFilters as string) as Record<string, string>; } catch { return {}; } })()
    : (params.columnFilters || {});
  const columnMap: Record<string, string | { taker: Record<string, { contains: string }> }> = {
    orderDate: 'orderDate', refundDate: 'refundDate', productId: 'productId', productCode: 'productCode',
    orderNo19: 'orderNo19', orderNo: 'orderNo', actualPayment: 'actualPayment', baseCommission: 'baseCommission',
    isBaseCommissionRefunded: 'isBaseCommissionRefunded',
    reviewCommission: 'reviewCommission', drawingDate: 'drawingDate', reviewCommissionDate: 'reviewCommissionDate',
    remark: 'remark', isRefunded: 'isRefunded', isGoodReview: 'isGoodReview',
    wechatName: { taker: { wechatName: { contains: '' } } },
    wechatId: { taker: { wechatId: { contains: '' } } },
    taobaoNickname: { taker: { taobaoNickname: { contains: '' } } },
  };
  for (const [key, rawValue] of Object.entries(filterInput)) {
    const value = String(rawValue || '').trim();
    const mapped = columnMap[key];
    if (!value || !mapped) continue;
    if (key === 'isRefunded') { where.isRefunded = value === 'true'; continue; }
    if (key === 'isBaseCommissionRefunded') { where.isBaseCommissionRefunded = value === 'true'; continue; }
    if (key === 'isGoodReview') { where.isGoodReview = value; continue; }
    if (typeof mapped === 'string') {
      const dateFields = new Set(['orderDate', 'refundDate', 'drawingDate', 'reviewCommissionDate']);
      if (dateFields.has(key)) {
        let rangeStart: Date | null = null;
        let rangeEnd: Date | null = null;
        if (value.startsWith('range:')) {
          const parts = value.slice(6).split(',');
          if (parts[0]) { const d = new Date(parts[0]); if (!Number.isNaN(d.getTime())) rangeStart = d; }
          if (parts[1]) { const d = new Date(parts[1]); if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); rangeEnd = d; } }
        } else {
          const d = new Date(value);
          if (!Number.isNaN(d.getTime())) { rangeStart = d; rangeEnd = new Date(d); rangeEnd.setHours(23, 59, 59, 999); }
        }
        if (rangeStart || rangeEnd) {
          const existingRange = where[mapped] || {};
          where[mapped] = {
            ...existingRange,
            ...(rangeStart ? { gte: existingRange.gte && existingRange.gte > rangeStart ? existingRange.gte : rangeStart } : {}),
            ...(rangeEnd ? { lte: existingRange.lte && existingRange.lte < rangeEnd ? existingRange.lte : rangeEnd } : {}),
          };
        }
      } else where[mapped] = { contains: value };
    } else where.taker = { ...(where.taker || {}), [key]: { contains: value } };
  }

  const searchTokens = search?.split(/[\s,，、；;]+/).map(token => token.trim()).filter(Boolean) || [];
  if (searchTokens.length) {
    where.AND = searchTokens.map(token => ({ OR: [
      { orderNo: { contains: token } }, { orderNo19: { contains: token } },
      { productId: { contains: token } }, { productCode: { contains: token } }, { remark: { contains: token } },
      { taker: { OR: [{ wechatName: { contains: token } }, { wechatId: { contains: token } }, { taobaoNickname: { contains: token } }] } },
    ] }));
  }

  if (startDate || endDate) {
    const existingRange = where.orderDate || {};
    const range: Record<string, Date> = { ...existingRange };
    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        range.gte = range.gte && range.gte > start ? range.gte : start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        range.lte = range.lte && range.lte < end ? range.lte : end;
      }
    }
    where.orderDate = range;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        task: { select: { id: true, productId: true, productCode: true } },
        // wechatId 保留：导入/匹配接单人依赖它，且订单导出列仍在用
        taker: { select: { id: true, wechatName: true, wechatId: true, taobaoNickname: true } },
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
  drawingDate?: string;
  baseCommission?: number;
  isBaseCommissionRefunded?: boolean;
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

  // 好评返佣金额的最终取值（本模块的单一判定点）：
  //   1) 请求显式传了 reviewCommission（用户在单元格里手工改了金额）→ 尊重该值，不覆盖；
  //   2) 否则若本次把订单标记为「已好评」→ 一律覆盖为系统设置里的好评返佣默认金额（默认 3 元），
  //      即便该订单之前被手工改过，也覆盖（用户已确认口径）；
  //   3) 其它情况 → 保持原值不变。
  const explicitReview = input.reviewCommission !== undefined;
  const reviewed = isMarkedReviewed(input.isGoodReview);
  let newReview: number;
  let writeReview: boolean;
  if (explicitReview) {
    newReview = Number(input.reviewCommission);
    writeReview = true;
  } else if (reviewed) {
    newReview = await getReviewCommissionAmount();
    writeReview = true;
  } else {
    newReview = existing.reviewCommission;
    writeReview = false;
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      orderNo: input.orderNo,
      orderNo19: input.orderNo19,
      orderLink: input.orderLink,
      actualPayment: input.actualPayment !== undefined ? Number(input.actualPayment) : undefined,
      totalRefund: newActual + newBase + newReview,
      isRefunded: input.isRefunded !== undefined ? parseBoolValue(input.isRefunded) : undefined,
      refundDate: input.refundDate !== undefined ? parseExcelDate(input.refundDate) : undefined,
      isGoodReview: input.isGoodReview !== undefined ? String(input.isGoodReview) : undefined,
      drawingDate: input.drawingDate !== undefined ? parseExcelDate(input.drawingDate) : undefined,
      baseCommission: input.baseCommission !== undefined ? Number(input.baseCommission) : undefined,
      isBaseCommissionRefunded: input.isBaseCommissionRefunded !== undefined ? parseBoolValue(input.isBaseCommissionRefunded) : undefined,
      reviewCommission: writeReview ? newReview : undefined,
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
              status: { in: ['active', 'pending'] },
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
            isBaseCommissionRefunded: parseBoolValue(item.isBaseCommissionRefunded),
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
        if (item.isBaseCommissionRefunded !== '' && item.isBaseCommissionRefunded != null) updateData.isBaseCommissionRefunded = parseBoolValue(item.isBaseCommissionRefunded);
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
        if (updateData.isBaseCommissionRefunded !== undefined && updateData.isBaseCommissionRefunded !== existingOrder.isBaseCommissionRefunded)
          changes.push(`基础返佣返款状态: ${existingOrder.isBaseCommissionRefunded ? '已返款' : '未返款'} → ${updateData.isBaseCommissionRefunded ? '已返款' : '未返款'}`);
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
export async function batchUpdateOrderStatus(ids: string[], field: 'isRefunded' | 'isGoodReview' | 'isBaseCommissionRefunded', value: boolean | string) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { id: true, actualPayment: true, baseCommission: true, reviewCommission: true, refundDate: true },
  });

  // 是否本次批量标记为「已好评」：与单条路径同一口径（parseReviewStatus 归一化）。
  const markReviewed = field === 'isGoodReview' && isMarkedReviewed(value);
  // 好评返佣默认金额只查一次（循环外 hoist），不要在 for 里重复查库。
  const reviewAmount = markReviewed ? await getReviewCommissionAmount() : null;

  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      const updateData: any = { [field]: value };
      // 基础返佣返款状态：必须落成真正的布尔值，避免前端传字符串 'true' 写坏。
      // 该字段**不记录日期**（与订单级 isRefunded 不同），因此这里绝不写任何时间戳。
      if (field === 'isBaseCommissionRefunded') updateData.isBaseCommissionRefunded = parseBoolValue(value);
      if (field === 'isRefunded') {
        // 返款日期口径（修复静默覆盖）：
        //   - 标记为「已返款」时，仅在订单原本没有 refundDate 的情况下回填当前时间，
        //     绝不覆盖已有的真实返款日期（历史数据/手工录入的对账日期必须保留）；
        //   - 标记为「未返款」时同步清空 refundDate，避免状态与日期自相矛盾。
        if (value) {
          updateData.refundDate = order.refundDate ?? new Date();
        } else {
          updateData.refundDate = null;
        }
      }

      // 好评返佣金额的最终取值：标记「已好评」时一律覆盖为配置值，否则保持原值。
      let review = order.reviewCommission;
      if (markReviewed) {
        updateData.reviewCommissionDate = new Date();
        review = reviewAmount as number;
        updateData.reviewCommission = review;
      }

      // totalRefund 必须用最终的 reviewCommission 重算（而不是旧的 order.reviewCommission）。
      updateData.totalRefund = order.actualPayment + order.baseCommission + review;

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
  
  // 自动更新任务状态逻辑（按优先级）：
  // 1. 任何订单已好评 → 已完成
  // 2. 任何订单已返款（但未好评）→ 已返款
  // 3. 有订单 → 进行中
  // 4. 无订单 → 待接单
  const hasReviewedOrder = task.orders.some(o => o.isGoodReview === 'reviewed');
  const hasRefundedOrder = task.orders.some(o => o.isRefunded);
  
  if (hasReviewedOrder) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' },
    });
  } else if (hasRefundedOrder) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'refunded' },
    });
  } else if (totalOrders > 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'active' },
    });
  } else {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'pending' },
    });
  }
}
