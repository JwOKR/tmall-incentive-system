import { Request, Response } from 'express';
import prisma from '../utils/db';
import { diffInDays } from '../utils/remindList';

/**
 * 异常订单预警（**纯只读**，不在 GET 内改库）
 *
 * 检测项（共 8 类）：
 *   1. 双单号全空            —— 无法对账的废单（order.count 计数 + order.findMany 展示，同一 where）
 *   2. 超长间隔接单人        —— ≥14 天未接单的活跃接单人（与 bootstrap.autoCheckAnomalies 同口径，纯读取）
 *   3. 实付 ≤ 0              —— 历史脏数据（实付金额非正）
 *   4. totalRefund 漂移      —— 库里的 totalRefund ≠ 实付 + 基础返佣 + 好评返佣（公式口径见 orderService）
 *   5. 同人同商品 30 天高频  —— 同接单人 + 同商品在近 30 天内接单次数超阈值
 *   6. 7 天间隔绕过          —— 同一接单人相邻两单间隔 < 7 天（force 绕过 7 天间隔的痕迹）
 *   7. 任务超限接单          —— Task.currentOrders > Task.maxOrders
 *   8. 超期任务              —— 有 deadline、已过截止「日历日」且未进入终态的任务（口径见 §8）
 *
 * 只读硬约束（由 tests/anomalyReadOnly.test.ts 守护）：
 *   - 禁止任何写操作（create/update/updateMany/delete/deleteMany/upsert/$transaction）；
 *   - 禁止裸 SQL（$queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe）；
 *   - 30 天未接单的自动停用只在服务启动时执行（utils/bootstrap.autoCheckAnomalies），**不得**放回 GET。
 *   - 每一项「计数」与其「展示数组」必须来自同一 where（口径一致）；且全部限量（take + orderBy）。
 *
 * 降级策略（可见降级）：单类检测失败不阻断整体渲染，但失败会**结构化写入响应体 scanErrors**，
 * 前端据此展示醒目警告横幅 —— 绝不允许「面板显示全绿、实则某检测根本没跑」的静默漏报。
 */

/* ============================================================
 * 扫描参数与阈值（全部限量，避免全表扫描）
 * ============================================================ */
const MISSING_NO_LIMIT = 50; // 双单号全空：展示条数
const NEGATIVE_PAYMENT_LIMIT = 50; // 实付≤0：扫描/展示条数
const REFUND_SCAN_LIMIT = 200; // 返款漂移：扫描窗口（最近 200 条）
const FREQ_WINDOW_DAYS = 30; // 高频：统计窗口（近 30 天）
const FREQ_SCAN_LIMIT = 500; // 高频：最多扫描条数（供内存分组）
/**
 * 高频阈值：同人同商品近 30 天次数 > 2（即 ≥3）。
 * 取值理由：系统全局 7 天间隔规则下，一个接单人每 30 天最多约 4 单（30/7≈4.3）。
 * 「同一商品」在 30 天内达到 3 单，意味着 7 天间隔被 force 绕过至少两次，属明显异常，故取 3（>2）。
 */
const FREQ_THRESHOLD = 2;
const INTERVAL_WINDOW_DAYS = 90; // 7 天间隔：扫描窗口（近 90 天）
const INTERVAL_SCAN_LIMIT = 500; // 7 天间隔：最多扫描条数
const INTERVAL_MIN_DAYS = 7; // 规则：同一接单人相邻两单间隔须 ≥7 天（见 taskController.quickOrder）
const TASK_SCAN_LIMIT = 200; // 任务超限：最多扫描任务数
const DRIFT_EPSILON = 0.01; // 返款漂移浮点容差
const STALE_THRESHOLD_DAYS = 14; // 超长间隔接单人展示阈值
const OVERDUE_TASK_LIMIT = 200; // 超期任务：最多扫描/展示任务数
/**
 * 任务终态：已完成 / 已取消。二者都不需要再推进，故**不判超期**。
 * - 'completed'：见 taskController.refreshAllTaskStatus（任一订单已好评即置为 completed）；
 * - 'cancelled'：见 taskController.refreshAllTaskStatus 以 `status: { not: 'cancelled' }` 取待处理任务，
 *   即 cancelled 亦被视作终态。
 * 枚举取值来源：prisma/schema.prisma 的 Task.status 注释。
 * ⚠️ 勿删 'cancelled'：已取消任务的截止日无意义，计入终态不判超期（否则会误报噪音）。
 */
const TERMINAL_TASK_STATUSES: string[] = ['completed', 'cancelled'];

const DAY_MS = 24 * 60 * 60 * 1000;

