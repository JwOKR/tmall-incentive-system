/**
 * dashboardFilter.test.ts —— 第6批 W1「Dashboard 筛选贯穿修复」回归测试
 *
 * 核心回归点：传入不同日期区间时，dailySummary / topTakers / pendingRefundCount 的
 * 查询 where 必须**跟着变**（修复前：dailySummary 恒近7天、topTakers 为接单人表历史
 * 累计值、pendingRefundCount 恒全量）。
 *
 * 覆盖：
 *   A. 传入日期区间：dailySummary findMany / topTakers groupBy / 待返款·待好评 count
 *      的 where.orderDate 与传入区间一致（跟随筛选）；
 *   B. 不同区间 → where 确实变化（核心回归）；
 *   C. 未传日期：dailySummary 保持「近7天」默认窗口（仅 gte 无 lte），label = '近7天'；
 *      待返款/待好评仍叠加默认「今日」dateFilter，label = '今日'；
 *   D. 口径：待返款 = 订单级 isRefunded: false（不掺 isBaseCommissionRefunded）；
 *      待好评 = isGoodReview: 'pending'（字符串比较，非真值判断）；
 *   E. 日汇总聚合语义：isGoodReview === 'reviewed' 才计入好评数（'creating' 真值字符串不计入）；
 *      isRefunded 为 true 才计入已返款（订单级）；
 *   F. topTakers 改为区间内真实订单聚合：groupBy by/where/take 正确，昵称回填、
 *      无接单人显示「未匹配」，totalOrders/totalAmount 来自区间聚合而非历史累计；
 *   G. 缓存：同参数命中缓存不再查库（cacheKey 含日期），不同参数各查各的。
 *
 * 手法：require.cache 预注入 fake prisma（同时注入 `\` 与 `/` 两种路径键）驱动**真实**
 * dashboardController；记录每次 prisma 调用的 model/action/args 供断言。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */

process.env.JWT_SECRET = 'dashboard-filter-test-secret';

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
 * 0. fake prisma（必须在 require 业务源码前注入）
 * ============================================================ */
const state: {
  recentOrders: any[];
  topTakersRaw: any[];
  takers: any[];
} = {
  recentOrders: [],
  topTakersRaw: [],
  takers: [],
};

const calls: { model: string; action: string; args: any }[] = [];
const resetCalls = () => { calls.length = 0; };

function makeAgg(): any {
  return { _count: 100, _sum: { actualPayment: 10000, totalRefund: 10500 } };
}

const fakePrisma: any = {
  order: {
    aggregate: async (args: any) => { calls.push({ model: 'order', action: 'aggregate', args }); return makeAgg(); },
    count: async (args: any) => { calls.push({ model: 'order', action: 'count', args }); return 0; },
    findMany: async (args: any) => { calls.push({ model: 'order', action: 'findMany', args }); return state.recentOrders; },
    groupBy: async (args: any) => { calls.push({ model: 'order', action: 'groupBy', args }); return state.topTakersRaw; },
  },
  orderTaker: {
    count: async (args: any) => { calls.push({ model: 'orderTaker', action: 'count', args }); return 3; },
    findMany: async (args: any) => { calls.push({ model: 'orderTaker', action: 'findMany', args }); return state.takers; },
  },
  task: {
    count: async (args: any) => { calls.push({ model: 'task', action: 'count', args }); return 2; },
  },
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

/* ============================================================
 * 1. 加载真实模块
 * ============================================================ */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDashboardStats } = require('../src/controllers/dashboardController');

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

/* ---------- 调用检索辅助 ---------- */
const findCalls = (model: string, action: string, pred?: (a: any) => boolean) =>
  calls.filter((c) => c.model === model && c.action === action && (!pred || pred(c.args)));

/** 日汇总 findMany（每次 stats 调用只发一次 findMany） */
const dailyFindArgs = () => findCalls('order', 'findMany')[0]?.args;
/** 接单人排行 groupBy */
const groupByArgs = () => findCalls('order', 'groupBy')[0]?.args;
/** 待返款 count：where 中含订单级 isRefunded */
const pendingRefundArgs = () =>
  findCalls('order', 'count', (a) => a?.where && 'isRefunded' in a.where)[0]?.args;
/** 待好评 count：where 中含 isGoodReview */
const pendingReviewArgs = () =>
  findCalls('order', 'count', (a) => a?.where && 'isGoodReview' in a.where)[0]?.args;
