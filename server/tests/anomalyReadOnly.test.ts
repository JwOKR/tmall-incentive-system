/**
 * anomalyReadOnly.test.ts —— 异常预警 GET 的「只读性」与「检测方向」回归测试
 *
 * 覆盖第 4 批项 1/2 的后端改造：
 *   A. 只读性：getAnomalies（GET）**不得有任何写副作用**。
 *      手法：把 fake prisma 的所有写方法（order/orderTaker 的 create/update/delete/upsert、
 *      以及 $transaction / $executeRaw* ）全部替换为「记录调用名 + throw」。若 GET 仍写库，
 *      测试会捕获到具体方法名。
 *   B. 死检测已移除：`$queryRawUnsafe` / `$queryRaw` 调用次数必须为 0
 *      （原「重复订单号」聚合在 @unique 约束下永远是空，且每次白跑全表聚合）。
 *   C. 新检测方向正确：order.count / order.findMany 的 where 必须是
 *      `{ AND: [ {OR:[{orderNo:null},{orderNo:''}]}, {OR:[{orderNo19:null},{orderNo19:''}]} ] }`
 *      （双单号全空 = 无法对账的废单）。
 *   D. 计数与展示分离：summary.missingOrderNo 来自 `count`，不等于展示数组长度。
 *   E. staleTakerList 的 createdAt 兜底口径（与 bootstrap.autoCheckAnomalies 一致）：
 *      从未接单的活跃接单人以其注册时间为最后一次活动。
 *
 * 手法：require.cache 预注入 fake prisma（**同时注入 `\` 与 `/` 两种路径键**）驱动真实 controller。
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
 * 0. fake prisma（写方法一律 throw，读方法记录入参）
 * ============================================================ */
const DAY = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

const state: {
  writeAttempts: string[];
  queryRawUnsafeCalls: number;
  queryRawCalls: number;
  countCalls: number;
  countWhere: any;
  orderFindManyCalls: number;
  orderFindManyArgs: any;
  takersFindManyArgs: any;
  countResult: number;
  ordersResult: any[];
  takersResult: any[];
} = {
  writeAttempts: [],
  queryRawUnsafeCalls: 0,
  queryRawCalls: 0,
  countCalls: 0,
  countWhere: null,
  orderFindManyCalls: 0,
  orderFindManyArgs: null,
  takersFindManyArgs: null,
  countResult: 3,
  ordersResult: [],
  takersResult: [],
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
      state.countCalls++;
      state.countWhere = args?.where;
      return state.countResult;
    },
    findMany: async (args: any) => {
      state.orderFindManyCalls++;
      state.orderFindManyArgs = args;
      return state.ordersResult;
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
      state.takersFindManyArgs = args;
      return state.takersResult;
    },
    create: writeGuard('orderTaker.create'),
    update: writeGuard('orderTaker.update'),
    delete: writeGuard('orderTaker.delete'),
    upsert: writeGuard('orderTaker.upsert'),
    updateMany: writeGuard('orderTaker.updateMany'),
    deleteMany: writeGuard('orderTaker.deleteMany'),
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
  state.countCalls = 0;
  state.orderFindManyCalls = 0;
}

async function runGetAnomalies() {
  resetSpies();
  const res = makeRes();
  await getAnomalies({ query: {} } as any, res);
  return res;
}

/* ============================================================
 * 1. 用例
 * ============================================================ */