/* ============================================================
 * 行类型
 * ============================================================ */
/** orderTaker.findMany 结果（用于 staleTakers 计算） */
interface StaleTakerSource {
  id: string;
  wechatName: string;
  wechatId: string;
  createdAt: Date;
  orders: Array<{ orderDate: Date }>;
}
/** order.findMany 结果（missingOrderNoOrders 映射） */
interface MissingOrderSource {
  id: string;
  actualPayment: number;
  orderDate: Date;
  taker: { wechatName: string; wechatId: string } | null;
}
interface NegativePaymentRow {
  id: string;
  actualPayment: number;
  orderDate: Date;
  takerId: string | null;
}
interface RefundScanRow {
  id: string;
  actualPayment: number;
  baseCommission: number;
  reviewCommission: number;
  totalRefund: number;
  orderDate: Date;
  takerId: string | null;
}
interface FreqScanRow {
  id: string;
  takerId: string | null;
  productId: string;
  productCode: string;
  orderDate: Date;
}
interface IntervalRow {
  id: string;
  takerId: string | null;
  orderDate: Date;
}
interface TaskRow {
  id: string;
  productId: string;
  productCode: string;
  maxOrders: number;
  currentOrders: number;
  status: string;
}
/** 超期任务：task.findMany 结果（含 deadline） */
interface OverdueTaskRow {
  id: string;
  productId: string;
  productCode: string;
  deadline: Date;
  status: string;
  currentOrders: number;
  maxOrders: number;
}
interface TakerLite {
  id: string;
  wechatName: string;
  wechatId: string;
}
/** 可见降级：单类检测失败的结构化记录 */
interface ScanError {
  type: string;
  message: string;
}

