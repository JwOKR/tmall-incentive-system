/**
 * anomalyReadOnly.test.ts —— 异常预警 GET 的「只读性」与「检测方向」回归测试
 *
 * 覆盖第 4 批项 1/2 的后端改造：
 *   A. 只读性：getAnomalies（GET）**不得有任何写副作用**。
 *      手法：把 fake prisma 的所有写方法（order/orderTaker/task 的 create/update/delete/upsert、
 *      以及 $transaction / $executeRaw* ）全部替换为「记录调用名 + throw」。若 GET 仍写库，
 *      测试会捕获到具体方法名。
 *   B. 零裸 SQL + 零写：`$queryRawUnsafe` / `$queryRaw` 调用次数必须为 0；
 *      `$executeRaw*` / `$transaction` / 所有 model 写方法均不得被调用。
 *   C. 双单号查询「按 where 形状定位」（非按调用次数）：
 *      在所有被记录的 order.count / order.findMany 调用里，where 匹配
 *      `{ AND: [ {OR:[{orderNo:null},{orderNo:''}]}, {OR:[{orderNo19:null},{orderNo19:''}]} ] }`
 *      （双单号全空 = 无法对账的废单）的查询必须**恰 1 次**，且该 count 与 findMany
 *      使用**同一个 where**、`take === 50`、`orderBy.orderDate === 'desc'`。
 *      （注：第 5 批 A3 起 controller 会对 order 发起多次受限查询，故不再断言「总共 1 次」。）
 *   D. 计数与展示分离：summary.missingOrderNo 来自 `count`，不等于展示数组长度。
 *   E. staleTakerList 的 createdAt 兜底口径（与 bootstrap.autoCheckAnomalies 一致）：
 *      从未接单的活跃接单人以其注册时间为最后一次活动。
 *   F. 无静默降级：GET 的 scanErrors 必须为空 —— 保证新增的 5 类检测在测试环境里**真的执行**过，
 *      而不是因「假 prisma 缺方法」被跳过而假绿。
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

// 「双单号皆空」的权威 where 形状。fake 仅对这一形状的 order.findMany 返回样例数据，
// 对新增检测的其它受限查询返回空 —— 避免样例数据污染其它检测的口径。
const DOUBLE_NULL_WHERE = {
  AND: [
    { OR: [{ orderNo: null }, { orderNo: '' }] },
    { OR: [{ orderNo19: null }, { orderNo19: '' }] },
  ],
};
function isDoubleNullWhere(w: unknown): boolean {
  return JSON.stringify(w) === JSON.stringify(DOUBLE_NULL_WHERE);
}

/**
 * 按「超期任务」的真实 where 形状过滤候选任务 —— 让 F 段测试**行为化**：
 * controller 传下来的 where 会真正驱动本过滤器，若口径写错（边界/终态过滤），结果即错。
 */
function matchesOverdueWhere(t: any, where: any): boolean {
  const d = t?.deadline;
  if (!d) return false; // deadline 为 null → 不命中（无截止日无法判超期）
  const lt = where?.deadline?.lt;
  if (!(lt && new Date(d).getTime() < new Date(lt).getTime())) return false; // 当天不算超期
  const notIn = where?.status?.notIn;
  if (Array.isArray(notIn) && notIn.includes(t.status)) return false; // 终态不判超期
  return true;
}

