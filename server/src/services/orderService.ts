import crypto from 'crypto';
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
  /** row = 入参行数组下标 + 2（Excel 表头占第 1 行，数据从第 2 行起） */
  details: Array<{ row: number; orderNo?: string | null; orderNo19?: string | null; status: string; reason?: string; taker?: string; task?: string }>;
  /** row = 入参行数组下标 + 2；message 为失败原因，便于前端定位到 Excel 具体行 */
  errors: Array<{ row: number; orderNo?: string | null; message: string }>;
}

/** 只读预校验：单行结果 */
export type BatchValidateStatus = 'ok' | 'dup' | 'invalid';
export interface BatchValidateRow {
  /** row = 入参行数组下标 + 2（Excel 行号，表头占第 1 行） */
  row: number;
  status: BatchValidateStatus;
  reason?: string;
}
/** 只读预校验：整体结果 */
export interface BatchValidateResult {
  rows: BatchValidateRow[];
  summary: { total: number; ok: number; dup: number; invalid: number };
}

// ──────────────────────────────────────
// 批量操作快照（P2-3 批量撤销）
//
// 铁律：快照与业务写入**同一事务**提交，且快照 create 排在所有订单写之前——
// 快照创建失败 → 整个事务回滚 → 绝不出现「改了库但没快照」的窗口。
// ──────────────────────────────────────
export type BatchAction = 'batch_create' | 'batch_update' | 'batch_update_status';

/** OperationSnapshot.payload 反序列化后的统一形状 */
export interface BatchSnapshotPayload {
  action: BatchAction;
  orderCount: number;
  /** batch_create：预生成的新建订单 id 列表（撤销 = 删除这些行并回退任务/接单人计数） */
  createdIds?: string[];
  /** batch_update / batch_update_status：逐单「改动前字段值」（撤销 = 精确写回这些字段） */
  restores?: Array<{ id: string; before: Record<string, unknown> }>;
}

/** 撤销执行结果 */
export interface UndoLastResult {
  action: BatchAction;
  restored: number;
  failed: number;
  errors: string[];
}

/** 撤销预览（GET，纯只读）：供前端二次确认弹窗展示「将还原 N 条」 */
export interface UndoPreview {
  available: boolean;
  action?: BatchAction;
  itemCount: number;
  createdAt?: string;
}

/** 从旧订单行中抽取将被批量写覆盖的字段旧值（只存被写字段，撤销时精确写回，绝不多改一个字段） */
function pickBeforeFields(existing: Record<string, unknown>, updateData: Record<string, unknown>): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(updateData)) {
    before[key] = existing[key] ?? null;
  }
  return before;
}

/**
 * 读取「最近一次批量操作」的撤销预览（纯只读，绝不写库）。
 * 最近一条快照若已被消费（或 payload 损坏）→ available:false。
 * 注意：只支持撤销最近一次 —— 即使更早的快照尚未消费，也不允许跨级撤销。
 */
export async function getUndoPreview(): Promise<UndoPreview> {
  const latest = await prisma.operationSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!latest || latest.consumed) return { available: false, itemCount: 0 };
  try {
    const payload = JSON.parse(latest.payload) as BatchSnapshotPayload;
    return {
      available: true,
      action: payload.action,
      itemCount: latest.itemCount,
      createdAt: latest.createdAt instanceof Date ? latest.createdAt.toISOString() : String(latest.createdAt),
    };
  } catch {
    // payload 损坏：视为不可撤销（撤销比数据更重要的原则下，宁可不给撤也不能乱还原）
    return { available: false, itemCount: 0 };
  }
}

/**
 * 撤销最近一次批量操作（只支持最近一次，不做多级 undo）。
 *
 * 幂等防护：在同一事务内用 `updateMany({ where: { id, consumed: false } })` 原子抢占快照，
 * 并发第二个撤销请求会命中 0 行 → 抛错回滚 → 同一快照绝不可能被撤销两次。
 *
 * 逆操作语义：
 *   batch_create          → 删除这批新建的订单行，并回退任务/接单人计数（镜像 deleteOrder）；
 *   batch_update          → 逐单写回被改字段的「改动前值」；
 *   batch_update_status   → 逐单写回状态字段的「改动前值」（含派生的 refundDate/reviewCommission 等）。
 */
