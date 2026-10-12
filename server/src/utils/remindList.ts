/**
 * 催单列表 / 超期未返款看板 共享的纯逻辑（单一数据源）。
 *
 * 背景：
 *   - 催单列表（remindController.getRemindList）与超期未返款看板（getRefundAlerts）
 *     都需要「按接单人分组」「格式化金额」这类逻辑；
 *   - 两处的 days 语义**方向相反**：催单是「最近 N 天内」（orderDate >= now - N），
 *     看板是「超过 N 天」（orderDate <= now - N）。分组/格式化逻辑相同，边界过滤不同，
 *     故把纯逻辑抽到本模块，避免口径分叉。
 *
 * 本模块不依赖 Prisma，便于单元测试。
 */

/** 分组所需的最小订单字段（prisma.order.findMany 的结果结构满足该接口） */
export interface RemindSourceOrder {
  id: string;
  orderNo19: string | null;
  actualPayment: number;
  baseCommission: number;
  orderDate: Date;
  isRefunded: boolean;
  isGoodReview: string | null;
  takerId: string | null;
  taker?: { wechatName: string; wechatId: string } | null;
}

/** 单个接单人的分组结果 */
export interface RemindTakerGroup {
  takerId: string;
  wechatName: string;
  wechatId: string;
  unpaidOrders: Array<{ orderId: string; orderNo19: string | null; actualPayment: number; orderDate: Date }>;
  unreviewedOrders: Array<{ orderId: string; orderNo19: string | null; baseCommission: number; orderDate: Date }>;
  totalPending: number;
}

/**
 * 金额格式化：保留两位小数，结尾 `.00` 去掉。
 * 与 remindController 原 `fmt` 逐字等价，保证催单文本与看板文本口径一致。
 */
export function formatAmount(n: number): string {
  const fixed = n.toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}

/**
 * 按接单人分组（与 remindController 原实现逐字等价）：
 *   - 无接单人（takerId 或 taker 缺失）的订单直接跳过；
 *   - `!isRefunded` → 待返款；
 *   - `isGoodReview !== 'reviewed'` → 未好评（isGoodReview 是字符串状态字段，
 *     必须用 `=== 'reviewed'` 判定，禁止真值判断——'pending'/'creating' 等非空串都是"未好评"）；
 *   - totalPending = 待返款数 + 未好评数，并按降序排序（待处理最多的在前）。
 */
export function groupOrdersByTaker(orders: RemindSourceOrder[]): RemindTakerGroup[] {
  const takerMap = new Map<string, {
    wechatName: string;
    wechatId: string;
    unpaidOrders: Array<{ orderId: string; orderNo19: string | null; actualPayment: number; orderDate: Date }>;
    unreviewedOrders: Array<{ orderId: string; orderNo19: string | null; baseCommission: number; orderDate: Date }>;
  }>();

  for (const order of orders) {
    if (!order.takerId || !order.taker) continue;
    const tid = order.takerId;
    if (!takerMap.has(tid)) {
      takerMap.set(tid, {
        wechatName: order.taker.wechatName,
        wechatId: order.taker.wechatId,
        unpaidOrders: [],
        unreviewedOrders: [],
      });
    }
    const entry = takerMap.get(tid)!;
    if (!order.isRefunded) {
      entry.unpaidOrders.push({
        orderId: order.id,
        orderNo19: order.orderNo19,
        actualPayment: order.actualPayment,
        orderDate: order.orderDate,
      });
    }
    if (order.isGoodReview !== 'reviewed') {
      entry.unreviewedOrders.push({
        orderId: order.id,
        orderNo19: order.orderNo19,
        baseCommission: order.baseCommission,
        orderDate: order.orderDate,
      });
    }
  }

  return Array.from(takerMap.entries())
    .map(([id, data]) => ({
      takerId: id,
      ...data,
      totalPending: data.unpaidOrders.length + data.unreviewedOrders.length,
    }))
    .sort((a, b) => b.totalPending - a.totalPending);
}

/**
 * 自然日差：两边都归零到**本地 00:00** 后相减，再取 floor。
 * 例：orderDate = 今天 14:00，now = 今天 09:00 → 先各自归零到今天 00:00 → 差 0 天。
 * 这样「第 N 天当天」的订单不会因为时分秒不同而产生 ±1 天的边界抖动。
 *
 * @param from 起始时间（通常是 orderDate）
 * @param to   结束时间（通常是 now）
 * @returns to 与 from 的自然日天数差（to 早于 from 时为负）
 */
export function diffInDays(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}