/** 构造「本地日历日」偏移的 Date（避免 UTC 跨日：一律走本地 setHours/setDate） */
function localDayAt(dayOffset: number, h = 0, mi = 0, s = 0, ms = 0): Date {
  const d = new Date();
  d.setHours(h, mi, s, ms);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

const state: {
  writeAttempts: string[];
  queryRawUnsafeCalls: number;
  queryRawCalls: number;
  executeRawCalls: number;
  transactionCalls: number;
  countCalls: number;
  countWhere: any;
  countArgsList: any[];
  orderFindManyCalls: number;
  orderFindManyArgs: any;
  findManyArgsList: any[];
  takersFindManyArgs: any;
  countResult: number;
  ordersResult: any[];
  takersResult: any[];
  overdueCandidates: any[];
  taskCountArgsList: any[];
  taskFindManyArgsList: any[];
} = {
  writeAttempts: [],
  queryRawUnsafeCalls: 0,
  queryRawCalls: 0,
  executeRawCalls: 0,
  transactionCalls: 0,
  countCalls: 0,
  countWhere: null,
  countArgsList: [],
  orderFindManyCalls: 0,
  orderFindManyArgs: null,
  findManyArgsList: [],
  takersFindManyArgs: null,
  countResult: 3,
  ordersResult: [],
  takersResult: [],
  overdueCandidates: [],
  taskCountArgsList: [],
  taskFindManyArgsList: [],
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
      state.countArgsList.push(args);
      return state.countResult;
    },
    findMany: async (args: any) => {
      state.orderFindManyCalls++;
      state.orderFindManyArgs = args;
      state.findManyArgsList.push(args);
      // 仅「双单号皆空」查询返回样例数据；新增检测的其它查询一律返回空
      return isDoubleNullWhere(args?.where) ? state.ordersResult : [];
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
  // 任务 delegate：第 5 批 A3 新增「任务超限」检测会读取 task；第 8 批 A 新增「超期任务」检测
  // 会读取 task.count + task.findMany（where 含 deadline 过滤）。
  // 必须显式实现（返回受控样例），不得让检测因「缺少方法」被静默降级 —— 那会造成假绿。
  task: {
    findMany: async (args: any) => {
      state.taskFindManyArgsList.push(args);
      // 仅「超期任务」查询（where 含 deadline 过滤）返回按 where 过滤后的样例；其余（任务超限）返回空
      if (args?.where?.deadline) {
        return state.overdueCandidates
          .filter((c: any) => matchesOverdueWhere(c, args.where))
          .slice(0, args?.take);
      }
      return [];
    },
    count: async (args: any) => {
      state.taskCountArgsList.push(args);
      if (args?.where?.deadline) {
        return state.overdueCandidates.filter((c: any) => matchesOverdueWhere(c, args.where)).length;
      }
      return 0;
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
  state.executeRawCalls = 0;
  state.transactionCalls = 0;
  state.countCalls = 0;
  state.countArgsList = [];
  state.orderFindManyCalls = 0;
  state.findManyArgsList = [];
  state.taskCountArgsList = [];
  state.taskFindManyArgsList = [];
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

  /* ---------- B. 死检测已移除 + 零写 + 按 where 形状定位双单号查询 ---------- */
  console.log('\n=== B. 零裸 SQL / 零写 / 按形状定位双单号查询 ===');
  check('[B] $queryRawUnsafe 调用次数 = 0', state.queryRawUnsafeCalls, 0);
  check('[B] $queryRaw 调用次数 = 0', state.queryRawCalls, 0);
  check('[B] $executeRaw / $executeRawUnsafe 未被调用',
    [state.writeAttempts.includes('$executeRaw'), state.writeAttempts.includes('$executeRawUnsafe')],
    [false, false]);
  check('[B] $transaction 未被调用（GET 内无事务/写）', state.writeAttempts.includes('$transaction'), false);
  check('[B] 零写操作（order/orderTaker/task 的 create/update/upsert/delete 等均未被调用）', state.writeAttempts, []);
  // 说明：第 5 批 A3 新增 5 类检测后，controller 会对 order 发起多次 findMany/count。
  // 真实不变量不是「全 controller 只调用 1 次」（那是只有一个检测时的历史快照），而是
  // 「双单号全空这一 where 形状的查询恰 1 次，且其 count 与 findMany 用同一个 where」。
  // 故此处按 where 形状定位，而非按调用次数。
  const expectedWhere = DOUBLE_NULL_WHERE;
  const doubleNullCountCalls = state.countArgsList.filter((a: any) => isDoubleNullWhere(a?.where));
  const doubleNullFindManyCalls = state.findManyArgsList.filter((a: any) => isDoubleNullWhere(a?.where));
  check('[B] 「双单号皆空」形状的 order.count 恰 1 次', doubleNullCountCalls.length, 1);
  check('[B] 「双单号皆空」形状的 order.findMany 恰 1 次', doubleNullFindManyCalls.length, 1);
  check('[B] 无检测因环境缺方法被降级（scanErrors 为空）', resA.payload?.data?.scanErrors, []);

  /* ---------- C. 新检测方向正确 ---------- */
  console.log('\n=== C. 双单号全空检测 where 结构（按形状定位） ===');
  const dnc = doubleNullCountCalls[0];
  const dnf = doubleNullFindManyCalls[0];
  check('[C] 双单号 count.where 结构正确', dnc?.where, expectedWhere);
  check('[C] 双单号 findMany.where 结构正确', dnf?.where, expectedWhere);
  check('[C] 双单号 count 与 findMany 用同一个 where（深比较相等）',
    JSON.stringify(dnc?.where), JSON.stringify(dnf?.where));
  check('[C] 两个 OR 分别针对 orderNo / orderNo19 的 null 与空串',
    [dnc?.where?.AND?.[0]?.OR, dnc?.where?.AND?.[1]?.OR],
    [[{ orderNo: null }, { orderNo: '' }], [{ orderNo19: null }, { orderNo19: '' }]]);
  check('[C] 双单号 findMany take = 50（仅取最近 50 条展示）', dnf?.take, 50);
  check('[C] 双单号 findMany orderBy = orderDate desc', dnf?.orderBy, { orderDate: 'desc' });

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

  /* ---------- F. 超期任务（Task.deadline 接入异常页）---------- */
  console.log('\n=== F. 超期任务检测（deadline 口径 + count/findMany 同 where）===');
  // 隔离环境：其余检测全部置空，只留「超期任务」候选
  state.countResult = 0; // 双单号
  state.ordersResult = [];
  state.takersResult = []; // 超长间隔接单人
  state.overdueCandidates = [
    // ① 有 deadline 且已过期（3 天前）且未完成（active）→ 命中
    { id: 'od1', productId: 'p1', productCode: 'P001', deadline: localDayAt(-3), status: 'active', currentOrders: 1, maxOrders: 3 },
    // ② deadline 为 null → 不命中
    { id: 'od2', productId: 'p2', productCode: 'P002', deadline: null, status: 'active', currentOrders: 1, maxOrders: 3 },
    // ③ 已完成（completed）但 deadline 已过期 → 不命中（终态）
    { id: 'od3', productId: 'p3', productCode: 'P003', deadline: localDayAt(-3), status: 'completed', currentOrders: 3, maxOrders: 3 },
    // ④ deadline 在将来（3 天后）→ 不命中
    { id: 'od4', productId: 'p4', productCode: 'P004', deadline: localDayAt(3), status: 'active', currentOrders: 0, maxOrders: 3 },
    // ⑤a 日边界：deadline 恰为「今天」最后一刻 → 不命中（当天不算超期）
    { id: 'od5', productId: 'p5', productCode: 'P005', deadline: localDayAt(0, 23, 59, 59, 999), status: 'active', currentOrders: 0, maxOrders: 3 },
    // ⑤b 日边界：deadline 恰为「今天」第一刻（本地 00:00）→ 不命中
    { id: 'od6', productId: 'p6', productCode: 'P006', deadline: localDayAt(0, 0, 0, 0, 0), status: 'active', currentOrders: 0, maxOrders: 3 },
    // ⑤c 日边界：昨天最后一刻 → 命中（只有严格早于今天才算超期）
    { id: 'od7', productId: 'p7', productCode: 'P007', deadline: localDayAt(-1, 23, 59, 59, 999), status: 'active', currentOrders: 0, maxOrders: 3 },
    // ⑥ 已取消（cancelled）且已过期 → 不命中（终态）
    { id: 'od8', productId: 'p8', productCode: 'P008', deadline: localDayAt(-3), status: 'cancelled', currentOrders: 0, maxOrders: 3 },
  ];
  const resF = await runGetAnomalies();
  const pF = resF.payload?.data;
  check('[F] GET 仍无写副作用（纯只读）', state.writeAttempts, []);
  check('[F] 零裸 SQL', [state.queryRawUnsafeCalls, state.queryRawCalls], [0, 0]);
  check('[F] 无检测因环境缺方法被降级（scanErrors 为空）', pF?.scanErrors, []);

  // ① 命中 + ②③④⑤⑥ 不命中（行为化：由 controller 真实下发的 where 驱动过滤）
  check('[F①] 有 deadline 且已过期且未完成 → 命中',
    pF?.overdueTasks?.map((t: any) => t.id).sort(), ['od1', 'od7']);
  check('[F②] deadline 为 null → 不命中', pF?.overdueTasks?.some((t: any) => t.id === 'od2'), false);
  check('[F③] 已完成（completed）但已过期 → 不命中', pF?.overdueTasks?.some((t: any) => t.id === 'od3'), false);
  check('[F④] deadline 在将来 → 不命中', pF?.overdueTasks?.some((t: any) => t.id === 'od4'), false);
  check('[F⑤-a] deadline 为「今天最后一刻」→ 不命中（当天不算超期）', pF?.overdueTasks?.some((t: any) => t.id === 'od5'), false);
  check('[F⑤-b] deadline 为「今天第一刻」→ 不命中', pF?.overdueTasks?.some((t: any) => t.id === 'od6'), false);
  check('[F⑤-c] deadline 为「昨天最后一刻」→ 命中', pF?.overdueTasks?.some((t: any) => t.id === 'od7'), true);
  check('[F⑥c] 已取消（cancelled）且已过期 → 不命中', pF?.overdueTasks?.some((t: any) => t.id === 'od8'), false);

  check('[F] summary.overdueTask = 2（来自 count）', pF?.summary?.overdueTask, 2);
  check('[F] count 与展示数组同源（口径一致）', pF?.summary?.overdueTask, pF?.overdueTasks?.length);
  check('[F] daysOverdue：od1 = 3', pF?.overdueTasks?.find((t: any) => t.id === 'od1')?.daysOverdue, 3);
  check('[F] daysOverdue：od7 = 1', pF?.overdueTasks?.find((t: any) => t.id === 'od7')?.daysOverdue, 1);
  check('[F] deadline 以 ISO 字符串返回', typeof pF?.overdueTasks?.find((t: any) => t.id === 'od1')?.deadline, 'string');

  // ⑥ count 与 findMany 使用同一份 where（结构相同）
  const overdueCountArgs = state.taskCountArgsList.filter((a: any) => a?.where?.deadline);
  const overdueFindArgs = state.taskFindManyArgsList.filter((a: any) => a?.where?.deadline);
  check('[F⑥] 超期任务 count 恰 1 次', overdueCountArgs.length, 1);
  check('[F⑥] 超期任务 findMany 恰 1 次', overdueFindArgs.length, 1);
  check('[F⑥] count.where 结构正确（not null + lt + notIn）', overdueCountArgs[0]?.where, {
    deadline: { not: null, lt: overdueCountArgs[0]?.where?.deadline?.lt },
    status: { notIn: ['completed', 'cancelled'] },
  });
  check('[F⑥] count 与 findMany 用同一份 where（深比较相等）',
    JSON.stringify(overdueCountArgs[0]?.where), JSON.stringify(overdueFindArgs[0]?.where));
  check('[F⑥] where.deadline.not = null（显式排除空截止日）', overdueCountArgs[0]?.where?.deadline?.not, null);
  check('[F⑥] where.status.notIn = [completed, cancelled]（终态不判超期）',
    overdueCountArgs[0]?.where?.status?.notIn, ['completed', 'cancelled']);
  const ltBoundary = new Date(overdueCountArgs[0]?.where?.deadline?.lt);
  check('[F⑥] where.deadline.lt 归零到本地 00:00（时/分/秒/毫秒 = 0）',
    [ltBoundary.getHours(), ltBoundary.getMinutes(), ltBoundary.getSeconds(), ltBoundary.getMilliseconds()],
    [0, 0, 0, 0]);
  check('[F⑥] where.deadline.lt 的日历日 = 今天',
    [ltBoundary.getFullYear(), ltBoundary.getMonth(), ltBoundary.getDate()],
    [new Date().getFullYear(), new Date().getMonth(), new Date().getDate()]);
  check('[F⑥] findMany take = 200（限量）', overdueFindArgs[0]?.take, 200);
  check('[F⑥] findMany orderBy = { deadline: asc }', overdueFindArgs[0]?.orderBy, { deadline: 'asc' });
  check('[F⑦] scanNotes.overdueTask 为字符串（透明告知扫描窗口）', typeof pF?.scanNotes?.overdueTask, 'string');
  check('[F⑦] totalAnomalies 含超期数（= 0 + 2）', pF?.summary?.totalAnomalies, 2);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