export async function undoLastBatch(): Promise<UndoLastResult> {
  const latest = await prisma.operationSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!latest || latest.consumed) throw new Error('NO_UNDOABLE_OPERATION');
  let payload: BatchSnapshotPayload;
  try {
    payload = JSON.parse(latest.payload) as BatchSnapshotPayload;
  } catch {
    throw new Error('CORRUPTED_SNAPSHOT');
  }

  // 注意：tx 显式标注 any——本机 prisma generate 必失败、client 类型退化为 any，
  // 不标注会新增 TS7006（本批铁律：不新增 tsc 报错；既有同款报错不在本批修复范围）。
  return prisma.$transaction(async (tx: any) => {
    // 原子抢占：consumed:false 条件保证并发下只有一个撤销能成功
    const claimed = await tx.operationSnapshot.updateMany({
      where: { id: latest.id, consumed: false },
      data: { consumed: true, undoneAt: new Date() },
    });
    if (claimed.count === 0) throw new Error('SNAPSHOT_ALREADY_CONSUMED');

    const result: UndoLastResult = { action: payload.action, restored: 0, failed: 0, errors: [] };

    if (payload.action === 'batch_create') {
      const ids = payload.createdIds || [];
      if (ids.length === 0) return result;
      const createdOrders = await tx.order.findMany({ where: { id: { in: ids } } });
      for (const order of createdOrders) {
        try {
          await tx.log.deleteMany({ where: { orderId: order.id } });
          await tx.order.delete({ where: { id: order.id } });
          // 计数回退用 updateMany：目标行已被删除时不抛错（镜像 deleteOrder 的回退语义，且不阻断其余行）
          if (order.taskId) {
            await tx.task.updateMany({ where: { id: order.taskId }, data: { currentOrders: { decrement: 1 } } });
          }
          if (order.takerId) {
            await tx.orderTaker.updateMany({
              where: { id: order.takerId },
              data: { totalOrders: { decrement: 1 }, totalAmount: { decrement: order.actualPayment } },
            });
          }
          result.restored++;
        } catch (e) {
          result.failed++;
          result.errors.push(`${order.orderNo || order.id}: ${(e as Error).message}`);
        }
      }
      return result;
    }

    // batch_update / batch_update_status：逐单精确写回「改动前值」
    const restores = payload.restores || [];
    for (const item of restores) {
      try {
        await tx.order.update({ where: { id: item.id }, data: item.before });
        result.restored++;
      } catch (e) {
        // 订单在批量之后被单独删除等场景：该行计 failed，不影响其余行
        result.failed++;
        result.errors.push(`${item.id}: ${(e as Error).message}`);
      }
    }
    return result;
  });
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
  const errors: BatchImportResult['errors'] = [];
  const details: BatchImportResult['details'] = [];

  // P2-3：预生成新建行的 id（Node 内置 randomUUID，无新依赖）——
  // 使快照能在**写库之前**就携带完整的「createdIds」落库，撤销时按 id 精确删除。
  const createdIds: string[] = rawOrders.map(() => crypto.randomUUID());

  await prisma.$transaction(async (tx) => {
    // P2-3 铁律：快照先落库（同一事务、先于所有订单写入）。
    // 快照创建失败 → 事务整体回滚 → 绝不出现「改了库但没快照」的窗口。
    // 说明：itemCount 为导入总行数（含后续因重复被跳过的行）；撤销按 createdIds 删除，
    // 被跳过的行 id 不会命中任何数据，属无害空转。
    await tx.operationSnapshot.create({
      data: {
        action: 'batch_create',
        itemCount: rawOrders.length,
        payload: JSON.stringify({
          action: 'batch_create',
          orderCount: rawOrders.length,
          createdIds,
        } as BatchSnapshotPayload),
      },
    });

    for (let idx = 0; idx < rawOrders.length; idx++) {
      const item = rawOrders[idx];
      // Excel 行号：表头占第 1 行，数据行从第 2 行起 → 下标 + 2
      const rowNo = idx + 2;
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
          if (existing) { skipped++; details.push({ row: rowNo, orderNo: orderNoStr, status: 'skipped', reason: '订单编号已存在' }); continue; }
        }
        if (orderNo19Str) {
          const existing = await tx.order.findFirst({ where: { orderNo19: orderNo19Str } });
          if (existing) { skipped++; details.push({ row: rowNo, orderNo: orderNoStr, orderNo19: orderNo19Str, status: 'skipped', reason: '19订单号已存在' }); continue; }
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
            // P2-3：使用预生成 id，使快照里的 createdIds 与实际落库行一一对应
            id: createdIds[idx],
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
        details.push({ row: rowNo, orderNo: orderNoStr, status: 'success', taker: taker?.wechatName || '未匹配', task: task?.productId || '未匹配' });
      } catch (e) {
        failed++;
        errors.push({ row: rowNo, orderNo: item.orderNo || item.orderNo19 || null, message: (e as Error).message });
      }
    }
  });

  return { success, failed, skipped, details, errors };
}

