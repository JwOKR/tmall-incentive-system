/**
 * anomalyTypes.test.ts —— 第 5 批 A3（P1-9）异常类型扩展回归测试
 *
 * 用「富」假 prisma（实现 controller 用到的**全部**方法：order.count / order.findMany /
 * orderTaker.findMany / task.findMany）驱动**真实** controller，对新增的 5 类检测各构造
 * 「命中」与「不命中」样例，并校验：
 *   1. 每类 count 与其展示数组长度**口径一致**（同 where / 同来源）；
 *   2. 全部限量生效（take 被正确传入）；
 *   3. summary.totalAnomalies === 所有类型计数之和；
 *   4. 原有字段仍在（summary.missingOrderNo / summary.staleTakers /
 *      data.missingOrderNoOrders / data.staleTakers）；
 *   5. 镜像只读断言：整个 controller 内零写操作、零裸 SQL（复用 anomalyReadOnly 的计数手法）；
 *   6. 判定公式正确（返款漂移口径 / 高频阈值 / 7 天间隔阈值 / 任务超限）；
 *   7. **不使用 groupBy**（回归防护：第 5 批返工已把订单扫描改回 order.findMany）；
 *   8. **可见降级**：某类检测失败时，scanErrors 结构化暴露，且不影响其它检测。
 *
 * 手法：require.cache 预注入假 prisma（**同时注入 `\` 与 `/` 两种路径键**）。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
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
 * 时间辅助
 * ============================================================ */
const DAY = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

/* ============================================================
 * 0. 富假 prisma
 * ============================================================ */
type FindKind = 'missing' | 'negative' | 'drift' | 'freq' | 'interval' | 'unknown';

/** 按 select 的字段特征区分 controller 的 5 条订单查询（controller 逐条使用不同 select） */
function findManyKind(select: any): FindKind {
  const keys = select ? Object.keys(select) : [];
  if (keys.includes('taker')) return 'missing'; // missingNo 带 taker 关系
  if (keys.includes('totalRefund')) return 'drift';
  if (keys.includes('productId')) return 'freq';
  if (keys.includes('actualPayment')) return 'negative';
  if (keys.includes('takerId')) return 'interval';
  return 'unknown';
}

const state: {
  writeAttempts: string[];
  queryRawUnsafeCalls: number;
  queryRawCalls: number;
  groupByCalls: number;
  findManyCalls: Array<{ kind: FindKind; take?: number; where?: any; orderBy?: any }>;
  countArgs: any;
  countResult: number;
  ordersResult: any[];
  takersResult: any[];
  takerLiteResult: any[];
  negativeRows: any[];
  refundRows: any[];
  freqRows: any[];
  intervalRows: any[];
  taskArgs: any;
  taskResult: any[];
  taskThrows: boolean;
  // 第 8 批 A：新增「超期任务」检测（task.count + task.findMany，where 含 deadline 过滤）
  overdueTaskResult: any[];
  overdueTaskCountResult: number;
  overdueFindManyArgs: any;
  taskCountArgs: any;
} = {
  writeAttempts: [],
  queryRawUnsafeCalls: 0,
  queryRawCalls: 0,
  groupByCalls: 0,
  findManyCalls: [],
  countArgs: null,
  countResult: 0,
  ordersResult: [],
  takersResult: [],
  takerLiteResult: [],
  negativeRows: [],
  refundRows: [],
  freqRows: [],
  intervalRows: [],
  taskArgs: null,
  taskResult: [],
  taskThrows: false,
  overdueTaskResult: [],
  overdueTaskCountResult: 0,
  overdueFindManyArgs: null,
  taskCountArgs: null,
};

function writeGuard(name: string) {
  return async () => {
    state.writeAttempts.push(name);
    throw new Error('WRITE DETECTED: ' + name);
  };
}