// 异常订单预警（纯只读）
export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 可见降级：单类检测失败不阻断其余检测，但失败会被记录并写入响应体
    const scanErrors: ScanError[] = [];
    const readSafe = async <T>(type: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        console.error(`[anomalies] 检测「${type}」失败：`, message);
        scanErrors.push({ type, message });
        return fallback;
      }
    };

    // ── 1. 双单号全空检测 = 无法对账的废单。──────────────────────────────
    //    @unique 对 NULL 不生效（MySQL 允许多个 NULL），这类行不会被唯一约束拦住，
    //    是唯一会真正溜进来的脏数据来源。
    //    注：orderNo / orderNo19 的精确重复由数据库唯一约束保证，不可能存在，故不做重复检测。
    const missingNoWhere = {
      AND: [
        { OR: [{ orderNo: null }, { orderNo: '' }] },
        { OR: [{ orderNo19: null }, { orderNo19: '' }] },
      ],
    };
    const missingOrderNoCount = await prisma.order.count({ where: missingNoWhere });
    const missingOrderNoOrders = await prisma.order.findMany({
      where: missingNoWhere,
      select: {
        id: true,
        actualPayment: true,
        orderDate: true,
        taker: { select: { wechatName: true, wechatId: true } },
      },
      orderBy: { orderDate: 'desc' },
      take: MISSING_NO_LIMIT,
    });

    // ── 2. 超长间隔接单人（超过 14 天未接单的活跃接单人）——纯读取，不做状态变更 ──
    const staleTakers = await prisma.orderTaker.findMany({
      where: { status: 'active' },
      include: {
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 1,
          select: { orderDate: true },
        },
      },
    });

    const staleTakerList = staleTakers
      .map((t: StaleTakerSource) => {
        const lastOrderDate = t.orders.length > 0 ? t.orders[0].orderDate : null;
        // 与 bootstrap.autoCheckAnomalies 同一口径：从未接单时以注册时间为最后一次活动
        const lastActivity = lastOrderDate ?? t.createdAt;
        const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS);
        return {
          id: t.id,
          wechatName: t.wechatName,
          wechatId: t.wechatId,
          lastOrderDate: lastOrderDate ? lastOrderDate.toISOString() : null,
          lastActivityAt: lastActivity.toISOString(),
          daysSinceLastOrder: daysSince,
          neverOrdered: lastOrderDate === null,
        };
      })
      .filter((t: { daysSinceLastOrder: number }) => t.daysSinceLastOrder >= STALE_THRESHOLD_DAYS)
      .sort((a: { daysSinceLastOrder: number }, b: { daysSinceLastOrder: number }) => b.daysSinceLastOrder - a.daysSinceLastOrder);

    // ── 3. 实付 ≤ 0（历史脏数据）────────────────────────────────────────
    const negativePaymentRows = await readSafe<NegativePaymentRow[]>(
      'negativePayment',
      () =>
        prisma.order.findMany({
          where: { actualPayment: { lte: 0 } },
          select: { id: true, actualPayment: true, orderDate: true, takerId: true },
          orderBy: { orderDate: 'desc' },
          take: NEGATIVE_PAYMENT_LIMIT,
        }),
      []
    );
    const negativePaymentCount = negativePaymentRows.length;

    // ── 4. totalRefund 漂移：库值 ≠ 实付 + 基础返佣 + 好评返佣 ──────────────
    //    公式口径与 orderService 一致（totalRefund = actualPayment + baseCommission + reviewCommission）。
    //    必须用 Prisma 查询 + 内存比对（禁裸 SQL）。限量扫描最近 REFUND_SCAN_LIMIT 条。
    const refundScanRows = await readSafe<RefundScanRow[]>(
      'refundMismatch',
      () =>
        prisma.order.findMany({
          select: {
            id: true,
            actualPayment: true,
            baseCommission: true,
            reviewCommission: true,
            totalRefund: true,
            orderDate: true,
            takerId: true,
          },
          orderBy: { orderDate: 'desc' },
          take: REFUND_SCAN_LIMIT,
        }),
      []
    );
    const refundMismatches = refundScanRows.filter(r => {
      const fields = [r.actualPayment, r.baseCommission, r.reviewCommission, r.totalRefund];
      if (!fields.every(v => typeof v === 'number' && Number.isFinite(v))) return false;
      const expected = r.actualPayment + r.baseCommission + r.reviewCommission;
      return Math.abs(r.totalRefund - expected) > DRIFT_EPSILON;
    });
    const refundMismatchCount = refundMismatches.length;

    // ── 5. 同人同商品 30 天内高频（按 takerId + productId 分组）──────────────
    const freqSince = new Date(now.getTime() - FREQ_WINDOW_DAYS * DAY_MS);
    const freqScanRows = await readSafe<FreqScanRow[]>(
      'highFrequency',
      () =>
        prisma.order.findMany({
          where: { takerId: { not: null }, orderDate: { gte: freqSince } },
          select: { id: true, takerId: true, productId: true, productCode: true, orderDate: true },
          orderBy: { orderDate: 'desc' },
          take: FREQ_SCAN_LIMIT,
        }),
      []
    );
    const freqMap = new Map<string, { takerId: string; productId: string; productCode: string; count: number }>();
    for (const r of freqScanRows) {
      if (!r.takerId || !r.productId) continue;
      const key = `${r.takerId}::${r.productId}`;
      const g = freqMap.get(key) ?? { takerId: r.takerId, productId: r.productId, productCode: r.productCode, count: 0 };
      g.count += 1;
      g.productCode = r.productCode;
      freqMap.set(key, g);
    }
    const highFrequencyGroups = [...freqMap.values()]
      .filter(g => g.count > FREQ_THRESHOLD)
      .sort((a, b) => b.count - a.count);
    const highFrequencyCount = highFrequencyGroups.length;

    // ── 6. 7 天间隔绕过：同一接单人相邻两单间隔 < 7 天 ──────────────────────
    //    规则真实定义见 taskController.quickOrder：「全局 7 天间隔，force 可绕过」。
    //    出现间隔 < 7 天，说明存在 force 绕过（或批量补录）。
    const intervalSince = new Date(now.getTime() - INTERVAL_WINDOW_DAYS * DAY_MS);
    const intervalRows = await readSafe<IntervalRow[]>(
      'intervalBypass',
      () =>
        prisma.order.findMany({
          where: { takerId: { not: null }, orderDate: { gte: intervalSince } },
          select: { id: true, takerId: true, orderDate: true },
          orderBy: { orderDate: 'asc' },
          take: INTERVAL_SCAN_LIMIT,
        }),
      []
    );
    const rowsByTaker = new Map<string, Array<{ id: string; orderDate: Date }>>();
    for (const r of intervalRows) {
      if (!r.takerId) continue;
      const arr = rowsByTaker.get(r.takerId) ?? [];
      arr.push({ id: r.id, orderDate: r.orderDate });
      rowsByTaker.set(r.takerId, arr);
    }
    const intervalBypassPairs: Array<{
      takerId: string;
      prevOrderId: string;
      prevOrderDate: string;
      nextOrderId: string;
      nextOrderDate: string;
      gapDays: number;
    }> = [];
    for (const [takerId, list] of rowsByTaker) {
      list.sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
      for (let i = 1; i < list.length; i++) {
        const gapDays = (list[i].orderDate.getTime() - list[i - 1].orderDate.getTime()) / DAY_MS;
        if (gapDays < INTERVAL_MIN_DAYS) {
          intervalBypassPairs.push({
            takerId,
            prevOrderId: list[i - 1].id,
            prevOrderDate: list[i - 1].orderDate.toISOString(),
            nextOrderId: list[i].id,
            nextOrderDate: list[i].orderDate.toISOString(),
            gapDays: Math.round(gapDays * 100) / 100,
          });
        }
      }
    }
    intervalBypassPairs.sort((a, b) => a.gapDays - b.gapDays);
    const intervalBypassCount = intervalBypassPairs.length;

    // ── 7. 任务超限接单：Task.currentOrders > Task.maxOrders ────────────────
    const overLimitTasks = await readSafe<TaskRow[]>(
      'taskOverLimit',
      async () => {
        const tasks = await prisma.task.findMany({
          where: { maxOrders: { gt: 0 } },
          select: { id: true, productId: true, productCode: true, maxOrders: true, currentOrders: true, status: true },
          orderBy: { publishDate: 'desc' },
          take: TASK_SCAN_LIMIT,
        });
        return tasks.filter((t: TaskRow) => t.currentOrders > t.maxOrders);
      },
      []
    );
    const taskOverLimitCount = overLimitTasks.length;

    // ── 8. 超期任务：有截止日期、已过截止「日历日」、且未进入终态 ──────────────
    //    判定口径（与前端 client/src/pages/Tasks.tsx 的 getDeadlineTone 保持一致）：
    //      · 按**本地日历日**比较，不受时分秒影响（本仓自然日工具 utils/remindList.diffInDays
    //        即「各自归零到本地 00:00 后取差」，与前端 getFullYear/getMonth/getDate 同口径）；
    //      · deadline 为 null → **不判超期**（无截止日无法判定，历史任务即此类）；
    //      · 截止日「当天」不算超期（含当天最后一刻）—— 只有 deadline < 今天本地 00:00 才算超期，
    //        故前端显示为「临期（≤3 天）」的当天件不会被误报；
    //      · 已完成（status='completed'）/ 已取消（status='cancelled'）为终态，不再判超期。
    //    计数（count）与展示（findMany）**共用同一份 overdueTaskWhere**，保证口径一致（不写两遍）。
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const overdueTaskWhere = {
      deadline: { not: null, lt: startOfToday },
      status: { notIn: TERMINAL_TASK_STATUSES },
    };
    // 单次 readSafe 包住 count + findMany：任一失败只记一条结构化降级，不阻断其余检测。
    const overdueTaskScan = await readSafe<{ count: number; rows: OverdueTaskRow[] }>(
      'overdueTask',
      async () => {
        const count = await prisma.task.count({ where: overdueTaskWhere });
        const rows = await prisma.task.findMany({
          where: overdueTaskWhere,
          select: {
            id: true,
            productId: true,
            productCode: true,
            deadline: true,
            status: true,
            currentOrders: true,
            maxOrders: true,
          },
          orderBy: { deadline: 'asc' }, // 最早超期的排在最前
          take: OVERDUE_TASK_LIMIT,
        });
        return { count, rows };
      },
      { count: 0, rows: [] }
    );
    const overdueTaskCount = overdueTaskScan.count;
    const overdueTasks = overdueTaskScan.rows;

    // ── 接单人名称映射（供各展示数组复用，一次性读取，未命中则不查询）────────
    const takerIds = new Set<string>();
    for (const r of negativePaymentRows) if (r.takerId) takerIds.add(r.takerId);
    for (const r of refundMismatches) if (r.takerId) takerIds.add(r.takerId);
    for (const g of highFrequencyGroups) takerIds.add(g.takerId);
    for (const p of intervalBypassPairs) takerIds.add(p.takerId);

    const takerMap = new Map<string, { wechatName: string; wechatId: string }>();
    if (takerIds.size > 0) {
      const takers = await readSafe<TakerLite[]>(
        'takerNames',
        () =>
          prisma.orderTaker.findMany({
            where: { id: { in: [...takerIds] } },
            select: { id: true, wechatName: true, wechatId: true },
          }),
        []
      );
      for (const t of takers) takerMap.set(t.id, { wechatName: t.wechatName, wechatId: t.wechatId });
    }
    const nameOf = (id: string | null): string | null => (id ? takerMap.get(id)?.wechatName ?? null : null);
    const wxIdOf = (id: string | null): string | null => (id ? takerMap.get(id)?.wechatId ?? null : null);

    // ── 组装响应 ──────────────────────────────────────────────────────────
    const summary = {
      // 总数 = 所有类型计数之和
      totalAnomalies:
        missingOrderNoCount +
        staleTakerList.length +
        negativePaymentCount +
        refundMismatchCount +
        highFrequencyCount +
        intervalBypassCount +
        taskOverLimitCount +
        overdueTaskCount,
      missingOrderNo: missingOrderNoCount, // 双单号全空（总数，非展示数）
      staleTakers: staleTakerList.length,
      negativePayment: negativePaymentCount,
      refundMismatch: refundMismatchCount,
      highFrequency: highFrequencyCount,
      intervalBypass: intervalBypassCount,
      taskOverLimit: taskOverLimitCount,
      overdueTask: overdueTaskCount,
    };

    res.json({
      success: true,
      data: {
        summary,
        // 可见降级：非空表示有检测失败被跳过（前端需醒目提示，切勿当作「全绿」）
        scanErrors,
        // 各检测的扫描窗口说明（透明告知「仅扫描最近 N 条」）
        scanNotes: {
          negativePayment: `仅列出实付 ≤ 0 的最近 ${NEGATIVE_PAYMENT_LIMIT} 条订单`,
          refundMismatch: `仅扫描最近 ${REFUND_SCAN_LIMIT} 条订单`,
          highFrequency: `统计近 ${FREQ_WINDOW_DAYS} 天内同人同商品次数 > ${FREQ_THRESHOLD}（即 ≥${FREQ_THRESHOLD + 1}）的分组，最多扫描最近 ${FREQ_SCAN_LIMIT} 条订单`,
          intervalBypass: `统计近 ${INTERVAL_WINDOW_DAYS} 天内同一接单人相邻两单间隔 < ${INTERVAL_MIN_DAYS} 天，最多扫描最近 ${INTERVAL_SCAN_LIMIT} 条订单`,
          taskOverLimit: `仅扫描最近 ${TASK_SCAN_LIMIT} 个任务`,
          overdueTask: `仅列出截止日早于今天且未完成/未取消的任务，最多 ${OVERDUE_TASK_LIMIT} 条`,
        },
        // 1. 双单号全空
        missingOrderNoOrders: missingOrderNoOrders.map((o: MissingOrderSource) => ({
          id: o.id,
          actualPayment: o.actualPayment,
          orderDate: o.orderDate.toISOString(),
          wechatName: o.taker?.wechatName ?? null,
          wechatId: o.taker?.wechatId ?? null,
        })),
        // 2. 超长间隔接单人
        staleTakers: staleTakerList,
        // 3. 实付 ≤ 0
        negativePaymentOrders: negativePaymentRows.map(r => ({
          id: r.id,
          actualPayment: r.actualPayment,
          orderDate: r.orderDate.toISOString(),
          wechatId: wxIdOf(r.takerId),
          wechatName: nameOf(r.takerId),
        })),
        // 4. totalRefund 漂移
        refundMismatchOrders: refundMismatches.map(r => {
          const expectedRefund = r.actualPayment + r.baseCommission + r.reviewCommission;
          return {
            id: r.id,
            actualPayment: r.actualPayment,
            baseCommission: r.baseCommission,
            reviewCommission: r.reviewCommission,
            totalRefund: r.totalRefund,
            expectedRefund,
            diff: Math.round((r.totalRefund - expectedRefund) * 100) / 100,
            orderDate: r.orderDate.toISOString(),
            wechatId: wxIdOf(r.takerId),
            wechatName: nameOf(r.takerId),
          };
        }),
        // 5. 同人同商品 30 天高频
        highFrequencyGroups: highFrequencyGroups.map(g => ({
          takerId: g.takerId,
          wechatId: wxIdOf(g.takerId),
          wechatName: nameOf(g.takerId),
          productId: g.productId,
          productCode: g.productCode,
          count: g.count,
        })),
        // 6. 7 天间隔绕过
        intervalBypassPairs: intervalBypassPairs.map(p => ({
          ...p,
          wechatId: wxIdOf(p.takerId),
          wechatName: nameOf(p.takerId),
        })),
        // 7. 任务超限
        overLimitTasks,
        // 8. 超期任务（最早超期的在前）
        overdueTasks: overdueTasks.map((t: OverdueTaskRow) => ({
          id: t.id,
          productId: t.productId,
          productCode: t.productCode,
          deadline: t.deadline.toISOString(),
          status: t.status,
          currentOrders: t.currentOrders,
          maxOrders: t.maxOrders,
          // 超期天数：截止「日历日」距今天的天数（≥1，见 diffInDays 口径）
          daysOverdue: diffInDays(t.deadline, now),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ success: false, message: '获取异常预警失败' });
  }
};