// ──────────────────────────────────────
// 只读批量预校验（导入前）：不写任何数据，仅返回每行判定与汇总
// ──────────────────────────────────────
function toStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

export async function validateBatchOrders(rows: any[]): Promise<BatchValidateResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('EMPTY_ORDER_LIST');
  }

  // 1) 先把所有单号收集起来，**一次性批量查库**（避免循环内 N+1）。
  const orderNos = new Set<string>();
  const orderNo19s = new Set<string>();
  for (const r of rows) {
    const no = toStr(r?.orderNo);
    const no19 = toStr(r?.orderNo19);
    if (no) orderNos.add(no);
    if (no19) orderNo19s.add(no19);
  }

  // orderNo / orderNo19 → 库内已存在记录对应的接单人昵称（用于走查重原因文案带上下文）
  const dbOrderNo = new Map<string, string>();
  const dbOrderNo19 = new Map<string, string>();
  if (orderNos.size > 0 || orderNo19s.size > 0) {
    const OR: any[] = [];
    if (orderNos.size > 0) OR.push({ orderNo: { in: [...orderNos] } });
    if (orderNo19s.size > 0) OR.push({ orderNo19: { in: [...orderNo19s] } });
    const existing = await prisma.order.findMany({
      where: { OR },
      select: { orderNo: true, orderNo19: true, taker: { select: { wechatName: true } } },
    });
    for (const e of existing) {
      const takerName = (e as any).taker?.wechatName || '';
      if (e.orderNo) dbOrderNo.set(e.orderNo, takerName);
      if (e.orderNo19) dbOrderNo19.set(e.orderNo19, takerName);
    }
  }

  // 2) 逐行判定（纯内存 + 上面这一次查询结果）
  const seenOrderNo = new Map<string, number>();   // 本批内 orderNo 首次出现的行号
  const seenOrderNo19 = new Map<string, number>(); // 本批内 orderNo19 首次出现的行号
  const resultRows: BatchValidateRow[] = rows.map((r, idx) => {
    const row = idx + 2; // Excel 行号：下标 + 2
    const orderNo = toStr(r?.orderNo);
    const orderNo19 = toStr(r?.orderNo19);

    // 登记本批出现的单号（无论最终判定如何，后续行都以「首次出现行」为准）
    const registerSeen = () => {
      if (orderNo && !seenOrderNo.has(orderNo)) seenOrderNo.set(orderNo, row);
      if (orderNo19 && !seenOrderNo19.has(orderNo19)) seenOrderNo19.set(orderNo19, row);
    };

    // a. 订单编号与19订单号至少填一个
    if (!orderNo && !orderNo19) {
      return { row, status: 'invalid', reason: '订单编号与19订单号至少填写一个' };
    }

    // b. 与库内已有单号重复
    if (orderNo && dbOrderNo.has(orderNo)) {
      registerSeen();
      const name = dbOrderNo.get(orderNo);
      return { row, status: 'dup', reason: `订单编号已存在${name ? `（接单人 ${name}）` : ''}` };
    }
    if (orderNo19 && dbOrderNo19.has(orderNo19)) {
      registerSeen();
      const name = dbOrderNo19.get(orderNo19);
      return { row, status: 'dup', reason: `19订单号已存在${name ? `（接单人 ${name}）` : ''}` };
    }

    // c. 同一批次内重复（前面已出现过相同单号）
    if (orderNo && seenOrderNo.has(orderNo)) {
      const first = seenOrderNo.get(orderNo) as number;
      registerSeen();
      return { row, status: 'dup', reason: `本文件内重复（第 ${first} 行已出现）` };
    }
    if (orderNo19 && seenOrderNo19.has(orderNo19)) {
      const first = seenOrderNo19.get(orderNo19) as number;
      registerSeen();
      return { row, status: 'dup', reason: `本文件内重复（第 ${first} 行已出现）` };
    }

    // d. 实付金额非法（非数字 / 负数）
    const rawAmount = r?.actualPayment;
    if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
      const n = Number(rawAmount);
      if (!Number.isFinite(n) || n < 0) {
        registerSeen();
        return { row, status: 'invalid', reason: '实付金额非法' };
      }
    }

    registerSeen();
    return { row, status: 'ok' };
  });

  const summary = {
    total: resultRows.length,
    ok: resultRows.filter(r => r.status === 'ok').length,
    dup: resultRows.filter(r => r.status === 'dup').length,
    invalid: resultRows.filter(r => r.status === 'invalid').length,
  };

  return { rows: resultRows, summary };
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

  // P2-3 两阶段提交：先解析全部行（纯读 + 纯计算），收集「改动前状态」；
  // 然后快照先落库，最后才执行真正的订单更新。快照创建失败 → 整个事务回滚。
  const writes: Array<{ item: any; id: string; data: any; before: Record<string, unknown> }> = [];

  await prisma.$transaction(async (tx) => {
    for (let idx = 0; idx < rawOrders.length; idx++) {
      const item = rawOrders[idx];
      // Excel 行号：表头占第 1 行，数据行从第 2 行起 → 下标 + 2
      const rowNo = idx + 2;
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
          details.push({ row: rowNo, orderNo: orderNoStr || orderNo19Str, status: 'not_found', reason: '订单不存在' });
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
          details.push({ row: rowNo, orderNo: orderNoStr || orderNo19Str, status: 'skipped', reason: '无需更新的字段' });
          continue;
        }

        // P2-3：第一遍只解析不写库——记录待写数据与「改动前状态」，快照落库后统一执行
        writes.push({
          item,
          id: existingOrder.id,
          data: updateData,
          before: pickBeforeFields(existingOrder as unknown as Record<string, unknown>, updateData),
        });

        const changes: string[] = [];
        if (updateData.isRefunded !== undefined && updateData.isRefunded !== existingOrder.isRefunded)
          changes.push(`返款状态: ${existingOrder.isRefunded ? '已返款' : '未返款'} → ${updateData.isRefunded ? '已返款' : '未返款'}`);
        if (updateData.isGoodReview !== undefined && updateData.isGoodReview !== existingOrder.isGoodReview)
          // isGoodReview 是字符串状态（'pending'/'reviewed'/'creating'/'returned'），必须按 === 'reviewed' 判定，
          // 否则任意非空串恒为真，日志永远输出「已好评 → 已好评」，与实际变更不符。仅改文案，不动写入逻辑。
          changes.push(`好评状态: ${existingOrder.isGoodReview === 'reviewed' ? '已好评' : '未好评'} → ${updateData.isGoodReview === 'reviewed' ? '已好评' : '未好评'}`);
        if (updateData.actualPayment !== undefined) changes.push(`实付款: ${existingOrder.actualPayment} → ${updateData.actualPayment}`);
        if (updateData.baseCommission !== undefined) changes.push(`基础返佣: ${existingOrder.baseCommission} → ${updateData.baseCommission}`);
        if (updateData.isBaseCommissionRefunded !== undefined && updateData.isBaseCommissionRefunded !== existingOrder.isBaseCommissionRefunded)
          changes.push(`基础返佣返款状态: ${existingOrder.isBaseCommissionRefunded ? '已返款' : '未返款'} → ${updateData.isBaseCommissionRefunded ? '已返款' : '未返款'}`);
        if (updateData.reviewCommission !== undefined) changes.push(`好评返佣: ${existingOrder.reviewCommission} → ${updateData.reviewCommission}`);
        if (updateData.remark !== undefined) changes.push(`备注: ${existingOrder.remark || '空'} → ${updateData.remark || '空'}`);

        // 注意：success 计数移到第二遍真正写库成功后（见下方 writes 循环），保证与实际更新数一致
        details.push({ row: rowNo, orderNo: orderNoStr || orderNo19Str, status: 'success', changes: changes.join(', ') });
      } catch (e) {
        failed++;
        errors.push(`${item.orderNo || item.orderNo19 || '未知'}: ${(e as Error).message}`);
      }
    }

    // P2-3：快照先落库（同一事务、先于任何订单更新），再执行真正的更新。
    // 快照创建失败 → 事务整体回滚 → 绝不出现「改了库但没快照」的窗口。
    if (writes.length > 0) {
      await tx.operationSnapshot.create({
        data: {
          action: 'batch_update',
          itemCount: writes.length,
          payload: JSON.stringify({
            action: 'batch_update',
            orderCount: writes.length,
            restores: writes.map(w => ({ id: w.id, before: w.before })),
          } as BatchSnapshotPayload),
        },
      });
      for (const w of writes) {
        try {
          await tx.order.update({ where: { id: w.id }, data: w.data });
          success++;
        } catch (e) {
          failed++;
          errors.push(`${w.item.orderNo || w.item.orderNo19 || '未知'}: ${(e as Error).message}`);
        }
      }
    }
  });

  return { success, failed, notFound, details, errors };
}