const fakePrisma: any = {
  order: {
    count: async (args: any) => {
      state.countArgs = args;
      return state.countResult;
    },
    findMany: async (args: any) => {
      const kind = findManyKind(args?.select);
      state.findManyCalls.push({ kind, take: args?.take, where: args?.where, orderBy: args?.orderBy });
      switch (kind) {
        case 'missing':
          return state.ordersResult;
        case 'negative':
          return state.negativeRows;
        case 'drift':
          return state.refundRows;
        case 'freq':
          return state.freqRows;
        case 'interval':
          return state.intervalRows;
        default:
          return [];
      }
    },
    // 回归防护：controller 不应再使用 groupBy（第 5 批返工已移除）
    groupBy: async () => {
      state.groupByCalls++;
      return [];
    },
    create: writeGuard('order.create'),
    update: writeGuard('order.update'),
    delete: writeGuard('order.delete'),
    upsert: writeGuard('order.upsert'),
    createMany: writeGuard('order.createMany'),
    updateMany: writeGuard('order.updateMany'),
    deleteMany: writeGuard('order.deleteMany'),
  },
  orderTaker: {
    findMany: async (args: any) => {
      // staleTakers 查询带 status: 'active'；接单人名称映射查询带 id: { in }
      if (args?.where?.status === 'active') return state.takersResult;
      return state.takerLiteResult;
    },
    create: writeGuard('orderTaker.create'),
    update: writeGuard('orderTaker.update'),
    delete: writeGuard('orderTaker.delete'),
    upsert: writeGuard('orderTaker.upsert'),
    updateMany: writeGuard('orderTaker.updateMany'),
    deleteMany: writeGuard('orderTaker.deleteMany'),
  },
  task: {
    findMany: async (args: any) => {
      // 「超期任务」查询（where 含 deadline 过滤）单独记录并返回受控样例；
      // 其余（任务超限）沿用 taskArgs / taskResult，保持既有断言口径不变。
      if (args?.where?.deadline) {
        state.overdueFindManyArgs = args;
        if (state.taskThrows) throw new Error('task query failed (injected)');
        return state.overdueTaskResult;
      }
      state.taskArgs = args;
      if (state.taskThrows) throw new Error('task query failed (injected)');
      return state.taskResult;
    },
    count: async (args: any) => {
      state.taskCountArgs = args;
      if (state.taskThrows) throw new Error('task query failed (injected)');
      return state.overdueTaskCountResult;
    },
    create: writeGuard('task.create'),
    update: writeGuard('task.update'),
    delete: writeGuard('task.delete'),
    updateMany: writeGuard('task.updateMany'),
    deleteMany: writeGuard('task.deleteMany'),
  },
  user: {
    findMany: async () => [],
    findUnique: async () => null,
    create: writeGuard('user.create'),
    update: writeGuard('user.update'),
    delete: writeGuard('user.delete'),
  },
  $queryRawUnsafe: async () => {
    state.queryRawUnsafeCalls++;
    return [];
  },
  $queryRaw: async () => {
    state.queryRawCalls++;
    return [];
  },
  $executeRawUnsafe: writeGuard('$executeRawUnsafe'),
  $executeRaw: writeGuard('$executeRaw'),
  $transaction: writeGuard('$transaction'),
};

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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAnomalies } = require('../src/controllers/anomalyController');

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

function resetSpies(): void {
  state.writeAttempts = [];
  state.queryRawUnsafeCalls = 0;
  state.queryRawCalls = 0;
  state.groupByCalls = 0;
  state.findManyCalls = [];
  state.countArgs = null;
  state.taskArgs = null;
}

async function runGetAnomalies() {
  resetSpies();
  const res = makeRes();
  await getAnomalies({ query: {} } as any, res);
  return res;
}

function takeOf(kind: FindKind): number | undefined {
  return state.findManyCalls.find(c => c.kind === kind)?.take;
}

/* ============================================================
 * 1. 用例
 * ============================================================ */