/** 筛选范围 count：仅 orderDate 条件的 count（带 lte，可区分于「今日」count） */
const rangeCountArgs = () =>
  findCalls('order', 'count', (a) => a?.where?.orderDate?.gte && a?.where?.orderDate?.lte)[0]?.args;

/** 与 controller 相同的日期边界构造，保证断言时间戳一致 */
function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

/* ============================================================
 * 2. 用例
 * ============================================================ */
(async () => {
  /* ---------- A. 传入日期区间：三项口径全部跟随 ---------- */
  console.log('\n=== A. 传入区间 2026-01-10 ~ 2026-01-20：三项口径跟随筛选 ===');
  resetCalls();
  state.recentOrders = [];
  state.topTakersRaw = [];
  state.takers = [];
  const resA = makeRes();
  await getDashboardStats({ query: { startDate: '2026-01-10', endDate: '2026-01-20' } } as any, resA);
  const dA = resA.payload?.data;

  const dailyA = dailyFindArgs();
  check('[A] success = true', resA.payload?.success, true);
  check('[A] 日汇总 where.orderDate.gte = 2026-01-10 00:00', dailyA?.where?.orderDate?.gte?.getTime(), startOfDay('2026-01-10').getTime());
  check('[A] 日汇总 where.orderDate.lte = 2026-01-20 23:59:59.999', dailyA?.where?.orderDate?.lte?.getTime(), endOfDay('2026-01-20').getTime());
  check('[A] 日汇总 select 含订单级 isRefunded / isGoodReview', [!!dailyA?.select?.isRefunded, !!dailyA?.select?.isGoodReview], [true, true]);
  check('[A] 日汇总 label = rangeLabel', dA?.dailySummaryLabel, '2026-01-10 至 2026-01-20');

  const groupA = groupByArgs();
  check('[A] topTakers groupBy.by = [takerId]', groupA?.by, ['takerId']);
  check('[A] topTakers groupBy.where.orderDate.gte 跟随区间', groupA?.where?.orderDate?.gte?.getTime(), startOfDay('2026-01-10').getTime());
  check('[A] topTakers groupBy.where.orderDate.lte 跟随区间', groupA?.where?.orderDate?.lte?.getTime(), endOfDay('2026-01-20').getTime());
  check('[A] topTakers groupBy.take = 5', groupA?.take, 5);
  check('[A] topTakers label = rangeLabel + 接单排行', dA?.topTakersLabel, '2026-01-10 至 2026-01-20接单排行');

  const prA = pendingRefundArgs();
  check('[A] 待返款 where.isRefunded = false（订单级）', prA?.where?.isRefunded, false);
  check('[A] 待返款 where.orderDate.gte 跟随区间', prA?.where?.orderDate?.gte?.getTime(), startOfDay('2026-01-10').getTime());
  check('[A] 待返款 where.orderDate.lte 跟随区间', prA?.where?.orderDate?.lte?.getTime(), endOfDay('2026-01-20').getTime());

  const pvA = pendingReviewArgs();
  check('[A] 待好评 where.isGoodReview = "pending"（字符串）', pvA?.where?.isGoodReview, 'pending');
  check('[A] 待好评 where.isGoodReview 是 string 而非布尔/数字', typeof pvA?.where?.isGoodReview, 'string');
  check('[A] 待好评 where.orderDate.gte 跟随区间', pvA?.where?.orderDate?.gte?.getTime(), startOfDay('2026-01-10').getTime());
  check('[A] 待好评 where.orderDate.lte 跟随区间', pvA?.where?.orderDate?.lte?.getTime(), endOfDay('2026-01-20').getTime());
  check('[A] 范围 count where 与区间一致', rangeCountArgs()?.where?.orderDate?.gte?.getTime(), startOfDay('2026-01-10').getTime());

  /* ---------- B. 不同区间 → where 确实变化（核心回归点）---------- */
  console.log('\n=== B. 换区间 2025-06-01 ~ 2025-06-30：where 跟着变 ===');
  const gteA = dailyA?.where?.orderDate?.gte?.getTime();
  resetCalls();
  state.recentOrders = [];
  state.topTakersRaw = [];
  const resB = makeRes();
  await getDashboardStats({ query: { startDate: '2025-06-01', endDate: '2025-06-30' } } as any, resB);
  const dailyB = dailyFindArgs();
  const gteB = dailyB?.where?.orderDate?.gte?.getTime();
  check('[B] 日汇总 gte 随区间变化', gteA !== gteB, true);
  check('[B] 日汇总 gte = 2025-06-01 00:00', gteB, startOfDay('2025-06-01').getTime());
  check('[B] 日汇总 lte = 2025-06-30 23:59:59.999', dailyB?.where?.orderDate?.lte?.getTime(), endOfDay('2025-06-30').getTime());
  const prB = pendingRefundArgs();
  check('[B] 待返款 gte 同步变化', prB?.where?.orderDate?.gte?.getTime(), startOfDay('2025-06-01').getTime());
  check('[B] 待返款 gte ≠ 上一区间', prB?.where?.orderDate?.gte?.getTime() === gteA, false);
  const groupB = groupByArgs();
  check('[B] topTakers groupBy.gte 同步变化', groupB?.where?.orderDate?.gte?.getTime(), startOfDay('2025-06-01').getTime());
  check('[B] label 随区间变化', resB.payload?.data?.dailySummaryLabel, '2025-06-01 至 2025-06-30');

  /* ---------- C. 未传日期：近7天默认窗口 + 「今日」待办口径 ---------- */
  console.log('\n=== C. 未传日期：近7天窗口 + 今日待办 ===');
  resetCalls();
  state.recentOrders = [];
  state.topTakersRaw = [];
  const resC = makeRes();
  await getDashboardStats({ query: {} } as any, resC);
  const dailyC = dailyFindArgs();
  const expected7 = new Date();
  expected7.setDate(expected7.getDate() - 7);
  expected7.setHours(0, 0, 0, 0);
  check('[C] 日汇总保持近7天窗口：gte ≈ 7天前', Math.abs(dailyC?.where?.orderDate?.gte?.getTime() - expected7.getTime()) < 5000, true);
  check('[C] 日汇总近7天窗口：无 lte', 'lte' in (dailyC?.where?.orderDate ?? {}), false);
  check('[C] 日汇总 label = 近7天', resC.payload?.data?.dailySummaryLabel, '近7天');
  const prC = pendingRefundArgs();
  // 与 controller 相同的构造：本地 new Date() + setHours(0,0,0,0)（不要经 toISOString 往返，UTC+8 深夜会差一天）
  const expectedToday = new Date();
  expectedToday.setHours(0, 0, 0, 0);
  check('[C] 待返款叠加默认「今日」orderDate（gte = 今天 00:00）', prC?.where?.orderDate?.gte?.getTime(), expectedToday.getTime());
  check('[C] 待返款仍为订单级 isRefunded = false', prC?.where?.isRefunded, false);
  check('[C] topTakers label = 今日接单排行', resC.payload?.data?.topTakersLabel, '今日接单排行');
  const pvC = pendingReviewArgs();
  check('[C] 待好评默认「今日」+ 字符串 pending', [typeof pvC?.where?.isGoodReview, pvC?.where?.isGoodReview], ['string', 'pending']);

  /* ---------- D. 口径：不掺 isBaseCommissionRefunded / 不真值判断 ---------- */
  console.log('\n=== D. 口径专项 ===');
  const allCountWheres = findCalls('order', 'count').map((c) => JSON.stringify(c.args?.where || {}));
  check('[D] 任何 count 查询都不含 isBaseCommissionRefunded', allCountWheres.some((w) => w.includes('isBaseCommissionRefunded')), false);
  const dailyWheres = findCalls('order', 'findMany').map((c) => JSON.stringify(c.args?.where || {}));
  check('[D] findMany 查询不含 isBaseCommissionRefunded', dailyWheres.some((w) => w.includes('isBaseCommissionRefunded')), false);
  check('[D] 所有 isGoodReview 条件均为字符串 "pending"（无 true/1）', findCalls('order', 'count')
    .filter((c) => 'isGoodReview' in (c.args?.where ?? {}))
    .every((c) => c.args.where.isGoodReview === 'pending'), true);

  /* ---------- E. 日汇总聚合语义（reviewed 才计好评 / 订单级返款）---------- */
  console.log('\n=== E. 日汇总聚合语义 ===');
  resetCalls();
  // 2026-03-10 两单：reviewed(+1) + creating(真值字符串，不得计入好评)；2026-03-11 一单 pending
  state.recentOrders = [
    { orderDate: new Date('2026-03-10T10:00:00'), totalRefund: 108, isRefunded: true, isGoodReview: 'reviewed' },
    { orderDate: new Date('2026-03-10T11:00:00'), totalRefund: 50, isRefunded: false, isGoodReview: 'creating' },
    { orderDate: new Date('2026-03-11T09:00:00'), totalRefund: 55, isRefunded: false, isGoodReview: 'pending' },
  ];
  state.topTakersRaw = [];
  const resE = makeRes();
  await getDashboardStats({ query: { startDate: '2026-03-01', endDate: '2026-03-31' } } as any, resE);
  const dailyE = resE.payload?.data?.dailySummary || [];
  const d0310 = dailyE.find((x: any) => x.date === '2026-03-10');
  const d0311 = dailyE.find((x: any) => x.date === '2026-03-11');
  check('[E] 2026-03-10 订单数 = 2', d0310?.orderCount, 2);
  check('[E] 2026-03-10 好评数 = 1（reviewed 才计入，creating 不计入）', d0310?.goodReviewCount, 1);
  check('[E] 2026-03-10 已返款 = 1（订单级 isRefunded=true）', d0310?.refundedCount, 1);
  check('[E] 2026-03-10 待返款 = 1', d0310?.pendingCount, 1);
  check('[E] 2026-03-10 返款总额 = 158（SUM totalRefund 库口径）', d0310?.totalRefund, 158);
  check('[E] 2026-03-11 好评数 = 0（pending 不计入）', d0311?.goodReviewCount, 0);
  check('[E] 日汇总按日期倒序', dailyE.map((x: any) => x.date), ['2026-03-11', '2026-03-10']);

  /* ---------- F. topTakers = 区间真实订单聚合 + 昵称回填 ---------- */
  console.log('\n=== F. topTakers 区间聚合语义 ===');
  resetCalls();
  state.recentOrders = [];
  state.topTakersRaw = [
    { takerId: 't1', _count: { _all: 6 }, _sum: { actualPayment: 600 } },
    { takerId: null, _count: { _all: 2 }, _sum: { actualPayment: 100 } },
  ];
  state.takers = [{ id: 't1', wechatName: '张三', wechatId: 'zs' }];
  const resF = makeRes();
  await getDashboardStats({ query: { startDate: '2024-05-01', endDate: '2024-05-31' } } as any, resF);
  const topF = resF.payload?.data?.topTakers || [];
  const nameLookup = findCalls('orderTaker', 'findMany', (a) => 'id' in (a?.where ?? {}))[0]?.args;
  check('[F] 昵称回填查询 where.id.in = [t1]', nameLookup?.where?.id?.in, ['t1']);
  check('[F] 第1名 = t1 / 张三 / zs', [topF[0]?.id, topF[0]?.wechatName, topF[0]?.wechatId], ['t1', '张三', 'zs']);
  check('[F] 第1名 totalOrders 来自区间聚合 = 6', topF[0]?.totalOrders, 6);
  check('[F] 第1名 totalAmount 来自区间聚合 = 600', topF[0]?.totalAmount, 600);
  check('[F] 无接单人 → unknown / 未匹配', [topF[1]?.id, topF[1]?.wechatName, topF[1]?.wechatId], ['unknown', '未匹配', '']);
  check('[F] 无接单人订单数 = 2', topF[1]?.totalOrders, 2);
  check('[F] topTakers 不再来自接单人表历史累计（orderTaker.findMany 无 orderBy totalOrders）',
    findCalls('orderTaker', 'findMany').every((c) => !c.args?.orderBy?.totalOrders), true);

  /* ---------- G. 缓存：同参命中不查库，异参各查各 ---------- */
  console.log('\n=== G. 缓存按日期参数隔离 ===');
  resetCalls();
  const resG = makeRes();
  await getDashboardStats({ query: { startDate: '2026-01-10', endDate: '2026-01-20' } } as any, resG);
  check('[G] 同参数命中缓存：不再发起任何 prisma 调用', calls.length, 0);
  check('[G] 缓存数据与首次一致', resG.payload?.data?.dailySummaryLabel, '2026-01-10 至 2026-01-20');
  resetCalls();
  const resG2 = makeRes();
  await getDashboardStats({ query: { startDate: '2027-01-01', endDate: '2027-01-31' } } as any, resG2);
  check('[G] 不同参数穿透缓存：重新查库', calls.length > 0, true);
  check('[G] 新区间 label 正确', resG2.payload?.data?.dailySummaryLabel, '2027-01-01 至 2027-01-31');

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
