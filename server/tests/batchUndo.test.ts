/**
 * batchUndo.test.ts —— 第 6 批 W4：批量操作撤销（P2-3）+ 任务超时 deadline（P2-5）+ 任务导入查重（P2-8）
 *
 * 覆盖：
 *   A. batchCreateOrders —— 快照先于写库落库（调用顺序断言）、createdIds 与实际行一一对应、
 *      撤销 = 删除新建行 + 回退任务/接单人计数
 *   B. 快照创建失败 → 整个批量失败且订单**一行都未被修改**（「不许出现改了库没快照」的直接证据）
 *   C. batchUpdateOrderStatus —— 快照先行 + 撤销后旧值**精确**还原
 *   D. batchUpdateOrders   —— 快照先行 + 撤销后旧值**精确**还原
 *   E. 幂等：同一快照不能撤销两次（消费后拒绝 + 并发抢占 0 行拒绝）
 *   F. 路由：GET/POST /undo-last 注册且在 /:id 之前；无权限 → 403（真实 requireEditPermission 中间件）
 *   G. P2-8：batchCreateTasks 重复淘口令/商品ID被跳过且逐行报告（带 Excel 行号）、空淘口令不判重
 *   H. P2-5：deadline 可空 —— createTask 不传 deadline 落 null；updateTask 不传不覆盖、
 *      空串清除、合法日期正常解析
 *
 * 手法：require.cache 预注入 fake prisma（**同时注入 `\` 与 `/` 两种路径键**）驱动真实 service/controller，
 *       不连数据库。退出码：全部 PASS → 0；存在 FAIL → 1。
 */

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

/* ============================================================
 * fake prisma + 状态
 * ============================================================ */