(async () => {
  /* ---------- 命中场景：7 类都有数据 ---------- */
  console.log('\n=== 命中场景：7 类检测均命中 ===');
  // 1. 双单号全空：count 5，展示 1 条（验证计数/展示分离）
  state.countResult = 5;
  state.ordersResult = [
    { id: 'miss1', actualPayment: 10, orderDate: daysAgo(1), taker: { wechatName: '张三', wechatId: 'wx1' } },
  ];
  // 2. 超长间隔接单人：1 人（40 天未接单）
  state.takersResult = [
    { id: 'tOld', wechatName: '老王', wechatId: 'wx_old', createdAt: daysAgo(40), orders: [] },
  ];
  // 3. 实付 ≤ 0：2 条
  state.negativeRows = [
    { id: 'neg1', actualPayment: -5, orderDate: daysAgo(2), takerId: 'tk1' },
    { id: 'neg2', actualPayment: 0, orderDate: daysAgo(3), takerId: null },
  ];
  // 4. totalRefund 漂移：bad1 漂移、ok1 正确
  state.refundRows = [
    { id: 'bad1', actualPayment: 100, baseCommission: 5, reviewCommission: 3, totalRefund: 999, orderDate: daysAgo(1), takerId: 'tk1' },
    { id: 'ok1', actualPayment: 100, baseCommission: 5, reviewCommission: 3, totalRefund: 108, orderDate: daysAgo(1), takerId: 'tk1' },
  ];
  // 5. 同人同商品高频：tk1/p1 共 4 单（命中）、tk2/p2 共 2 单（阈值 >2，不命中）
  state.freqRows = [
    { id: 'f1a', takerId: 'tk1', productId: 'p1', productCode: 'P001', orderDate: daysAgo(1) },
    { id: 'f1b', takerId: 'tk1', productId: 'p1', productCode: 'P001', orderDate: daysAgo(3) },
    { id: 'f1c', takerId: 'tk1', productId: 'p1', productCode: 'P001', orderDate: daysAgo(5) },
    { id: 'f1d', takerId: 'tk1', productId: 'p1', productCode: 'P001', orderDate: daysAgo(7) },
    { id: 'f2a', takerId: 'tk2', productId: 'p2', productCode: 'P002', orderDate: daysAgo(2) },
    { id: 'f2b', takerId: 'tk2', productId: 'p2', productCode: 'P002', orderDate: daysAgo(9) },
  ];
  // 6. 7 天间隔：tk1 相邻 5 天（命中）、tk2 相邻 10 天（不命中）
  state.intervalRows = [
    { id: 'i1', takerId: 'tk1', orderDate: daysAgo(20) },
    { id: 'i2', takerId: 'tk1', orderDate: daysAgo(15) },
    { id: 'i3', takerId: 'tk2', orderDate: daysAgo(30) },
    { id: 'i4', takerId: 'tk2', orderDate: daysAgo(20) },
  ];
  // 7. 任务超限：1 超限、1 正常
  state.taskResult = [
    { id: 'taskOver', productId: 'p1', productCode: 'P001', maxOrders: 3, currentOrders: 5, status: 'active' },
    { id: 'taskOk', productId: 'p2', productCode: 'P002', maxOrders: 3, currentOrders: 3, status: 'active' },
  ];
  // 接单人名称映射
  state.takerLiteResult = [
    { id: 'tk1', wechatName: '接单甲', wechatId: 'wx_tk1' },
    { id: 'tk2', wechatName: '接单乙', wechatId: 'wx_tk2' },
  ];
  state.taskThrows = false;

  const res = await runGetAnomalies();
  const p = res.payload?.data;
  const s = p?.summary;

  // —— 只读性 / 无 groupBy ——
  check('[只读] GET 正常返回 success = true', res.payload?.success, true);
  check('[只读] 无任何写方法被调用', state.writeAttempts, []);
  check('[只读] $queryRawUnsafe 调用次数 = 0', state.queryRawUnsafeCalls, 0);
  check('[只读] $queryRaw 调用次数 = 0', state.queryRawCalls, 0);
  check('[回归] controller 未使用 order.groupBy（已改回 findMany）', state.groupByCalls, 0);
  check('[可见降级] 全部检测正常时 scanErrors 为空', p?.scanErrors, []);

  // —— summary 计数 ——
  check('[计数] missingOrderNo = 5（来自 count）', s?.missingOrderNo, 5);
  check('[计数] staleTakers = 1', s?.staleTakers, 1);
  check('[计数] negativePayment = 2', s?.negativePayment, 2);
  check('[计数] refundMismatch = 1', s?.refundMismatch, 1);
  check('[计数] highFrequency = 1', s?.highFrequency, 1);
  check('[计数] intervalBypass = 1', s?.intervalBypass, 1);
  check('[计数] taskOverLimit = 1', s?.taskOverLimit, 1);
  check('[计数] totalAnomalies = 5+1+2+1+1+1+1 = 12（所有类型计数之和）', s?.totalAnomalies, 12);

  // —— 口径一致（count 与展示数组长度同源）——
  check('[口径] missingOrderNoOrders.length = 1（展示数，≠计数 5）', p?.missingOrderNoOrders?.length, 1);
  check('[口径] staleTakers.length = summary.staleTakers', p?.staleTakers?.length, s?.staleTakers);
  check('[口径] negativePaymentOrders.length = summary.negativePayment', p?.negativePaymentOrders?.length, s?.negativePayment);
  check('[口径] refundMismatchOrders.length = summary.refundMismatch', p?.refundMismatchOrders?.length, s?.refundMismatch);
  check('[口径] highFrequencyGroups.length = summary.highFrequency', p?.highFrequencyGroups?.length, s?.highFrequency);
  check('[口径] intervalBypassPairs.length = summary.intervalBypass', p?.intervalBypassPairs?.length, s?.intervalBypass);
  check('[口径] overLimitTasks.length = summary.taskOverLimit', p?.overLimitTasks?.length, s?.taskOverLimit);

  // —— 原有字段仍在 ——
  check('[兼容] summary.missingOrderNo 仍在', 'missingOrderNo' in (s ?? {}), true);
  check('[兼容] summary.staleTakers 仍在', 'staleTakers' in (s ?? {}), true);
  check('[兼容] data.missingOrderNoOrders 仍是数组', Array.isArray(p?.missingOrderNoOrders), true);
  check('[兼容] data.staleTakers 仍是数组', Array.isArray(p?.staleTakers), true);

  // —— 各类型判定公式 ——
  check('[实付≤0] 仅命中非正实付（neg1/neg2）', p?.negativePaymentOrders?.map((o: any) => o.id), ['neg1', 'neg2']);
  check('[漂移] 仅命中漂移单 bad1（ok1 不命中）', p?.refundMismatchOrders?.map((o: any) => o.id), ['bad1']);
  check('[漂移] expectedRefund = 100+5+3 = 108', p?.refundMismatchOrders?.[0]?.expectedRefund, 108);
  check('[漂移] diff = 999-108 = 891', p?.refundMismatchOrders?.[0]?.diff, 891);
  check('[高频] 仅命中次数 4 的分组（次数 2 不命中）', p?.highFrequencyGroups?.map((g: any) => g.productCode), ['P001']);
  check('[高频] 分组计数 = 4', p?.highFrequencyGroups?.[0]?.count, 4);
  check('[高频] 带出接单人昵称', p?.highFrequencyGroups?.[0]?.wechatName, '接单甲');
  check('[间隔] 仅命中 tk1 的 5 天相邻单（tk2 的 10 天不命中）', p?.intervalBypassPairs?.map((x: any) => x.takerId), ['tk1']);
  check('[间隔] gapDays = 5', p?.intervalBypassPairs?.[0]?.gapDays, 5);
  check('[间隔] 带出接单人昵称', p?.intervalBypassPairs?.[0]?.wechatName, '接单甲');
  check('[任务] 仅命中 currentOrders(5) > maxOrders(3)', p?.overLimitTasks?.map((t: any) => t.id), ['taskOver']);

  // —— 限量生效（take 正确传入）——
  check('[限量] missingNo findMany take = 50', takeOf('missing'), 50);
  check('[限量] 实付≤0 findMany take = 50', takeOf('negative'), 50);
  check('[限量] 返款漂移 findMany take = 200', takeOf('drift'), 200);
  check('[限量] 高频 findMany take = 500', takeOf('freq'), 500);
  check('[限量] 7天间隔 findMany take = 500', takeOf('interval'), 500);
  check('[限量] 任务 findMany take = 200', state.taskArgs?.take, 200);
  check('[限量] 所有订单查询都带 orderBy', state.findManyCalls.every(c => !!c.orderBy), true);

  // —— 扫描窗口说明（透明告知「仅扫描最近 N 条」）——
  check('[说明] scanNotes.refundMismatch 含「200」', /200/.test(p?.scanNotes?.refundMismatch ?? ''), true);
  check('[说明] scanNotes 覆盖 6 类新检测（第 8 批 A 增补 overdueTask）', Object.keys(p?.scanNotes ?? {}).sort(),
    ['highFrequency', 'intervalBypass', 'negativePayment', 'overdueTask', 'refundMismatch', 'taskOverLimit']);

  /* ---------- 可见降级：任务检测失败，但整体仍渲染 ---------- */
  console.log('\n=== 可见降级：任务检测失败 → scanErrors 暴露，其它检测不受影响 ===');
  state.taskThrows = true;
  const resDeg = await runGetAnomalies();
  check('[降级] 仍返回 success = true（不整体 500）', resDeg.payload?.success, true);
  check('[降级] scanErrors 含 taskOverLimit 与 overdueTask 各一条（两者同因 task 查询失败而降级）',
    resDeg.payload?.data?.scanErrors?.map((e: any) => e.type), ['taskOverLimit', 'overdueTask']);
  check('[降级] scanErrors 带可读 message', typeof resDeg.payload?.data?.scanErrors?.[0]?.message, 'string');
  check('[降级] 该类型计数归零（taskOverLimit = 0）', resDeg.payload?.data?.summary?.taskOverLimit, 0);
  check('[降级] 其它检测照常（negativePayment 仍 = 2）', resDeg.payload?.data?.summary?.negativePayment, 2);
  state.taskThrows = false;

  /* ---------- 不命中场景：全空 ---------- */
  console.log('\n=== 不命中场景：全部为空 ===');
  state.countResult = 0;
  state.ordersResult = [];
  state.takersResult = [];
  state.negativeRows = [];
  state.refundRows = [];
  state.freqRows = [];
  state.intervalRows = [];
  state.taskResult = [];
  state.takerLiteResult = [];

  const resEmpty = await runGetAnomalies();
  const sE = resEmpty.payload?.data?.summary;
  check('[空] success = true', resEmpty.payload?.success, true);
  check('[空] scanErrors 为空', resEmpty.payload?.data?.scanErrors, []);
  check('[空] totalAnomalies = 0', sE?.totalAnomalies, 0);
  check('[空] 各类型计数均为 0',
    [sE?.missingOrderNo, sE?.staleTakers, sE?.negativePayment, sE?.refundMismatch, sE?.highFrequency, sE?.intervalBypass, sE?.taskOverLimit],
    [0, 0, 0, 0, 0, 0, 0]);
  check('[空] 各展示数组均为空',
    [
      resEmpty.payload?.data?.missingOrderNoOrders?.length,
      resEmpty.payload?.data?.staleTakers?.length,
      resEmpty.payload?.data?.negativePaymentOrders?.length,
      resEmpty.payload?.data?.refundMismatchOrders?.length,
      resEmpty.payload?.data?.highFrequencyGroups?.length,
      resEmpty.payload?.data?.intervalBypassPairs?.length,
      resEmpty.payload?.data?.overLimitTasks?.length,
    ],
    [0, 0, 0, 0, 0, 0, 0]);
  check('[空] 仍无写副作用', state.writeAttempts, []);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