(async () => {
  const fixedOrderDate = new Date('2026-01-15T00:00:00.000Z');
  state.countResult = 3; // count 独立返回 3（与展示数组长度不同，用于验证「计数/展示分离」）
  state.ordersResult = [
    { id: 'o1', actualPayment: 100, orderDate: fixedOrderDate, taker: { wechatName: '张三', wechatId: 'wx1' } },
    { id: 'o2', actualPayment: 50, orderDate: fixedOrderDate, taker: null },
  ];

  /* ---------- A. 只读性 ---------- */
  console.log('\n=== A. GET 无写副作用 ===');
  // 先构造一个「有数据」的场景，确保正常走完整个函数
  state.takersResult = [
    { id: 'tOld', wechatName: '老王', wechatId: 'wx_old', createdAt: daysAgo(40), orders: [] },
  ];
  const resA = await runGetAnomalies();
  check('[A] GET 正常返回 success = true（未因写操作抛错回退 500）', resA.payload?.success, true);
  check('[A] 无任何写方法被调用（orderTaker.update 等）', state.writeAttempts, []);

  /* ---------- B. 死检测已移除 ---------- */
  console.log('\n=== B. $queryRawUnsafe 死检测已移除 ===');
  check('[B] $queryRawUnsafe 调用次数 = 0', state.queryRawUnsafeCalls, 0);
  check('[B] $queryRaw 调用次数 = 0', state.queryRawCalls, 0);
  check('[B] order.count 恰好调用 1 次', state.countCalls, 1);
  check('[B] order.findMany 恰好调用 1 次', state.orderFindManyCalls, 1);

  /* ---------- C. 新检测方向正确 ---------- */
  console.log('\n=== C. 双单号全空检测 where 结构 ===');
  const expectedWhere = {
    AND: [
      { OR: [{ orderNo: null }, { orderNo: '' }] },
      { OR: [{ orderNo19: null }, { orderNo19: '' }] },
    ],
  };
  check('[C] order.count.where 结构正确', state.countWhere, expectedWhere);
  check('[C] order.findMany.where 结构正确', state.orderFindManyArgs?.where, expectedWhere);
  check('[C] 两个 OR 分别针对 orderNo / orderNo19 的 null 与空串',
    [state.countWhere?.AND?.[0]?.OR, state.countWhere?.AND?.[1]?.OR],
    [[{ orderNo: null }, { orderNo: '' }], [{ orderNo19: null }, { orderNo19: '' }]]);
  check('[C] findMany take = 50（仅取最近 50 条展示）', state.orderFindManyArgs?.take, 50);
  check('[C] findMany orderBy = orderDate desc', state.orderFindManyArgs?.orderBy, { orderDate: 'desc' });

  /* ---------- D. 计数与展示分离 ---------- */
  console.log('\n=== D. 计数（count）与展示（数组）分离 ===');
  const pA = resA.payload?.data;
  check('[D] summary.missingOrderNo = 3（来自 count，非数组长度）', pA?.summary?.missingOrderNo, 3);
  check('[D] missingOrderNoOrders.length = 2（展示条数）', pA?.missingOrderNoOrders?.length, 2);
  check('[D] 订单映射：含接单人', pA?.missingOrderNoOrders?.[0],
    { id: 'o1', actualPayment: 100, orderDate: fixedOrderDate.toISOString(), wechatName: '张三', wechatId: 'wx1' });
  check('[D] 订单映射：无接单人时 wechatName/wechatId 为 null', pA?.missingOrderNoOrders?.[1],
    { id: 'o2', actualPayment: 50, orderDate: fixedOrderDate.toISOString(), wechatName: null, wechatId: null });

  /* ---------- E. staleTakerList 的 createdAt 兜底口径 ---------- */
  console.log('\n=== E. staleTakerList 的 createdAt 兜底（与 bootstrap 同口径）===');
  state.takersResult = [
    // 从未接单 + 注册 40 天前 → 纳入（createdAt 兜底），neverOrdered = true
    { id: 'tOld', wechatName: '老王', wechatId: 'wx_old', createdAt: daysAgo(40), orders: [] },
    // 从未接单 + 注册 5 天前 → 不纳入
    { id: 'tNew', wechatName: '小新', wechatId: 'wx_new', createdAt: daysAgo(5), orders: [] },
    // 有近期订单（2 天前）→ 不纳入
    { id: 'tAct', wechatName: '活跃', wechatId: 'wx_act', createdAt: daysAgo(100), orders: [{ orderDate: daysAgo(2) }] },
    // 有订单但已 20 天前 → 纳入，neverOrdered = false
    { id: 'tStale', wechatName: '老单', wechatId: 'wx_stale', createdAt: daysAgo(200), orders: [{ orderDate: daysAgo(20) }] },
  ];
  const resE = await runGetAnomalies();
  check('[E] GET 仍无写副作用', state.writeAttempts, []);
  const list = resE.payload?.data?.staleTakers || [];
  check('[E] 纳入 2 人（tOld / tStale）', list.length, 2);
  check('[E] 按距今天数降序', list.map((t: any) => t.id), ['tOld', 'tStale']);
  const tOld = list.find((t: any) => t.id === 'tOld');
  check('[E] 从未接单 → neverOrdered = true', tOld?.neverOrdered, true);
  check('[E] 从未接单 → lastOrderDate = null', tOld?.lastOrderDate, null);
  check('[E] 从未接单 → 以注册时间为准，daysSinceLastOrder = 40', tOld?.daysSinceLastOrder, 40);
  check('[E] 从未接单 → lastActivityAt 为 ISO 字符串', typeof tOld?.lastActivityAt, 'string');
  const tStale = list.find((t: any) => t.id === 'tStale');
  check('[E] 有订单 → neverOrdered = false', tStale?.neverOrdered, false);
  check('[E] 有订单 → daysSinceLastOrder = 20', tStale?.daysSinceLastOrder, 20);
  check('[E] summary.staleTakers = 2', resE.payload?.data?.summary?.staleTakers, 2);
  check('[E] summary.totalAnomalies = count(3) + 2 = 5', resE.payload?.data?.summary?.totalAnomalies, 5);
  check('[E] 旧的 autoInactivated / duplicateOrderNos 字段已移除',
    [
      'autoInactivated' in (resE.payload?.data?.summary ?? {}),
      'duplicateOrderNos' in (resE.payload?.data?.summary ?? {}),
      'duplicate19Nos' in (resE.payload?.data?.summary ?? {}),
    ],
    [false, false, false]);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