type Row = Record<string, any>;

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${String(idSeq).padStart(4, '0')}`;
}

const state = {
  orders: new Map<string, Row>(),
  tasks: new Map<string, Row>(),
  takers: new Map<string, Row>(),
  snapshots: [] as Row[],
  callLog: [] as string[],
  auditLogs: [] as any[],
  snapshotCreateShouldFail: false,
  claimAlwaysZero: false, // 模拟并发抢占失败（updateMany 命中 0 行）
  taskUpdateCalls: [] as any[],
};

function resetDb(): void {
  state.orders.clear();
  state.tasks.clear();
  state.takers.clear();
  state.snapshots.length = 0;
  state.callLog.length = 0;
  state.auditLogs.length = 0;
  state.taskUpdateCalls.length = 0;
  state.snapshotCreateShouldFail = false;
  state.claimAlwaysZero = false;
}

function p2025(): Error {
  const err: any = new Error('Record not found');
  err.code = 'P2025';
  return err;
}

/** 简易条件匹配：{ field: value } 或 { field: { in: [...] } } */
function matchCond(row: Row, cond: Row): boolean {
  return Object.keys(cond).every((key) => {
    const expected = cond[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && 'in' in expected) {
      return (expected.in as any[]).includes(row[key]);
    }
    return row[key] === expected;
  });
}

/** 对 update data 的 { decrement / increment } 语义做真实数值运算 */
function applyCounter(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    // Prisma 语义：data 中显式为 undefined 的字段 = 不修改，绝不覆盖原值
    if (value === undefined) continue;
    if (value && typeof value === 'object' && 'decrement' in value) {
      row[key] = (Number(row[key]) || 0) - Number(value.decrement);
    } else if (value && typeof value === 'object' && 'increment' in value) {
      row[key] = (Number(row[key]) || 0) + Number(value.increment);
    } else {
      row[key] = value;
    }
  }
}

/** Prisma 语义的 update 合并：显式 undefined 的字段 = 不修改 */
function prismaAssign(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    row[key] = value;
  }
}

const fakePrisma: any = {
  operationSnapshot: {
    create: async (args: any) => {
      state.callLog.push('operationSnapshot.create');
      if (state.snapshotCreateShouldFail) throw new Error('SNAPSHOT_CREATE_FAILED(injected)');
      const row: Row = {
        id: nextId('snap'),
        action: args.data.action,
        payload: args.data.payload,
        itemCount: args.data.itemCount,
        consumed: false,
        undoneAt: null,
        createdAt: new Date(),
      };
      state.snapshots.push(row);
      return { ...row };
    },
    findFirst: async (_args: any) => {
      state.callLog.push('operationSnapshot.findFirst');
      // orderBy createdAt desc：fake 的 createdAt 顺序即插入顺序 → 返回最后一条（最新）
      return state.snapshots.length ? { ...state.snapshots[state.snapshots.length - 1] } : null;
    },
    updateMany: async (args: any) => {
      state.callLog.push('operationSnapshot.updateMany');
      if (state.claimAlwaysZero) return { count: 0 };
      const s = state.snapshots.find((x) => x.id === args.where.id);
      if (!s) return { count: 0 };
      if (args.where.consumed === false && s.consumed) return { count: 0 };
      if (args.where.consumed === false) s.consumed = true;
      if (args.data?.undoneAt) s.undoneAt = args.data.undoneAt;
      return { count: 1 };
    },
  },
  order: {
    findMany: async (args: any) => {
      state.callLog.push('order.findMany');
      let rows = [...state.orders.values()];
      const inIds = args?.where?.id?.in;
      if (inIds) rows = rows.filter((r) => inIds.includes(r.id));
      return rows.map((r) => ({ ...r }));
    },
    findFirst: async (args: any) => {
      state.callLog.push('order.findFirst');
      const where = args?.where || {};
      if (Array.isArray(where.OR) && where.OR.length > 0) {
        for (const r of state.orders.values()) {
          if (where.OR.some((cond) => matchCond(r, cond))) return { ...r };
        }
        return null;
      }
      // 非 OR 形态（如批量导入查重的 where: { orderNo }）：逐行匹配
      for (const r of state.orders.values()) {
        if (matchCond(r, where)) return { ...r };
      }
      return null;
    },
    create: async (args: any) => {
      state.callLog.push('order.create');
      const row: Row = { id: args.data.id || nextId('ord'), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      state.orders.set(row.id, row);
      return { ...row };
    },
    update: async (args: any) => {
      state.callLog.push('order.update');
      const row = state.orders.get(args.where.id);
      if (!row) throw p2025();
      prismaAssign(row, args.data);
      return { ...row };
    },
    updateMany: async (args: any) => {
      state.callLog.push('order.updateMany');
      let count = 0;
      for (const [id, row] of state.orders) {
        const hit = args.where.id?.in ? args.where.id.in.includes(id) : id === args.where.id;
        if (hit) {
          prismaAssign(row, args.data);
          count++;
        }
      }
      return { count };
    },
    delete: async (args: any) => {
      state.callLog.push('order.delete');
      const row = state.orders.get(args.where.id);
      if (!row) throw p2025();
      state.orders.delete(args.where.id);
      return { ...row };
    },
  },
  task: {
    findUnique: async (args: any) => {
      state.callLog.push('task.findUnique');
      if (args?.where?.id) {
        const row = state.tasks.get(args.where.id);
        return row ? { ...row } : null;
      }
      if (args?.where?.taoToken) {
        for (const r of state.tasks.values()) if (r.taoToken === args.where.taoToken) return { ...r };
      }
      return null;
    },
    findFirst: async (args: any) => {
      state.callLog.push('task.findFirst');
      const where = args?.where || {};
      const statusOk = (r: Row) =>
        !where.status?.in || where.status.in.includes(r.status);
      if (Array.isArray(where.OR)) {
        for (const r of state.tasks.values()) {
          if (statusOk(r) && where.OR.some((cond: Row) => matchCond(r, cond))) return { ...r };
        }
        return null;
      }
      for (const r of state.tasks.values()) {
        if (statusOk(r) && matchCond(r, where)) return { ...r };
      }
      return null;
    },
    findMany: async (args: any) => {
      state.callLog.push('task.findMany');
      const OR: any[] = args?.where?.OR || [];
      if (OR.length === 0) return [...state.tasks.values()].map((r) => ({ ...r }));
      return [...state.tasks.values()].filter((r) => OR.some((cond) => matchCond(r, cond))).map((r) => ({ ...r }));
    },
    create: async (args: any) => {
      state.callLog.push('task.create');
      const row: Row = { id: nextId('task'), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      state.tasks.set(row.id, row);
      return { ...row };
    },
    createMany: async (args: any) => {
      state.callLog.push('task.createMany');
      let count = 0;
      for (const d of args.data) {
        if (args.skipDuplicates && d.taoToken) {
          const dup = [...state.tasks.values()].some((t) => t.taoToken === d.taoToken);
          if (dup) continue; // 并发窗口兜底：只跳过该行，不整批失败
        }
        const row: Row = { id: nextId('task'), currentOrders: 0, createdAt: new Date(), ...d };
        state.tasks.set(row.id, row);
        count++;
      }
      return { count };
    },
    update: async (args: any) => {
      state.callLog.push('task.update');
      const row = state.tasks.get(args.where.id);
      if (!row) throw p2025();
      applyCounter(row, args.data);
      state.taskUpdateCalls.push({ id: args.where.id, data: args.data });
      return { ...row };
    },
    updateMany: async (args: any) => {
      state.callLog.push('task.updateMany');
      let count = 0;
      for (const row of state.tasks.values()) {
        applyCounter(row, args.data);
        count++;
      }
      return { count };
    },
  },
  orderTaker: {
    findFirst: async (args: any) => {
      state.callLog.push('orderTaker.findFirst');
      const OR: any[] = args?.where?.OR || [];
      for (const r of state.takers.values()) {
        if (OR.some((cond) => matchCond(r, cond))) return { ...r };
      }
      return null;
    },
    update: async (args: any) => {
      state.callLog.push('orderTaker.update');
      const row = state.takers.get(args.where.id);
      if (!row) throw p2025();
      applyCounter(row, args.data);
      return { ...row };
    },
    updateMany: async (args: any) => {
      state.callLog.push('orderTaker.updateMany');
      let count = 0;
      for (const row of state.takers.values()) {
        applyCounter(row, args.data);
        count++;
      }
      return { count };
    },
  },
  log: {
    create: async (args: any) => {
      state.auditLogs.push(args.data);
      return {};
    },
    deleteMany: async (_args: any) => {
      state.callLog.push('log.deleteMany');
      return { count: 0 };
    },
  },
  $transaction: async (fn: any) => {
    state.callLog.push('$transaction.begin');
    const result = await fn(fakePrisma);
    state.callLog.push('$transaction.commit');
    return result;
  },
};

/* ============================================================
 * require.cache 预注入（\ 与 / 双路径键）
 * ============================================================ */
function injectFake(modulePath: string, exportsObj: any): void {
  const resolved = require.resolve(modulePath);
  const entry = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: [],
  } as unknown as NodeModule;
  require.cache[resolved] = entry;
  // 同时注入正斜杠路径键（Windows 下 require 缓存键可能是反斜杠形式）
  require.cache[resolved.replace(/\\/g, '/')] = entry;
}

injectFake('../src/utils/db', { __esModule: true, default: fakePrisma });
injectFake('../src/utils/logger', {
  __esModule: true,
  default: { info() {}, warn() {}, error() {}, debug() {} },
});
injectFake('../src/utils/auditLog', {
  __esModule: true,
  createAuditLog: async (data: any) => {
    state.auditLogs.push(data);
    return {};
  },
  getClientIp: () => '127.0.0.1',
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'batch-undo-test-secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderService = require('../src/services/orderService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderController = require('../src/controllers/orderController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const taskController = require('../src/controllers/taskController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { requireEditPermission, requireViewPermission } = require('../src/middleware/auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ordersRouter = require('../src/routes/orders').default;

/* ============================================================
 * express req/res 桩
 * ============================================================ */
function makeRes(): any {
  const res: any = {
    // express 默认状态码即 200；controller 不显式 status() 直接 json() 时应为 200
    statusCode: 200,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

function mkReq(extra: Record<string, unknown>): any {
  return { headers: {}, ip: '127.0.0.1', body: {}, params: {}, query: {}, ...extra };
}

/** 从 router.stack 中按 method+path 找路由中间件链（保持注册顺序） */
function findRoute(router: any, method: string, path: string): any[] | null {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods?.[method]) {
      return layer.route.stack.map((s: any) => s.handle);
    }
  }
  return null;
}

/** 顺序执行中间件链（含 async controller），返回最终 res */
async function runChain(handles: any[], req: any): Promise<any> {
  const res = makeRes();
  let idx = 0;
  const next = () => {
    if (idx < handles.length) {
      const h = handles[idx++];
      h(req, res, next);
    }
  };
  next();
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

async function expectThrows(fn: () => Promise<unknown>, expectedMessage?: string): Promise<Error> {
  try {
    await fn();
    const err: any = new Error('EXPECTED_THROW_BUT_RESOLVED');
    err.expectedMessage = expectedMessage;
    return err;
  } catch (e) {
    return e as Error;
  }
}

/* ============================================================
 * A. batchCreateOrders：快照先行 + createdIds 对应 + 撤销删除
 * ============================================================ */
async function sectionA(): Promise<void> {
  console.log('\n=== A. batchCreateOrders：快照先于写库 + 撤销删除新建行 ===');
  resetDb();
  state.takers.set('tk1', { id: 'tk1', wechatName: '张三', wechatId: 'zhangsan', totalOrders: 0, totalAmount: 0 });
  state.tasks.set('task1', { id: 'task1', productId: 'P1', productCode: 'PC1', status: 'active', currentOrders: 0, baseCommission: 5 });

  const rows = [
    { orderNo: 'A001', wechatName: '张三', productId: 'P1', actualPayment: 10 },
    { orderNo: 'A001', wechatName: '张三', productId: 'P1', actualPayment: 10 }, // 重复 → 跳过
  ];
  const result = await orderService.batchCreateOrders(rows);
  check('[A] success = 1（重复行跳过）', result.success, 1);
  check('[A] skipped = 1', result.skipped, 1);

  const snapIdx = state.callLog.indexOf('operationSnapshot.create');
  const firstCreateIdx = state.callLog.indexOf('order.create');
  check('[A] 快照在写库之前落库（operationSnapshot.create 先于 order.create）', snapIdx >= 0 && firstCreateIdx > snapIdx, true);

  check('[A] 只创建了一个快照', state.snapshots.length, 1);
  const snap = state.snapshots[0];
  check('[A] 快照 action = batch_create', snap.action, 'batch_create');
  check('[A] 快照 itemCount = 导入总行数 2', snap.itemCount, 2);
  const payload = JSON.parse(snap.payload);
  check('[A] 快照 payload.createdIds 共 2 个', payload.createdIds.length, 2);

  const createdOrders = [...state.orders.values()];
  check('[A] 实际落库订单 = 1 条', createdOrders.length, 1);
  check('[A] 落库订单 id 与快照 createdIds 一致', payload.createdIds.includes(createdOrders[0].id), true);
  check('[A] 任务 currentOrders 已 +1', state.tasks.get('task1').currentOrders, 1);
  check('[A] 接单人 totalOrders 已 +1', state.takers.get('tk1').totalOrders, 1);

  // 撤销：删除新建行 + 回退计数
  const undo = await orderService.undoLastBatch();
  check('[A] 撤销 action = batch_create', undo.action, 'batch_create');
  check('[A] 撤销 restored = 1（新建行被删除）', undo.restored, 1);
  check('[A] 撤销 failed = 0', undo.failed, 0);
  check('[A] 新建订单已从库中删除', state.orders.size, 0);
  check('[A] 任务 currentOrders 已回退到 0', state.tasks.get('task1').currentOrders, 0);
  check('[A] 接单人 totalOrders 已回退到 0', state.takers.get('tk1').totalOrders, 0);
  check('[A] 快照被标记为已消费', snap.consumed, true);
}

/* ============================================================
 * B. 快照创建失败 → 整个批量失败且订单未被修改
 * ============================================================ */
async function sectionB(): Promise<void> {
  console.log('\n=== B. 快照创建失败 → 整批失败、订单零修改 ===');
  resetDb();
  state.orders.set('o1', { id: 'o1', orderNo: 'B001', isRefunded: false, refundDate: null, isGoodReview: 'pending', reviewCommission: 0, reviewCommissionDate: null, totalRefund: 15, actualPayment: 10, baseCommission: 5, remark: null });
  state.orders.set('o2', { id: 'o2', orderNo: 'B002', isRefunded: false, refundDate: null, isGoodReview: 'pending', reviewCommission: 0, reviewCommissionDate: null, totalRefund: 15, actualPayment: 10, baseCommission: 5, remark: null });
  const snapshotOfDb = () => JSON.stringify([...state.orders.values()]);
  const beforeOrders = snapshotOfDb();

  state.snapshotCreateShouldFail = true;

  const err1 = await expectThrows(() => orderService.batchUpdateOrderStatus(['o1', 'o2'], 'isRefunded', true));
  check('[B] batchUpdateOrderStatus 整批失败', err1.message, 'SNAPSHOT_CREATE_FAILED(injected)');
  check('[B] 订单未被修改（isRefunded 仍为 false）', [state.orders.get('o1').isRefunded, state.orders.get('o2').isRefunded], [false, false]);
  check('[B] 快照表为空（失败事务不留半截快照）', state.snapshots.length, 0);
  check('[B] 订单数据逐字节未变', snapshotOfDb(), beforeOrders);

  const err2 = await expectThrows(() => orderService.batchCreateOrders([{ orderNo: 'B003' }]));
  check('[B] batchCreateOrders 整批失败', err2.message, 'SNAPSHOT_CREATE_FAILED(injected)');
  check('[B] 无订单被创建', state.orders.size, 2);
  check('[B] 无快照落库', state.snapshots.length, 0);

  const err3 = await expectThrows(() => orderService.batchUpdateOrders([{ orderNo: 'B001', remark: '试图修改' }]));
  check('[B] batchUpdateOrders 整批失败', err3.message, 'SNAPSHOT_CREATE_FAILED(injected)');
  check('[B] 订单 remark 未被修改', state.orders.get('o1').remark, null);
  check('[B] 订单数据逐字节未变（三次失败后）', snapshotOfDb(), beforeOrders);

  state.snapshotCreateShouldFail = false;
}

/* ============================================================
 * C. batchUpdateOrderStatus：快照先行 + 撤销精确还原
 * ============================================================ */
async function sectionC(): Promise<void> {
  console.log('\n=== C. batchUpdateOrderStatus：撤销后旧值精确还原 ===');
  resetDb();
  state.orders.set('o1', { id: 'o1', orderNo: 'C001', isRefunded: false, refundDate: null, isGoodReview: 'pending', isBaseCommissionRefunded: false, reviewCommission: 0, reviewCommissionDate: null, totalRefund: 15, actualPayment: 10, baseCommission: 5 });
  state.orders.set('o2', { id: 'o2', orderNo: 'C002', isRefunded: true, refundDate: new Date('2026-01-15T00:00:00Z'), isGoodReview: 'reviewed', isBaseCommissionRefunded: true, reviewCommission: 3, reviewCommissionDate: new Date('2026-01-16T00:00:00Z'), totalRefund: 18, actualPayment: 10, baseCommission: 5 });

  const updated = await orderService.batchUpdateOrderStatus(['o1', 'o2'], 'isRefunded', false);
  check('[C] 返回受影响行数 = 2', updated, 2);
  const snapIdx = state.callLog.indexOf('operationSnapshot.create');
  const firstUpdateIdx = state.callLog.indexOf('order.update');
  check('[C] 快照先于订单更新落库', snapIdx >= 0 && firstUpdateIdx > snapIdx, true);
  check('[C] 批量后两单均为未返款', [state.orders.get('o1').isRefunded, state.orders.get('o2').isRefunded], [false, false]);

  const undo = await orderService.undoLastBatch();
  check('[C] 撤销 action = batch_update_status', undo.action, 'batch_update_status');
  check('[C] 撤销 restored = 2', undo.restored, 2);
  check('[C] 撤销 failed = 0', undo.failed, 0);

  // 旧值精确还原：o2 原本是「已返款 + 好评 + 返佣3」，必须回到原值（不能被 o1 的新值污染）
  check('[C] o1.isRefunded 还原为 false', state.orders.get('o1').isRefunded, false);
  check('[C] o2.isRefunded 还原为 true', state.orders.get('o2').isRefunded, true);
  check('[C] o2.totalRefund 还原为 18', state.orders.get('o2').totalRefund, 18);
  check('[C] o2.reviewCommission 还原为 3', state.orders.get('o2').reviewCommission, 3);
  check('[C] o2.isGoodReview 还原为 reviewed', state.orders.get('o2').isGoodReview, 'reviewed');
  check('[C] o2.refundDate 还原为原时间', new Date(state.orders.get('o2').refundDate).getTime(), new Date('2026-01-15T00:00:00Z').getTime());
  check('[C] o1.refundDate 还原为 null', state.orders.get('o1').refundDate, null);
  check('[C] 快照已消费', state.snapshots[0].consumed, true);
}

/* ============================================================
 * D. batchUpdateOrders：快照先行 + 撤销精确还原
 * ============================================================ */
async function sectionD(): Promise<void> {
  console.log('\n=== D. batchUpdateOrders：撤销后旧值精确还原 ===');
  resetDb();
  state.orders.set('o3', { id: 'o3', orderNo: 'D001', orderNo19: null, remark: null, actualPayment: 5, baseCommission: 5, reviewCommission: 0, totalRefund: 10, isRefunded: false });

  const result = await orderService.batchUpdateOrders([{ orderNo: 'D001', remark: '改过的备注', actualPayment: 99 }]);
  check('[D] success = 1', result.success, 1);
  check('[D] 批量后 remark 已修改', state.orders.get('o3').remark, '改过的备注');
  check('[D] 批量后 actualPayment = 99', state.orders.get('o3').actualPayment, 99);
  check('[D] 批量后 totalRefund 重算 = 104', state.orders.get('o3').totalRefund, 104);
  const snapIdx = state.callLog.indexOf('operationSnapshot.create');
  const updateIdx = state.callLog.indexOf('order.update');
  check('[D] 快照先于订单更新落库', snapIdx >= 0 && updateIdx > snapIdx, true);
  const payload = JSON.parse(state.snapshots[0].payload);
  check('[D] 快照 restores 含被改字段的旧值', payload.restores[0].before, { actualPayment: 5, remark: null, totalRefund: 10 });

  const undo = await orderService.undoLastBatch();
  check('[D] 撤销 restored = 1', undo.restored, 1);
  check('[D] 撤销后 remark 还原为 null', state.orders.get('o3').remark, null);
  check('[D] 撤销后 actualPayment 还原为 5', state.orders.get('o3').actualPayment, 5);
  check('[D] 撤销后 totalRefund 还原为 10', state.orders.get('o3').totalRefund, 10);
}

/* ============================================================
 * E. 幂等：同一快照不能撤销两次
 * ============================================================ */
async function sectionE(): Promise<void> {
  console.log('\n=== E. 幂等防护：同一快照不能撤销两次 ===');
  resetDb();
  state.orders.set('o4', { id: 'o4', orderNo: 'E001', isRefunded: false, refundDate: null, isGoodReview: 'pending', isBaseCommissionRefunded: false, reviewCommission: 0, reviewCommissionDate: null, totalRefund: 15, actualPayment: 10, baseCommission: 5 });

  await orderService.batchUpdateOrderStatus(['o4'], 'isRefunded', true);
  const first = await orderService.undoLastBatch();
  check('[E] 第一次撤销成功', first.restored, 1);

  const err = await expectThrows(() => orderService.undoLastBatch());
  check('[E] 第二次撤销被拒绝（NO_UNDOABLE_OPERATION）', err.message, 'NO_UNDOABLE_OPERATION');
  check('[E] 拒绝后订单未被再次改动（isRefunded 保持撤销后的 false）', state.orders.get('o4').isRefunded, false);

  // 并发抢占失败路径：updateMany 命中 0 行 → SNAPSHOT_ALREADY_CONSUMED
  state.orders.set('o5', { id: 'o5', orderNo: 'E002', isRefunded: false, refundDate: null, isGoodReview: 'pending', isBaseCommissionRefunded: false, reviewCommission: 0, reviewCommissionDate: null, totalRefund: 15, actualPayment: 10, baseCommission: 5 });
  await orderService.batchUpdateOrderStatus(['o5'], 'isRefunded', true);
  state.claimAlwaysZero = true;
  const err2 = await expectThrows(() => orderService.undoLastBatch());
  check('[E] 并发抢占 0 行 → SNAPSHOT_ALREADY_CONSUMED', err2.message, 'SNAPSHOT_ALREADY_CONSUMED');
  check('[E] 抢占失败时未改订单（isRefunded 保持 true）', state.orders.get('o5').isRefunded, true);
  state.claimAlwaysZero = false;
}

/* ============================================================
 * F. 路由与权限：/undo-last 注册顺序 + 无权限 403
 * ============================================================ */
async function sectionF(): Promise<void> {
  console.log('\n=== F. 路由：注册顺序 + 权限守卫 403 ===');
  resetDb();

  const postUndo = findRoute(ordersRouter, 'post', '/undo-last');
  const getUndo = findRoute(ordersRouter, 'get', '/undo-last');
  check('[F] POST /orders/undo-last 已注册', !!postUndo, true);
  check('[F] GET /orders/undo-last 已注册', !!getUndo, true);
  check('[F] POST /undo-last 为「权限中间件 + 业务 handler」两层', postUndo?.length, 2);
  check('[F] GET /undo-last 为「权限中间件 + 业务 handler」两层', getUndo?.length, 2);

  // 注册顺序：/undo-last 必须在 /:id 之前，否则会被当作 id
  const stackPaths = ordersRouter.stack.map((l: any) => l.route?.path);
  check('[F] GET /undo-last 注册在 GET /:id 之前', stackPaths.indexOf('/undo-last') < stackPaths.indexOf('/:id'), true);

  // 无编辑权限 → 403，且业务层零调用
  const res403 = await runChain(postUndo, mkReq({ userRole: 'user', userPermissions: {} }));
  check('[F] 无编辑权限 → 403', res403.statusCode, 403);
  check('[F] 403 响应 code = FORBIDDEN', res403.payload?.code, 'FORBIDDEN');
  check('[F] 403 时未触达业务层（无快照读取）', state.callLog.includes('operationSnapshot.findFirst'), false);

  const res403view = await runChain(getUndo, mkReq({ userRole: 'user', userPermissions: {} }));
  check('[F] 预览接口无查看权限 → 403', res403view.statusCode, 403);

  // admin 放行 → 走到业务层；无快照时 available:false
  const resAdmin = await runChain(getUndo, mkReq({ userRole: 'admin' }));
  check('[F] admin 预览 → 200', resAdmin.statusCode, 200);
  check('[F] 无快照时 available:false', resAdmin.payload?.data?.available, false);

  // 服务端 requireEditPermission / requireViewPermission 与 'orders' 模块绑定（真实中间件构造）
  const editMw = requireEditPermission('orders');
  const viewMw = requireViewPermission('orders');
  check('[F] 权限中间件工厂可构造（真实 auth 中间件）', typeof editMw === 'function' && typeof viewMw === 'function', true);

  // 端到端：admin 执行 POST /undo-last（无快照 → 400 NO_UNDOABLE_OPERATION，证明路由已接到业务层）
  const resNoop = await runChain(postUndo, mkReq({ userRole: 'admin' }));
  check('[F] admin 执行撤销（无快照）→ 400', resNoop.statusCode, 400);
  check('[F] 400 code = NO_UNDOABLE_OPERATION', resNoop.payload?.code, 'NO_UNDOABLE_OPERATION');
}

/* ============================================================
 * G. P2-8 batchCreateTasks 导入查重
 * ============================================================ */
async function sectionG(): Promise<void> {
  console.log('\n=== G. P2-8 任务批量导入查重 ===');
  resetDb();
  state.tasks.set('t-exist', { id: 't-exist', productId: 'P9', productCode: 'PC9', taoToken: 'TOKEN1', status: 'pending', currentOrders: 0 });

  const res = makeRes();
  await taskController.batchCreateTasks(
    mkReq({
      body: {
        tasks: [
          { productId: 'P9', taoToken: '' },                    // row2：商品ID与库内重复
          { productId: 'P10', taoToken: 'TOKEN1' },             // row3：淘口令与库内重复
          { productId: 'P11', taoToken: 'TOKEN2', deadline: '2026-03-01' }, // row4：OK
          { productId: 'P11', taoToken: 'TOKEN3' },             // row5：商品ID本文件内重复（第4行）
          { productId: 'P12', taoToken: 'TOKEN2' },             // row6：淘口令本文件内重复（第4行）
          { productId: 'P13', taoToken: '' },                   // row7：OK（空淘口令不判重）
          { productId: 'P14', taoToken: '' },                   // row8：OK（空淘口令可多条）
        ],
      },
    }),
    res
  );

  check('[G] HTTP 201', res.statusCode, 201);
  check('[G] 成功创建 3 个（P11/P13/P14）', res.payload?.data?.count, 3);
  check('[G] 跳过 4 条重复', res.payload?.data?.skipped, 4);
  const details = res.payload?.data?.details || [];
  check('[G] 跳过行为 Excel 行号 2/3/5/6', details.map((d: any) => d.row), [2, 3, 5, 6]);
  check('[G] row2 原因 = 商品ID已存在', details[0]?.reason, '商品ID已存在');
  check('[G] row3 原因 = 淘口令已存在', details[1]?.reason, '淘口令已存在');
  check('[G] row5 原因含「商品ID本文件内重复（第 4 行）」', details[2]?.reason, '商品ID本文件内重复（第 4 行已出现）');
  check('[G] row6 原因含「淘口令本文件内重复（第 4 行）」', details[3]?.reason, '淘口令本文件内重复（第 4 行已出现）');

  const created = [...state.tasks.values()].filter((t) => t.id !== 't-exist');
  check('[G] 库内新增任务 = 3', created.length, 3);
  const withEmptyToken = created.filter((t) => !t.taoToken);
  check('[G] 空淘口令的两条都被创建（不判重）', withEmptyToken.length, 2);
  check('[G] P11 的淘口令 = TOKEN2（非重复行正常落库）', created.find((t) => t.productId === 'P11')?.taoToken, 'TOKEN2');
  check('[G] message 含跳过提示', res.payload?.message, '成功创建3个任务，跳过4条重复');

  // 查重是「一次批量预查」，不是循环内逐行查库
  const findManyCalls = state.callLog.filter((c) => c === 'task.findMany').length;
  check('[G] 查重只做一次批量 findMany（无 N+1）', findManyCalls, 1);
}

/* ============================================================
 * H. P2-5 deadline 可空语义
 * ============================================================ */
async function sectionH(): Promise<void> {
  console.log('\n=== H. P2-5 deadline 可空：创建/更新全路径 ===');
  resetDb();

  // H1. createTask 不传 deadline → 落 null，不报错
  let res = makeRes();
  await taskController.createTask(mkReq({ body: { productId: 'PH1', productCode: 'PCH1', price: 10 } }), res);
  check('[H1] createTask 不传 deadline → 201', res.statusCode, 201);
  check('[H1] deadline 落 null', res.payload?.data?.deadline, null);

  // H2. createTask 显式传 deadline → 解析为 Date
  res = makeRes();
  await taskController.createTask(mkReq({ body: { productId: 'PH2', productCode: 'PCH2', deadline: '2026-06-01' } }), res);
  check('[H2] createTask 传 deadline → 201', res.statusCode, 201);
  check('[H2] deadline 解析为正确日期', new Date(res.payload?.data?.deadline).toISOString().slice(0, 10), '2026-06-01');

  // H3. updateTask 不传 deadline → 不覆盖（undefined）
  const created = [...state.tasks.values()].find((t) => t.productId === 'PH2');
  res = makeRes();
  await taskController.updateTask(mkReq({ params: { id: created.id }, body: { price: 20 } }), res);
  check('[H3] updateTask 不传 deadline → 200', res.statusCode, 200);
  check('[H3] 未传 deadline 保持原值', new Date(res.payload?.data?.deadline).toISOString().slice(0, 10), '2026-06-01');

  // H4. updateTask 传空串 → 清除为 null
  res = makeRes();
  await taskController.updateTask(mkReq({ params: { id: created.id }, body: { deadline: '' } }), res);
  check('[H4] updateTask 空串 deadline → 200', res.statusCode, 200);
  check('[H4] deadline 被清除为 null', res.payload?.data?.deadline, null);

  // H5. updateTask 传非法值 → 落 null（不报错、不写坏数据）
  res = makeRes();
  await taskController.updateTask(mkReq({ params: { id: created.id }, body: { deadline: '不是日期' } }), res);
  check('[H5] updateTask 非法 deadline → 200 不报错', res.statusCode, 200);
  check('[H5] 非法 deadline 落 null', res.payload?.data?.deadline, null);
}

/* ============================================================
 * 主流程
 * ============================================================ */
(async () => {
  try {
    await sectionA();
    await sectionB();
    await sectionC();
    await sectionD();
    await sectionE();
    await sectionF();
    await sectionG();
    await sectionH();
  } catch (e) {
    failed++;
    console.error(`\n  FAIL  测试主流程抛出未捕获异常: ${(e as Error).stack}`);
  }
  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})();