// ──────────────────────────────────────
// 批量更新状态（事务内）
// ──────────────────────────────────────
export async function batchUpdateOrderStatus(ids: string[], field: 'isRefunded' | 'isGoodReview' | 'isBaseCommissionRefunded', value: boolean | string) {
  // P2-3：取**全字段**旧值（不再 select 子集）——快照必须携带「改动前状态」供撤销精确还原
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
  });

  // 是否本次批量标记为「已好评」：与单条路径同一口径（parseReviewStatus 归一化）。
  const markReviewed = field === 'isGoodReview' && isMarkedReviewed(value);
  // 好评返佣默认金额只查一次（循环外 hoist），不要在 for 里重复查库。
  const reviewAmount = markReviewed ? await getReviewCommissionAmount() : null;

  await prisma.$transaction(async (tx) => {
    // P2-3 铁律：快照先落库（同一事务、先于所有订单写入）。
    // 快照创建失败 → 事务整体回滚 → 绝不出现「改了库但没快照」的窗口。
    // 快照保存批量将覆盖的字段的「改动前值」（超集：field + 派生字段 refundDate/reviewCommission/
    // reviewCommissionDate/totalRefund；撤销时写回未变化的字段是 no-op，无副作用）。
    const RESTORE_FIELDS = [
      'isRefunded', 'refundDate', 'isGoodReview', 'isBaseCommissionRefunded',
      'reviewCommission', 'reviewCommissionDate', 'totalRefund',
    ] as const;
    await tx.operationSnapshot.create({
      data: {
        action: 'batch_update_status',
        itemCount: orders.length,
        payload: JSON.stringify({
          action: 'batch_update_status',
          orderCount: orders.length,
          restores: orders.map((order: any) => ({
            id: order.id,
            before: Object.fromEntries(RESTORE_FIELDS.map((f) => [f, (order as Record<string, unknown>)[f] ?? null])),
          })),
        } as BatchSnapshotPayload),
      },
    });

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
