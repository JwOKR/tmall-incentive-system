/**
 * secfixRegression.test.ts —— 三项安全 / 正确性修复的回归测试
 *
 *   A. 后端模块权限守卫补齐（backups→export / settings→settings / dashboard / logs /
 *      intervals / commissions / reminds→dashboard / anomalies），未授权用户必须 403。
 *   B. batchUpdateOrderStatus 的返款日期不再被「当前时间」静默覆盖：
 *      - 已存在 refundDate 的订单再次标记返款 → 日期保持不变；
 *      - 改回未返款 → refundDate = null；
 *      - isBaseCommissionRefunded 路径绝不写任何日期。
 *   C. takerDetail 好评统计改用 `=== 'reviewed'`（原真值判断把非空状态串全算成已好评）。
 *
 * 手法：沿用 baseCommissionRefund.test.ts —— 在加载业务源码前用 require.cache 预注入
 *       fake prisma（同时注入反斜杠 / 正斜杠两种路径键）与 fake logger（避免 import 时
 *       在磁盘建 logs/ 并注册文件 transport），随后驱动**真实**路由/控制器/服务。
 *
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */

process.env.JWT_SECRET = 'secfix-test-secret';

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
 * 0. fake prisma + fake logger（必须在 require 业务源码前注入）
 * ============================================================ */
const state: {
  batchOrders: any[];
  takerPagedOrders: any[];
  takerAllOrders: any[];
  takerCount: number;
  taker: any;
  orderUpdateArgs: any[];
  settingsUpsertCount: number;
  orderFindManyShapes: string[];
} = {
  batchOrders: [],
  takerPagedOrders: [],
  takerAllOrders: [],
  takerCount: 0,
  taker: null,
  orderUpdateArgs: [],
  settingsUpsertCount: 0,
  orderFindManyShapes: [],
};

const fakePrisma: any = {
  order: {
    findMany: async (args: any) => {
      if (args?.where?.id?.in) {
        state.orderFindManyShapes.push('batch');
        return state.batchOrders;
      }
      if (args?.take !== undefined || args?.skip !== undefined) {
        state.orderFindManyShapes.push('paged');
        return state.takerPagedOrders;
      }
      if (args?.select) {
        state.orderFindManyShapes.push('taker-all');
        return state.takerAllOrders;
      }
      state.orderFindManyShapes.push('plain');
      return [];
    },
    count: async () => state.takerCount,
    update: async (args: any) => {
      state.orderUpdateArgs.push(args);
      return { id: args?.where?.id };
    },
    findUnique: async () => null,
    findFirst: async () => null,
    create: async () => ({ id: 'x' }),
  },
  orderTaker: {
    findUnique: async () => state.taker,
    findMany: async () => [],
    findFirst: async () => null,
    update: async () => ({}),
    create: async () => ({ id: 'x' }),
  },
  user: { findMany: async () => [], findUnique: async () => null },
  task: { findMany: async () => [], findUnique: async () => null, findFirst: async () => null, update: async () => ({}) },
  log: { findMany: async () => [], create: async () => ({}) },
  repeatDiscount: { findMany: async () => [], findUnique: async () => null, create: async () => ({ id: 'x' }) },
  systemSetting: {
    findMany: async () => [],
    findUnique: async () => null,
    upsert: async () => {
      state.settingsUpsertCount++;
      return {};
    },
  },
  // P2-3 批量撤销（W4）：batchCreate/Update/UpdateStatus 现在会在同一事务里先写快照，fake 需提供该模型
  operationSnapshot: {
    create: async () => ({ id: 'snap-stub' }),
    findFirst: async () => null,
    updateMany: async () => ({ count: 1 }),
  },
  $transaction: async (arg: any) => {
    if (typeof arg === 'function') return arg(fakePrisma);
    return Promise.all(arg);
  },
  $use: () => { /* noop */ },
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
  require.cache[resolved.replace(/\\/g, '/')] = entry;
}

injectFake('../src/utils/db', { __esModule: true, default: fakePrisma });
injectFake('../src/utils/logger', {
  __esModule: true,
  default: { info() {}, warn() {}, error() {}, debug() {} },
});

/* ============================================================
 * 1. 加载真实模块（路由 / 控制器 / 服务）
 * ============================================================ */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const http = require('http');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const auth = require('../src/middleware/auth');
const authMiddleware = auth.authMiddleware;
const JWT_SECRET = auth.JWT_SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backupRouter = require('../src/routes/backups').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settingsRouter = require('../src/routes/settings').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dashboardRouter = require('../src/routes/dashboard').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const logsRouter = require('../src/routes/logs').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const intervalsRouter = require('../src/routes/intervals').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const commissionsRouter = require('../src/routes/commissions').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const remindsRouter = require('../src/routes/reminds').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const anomaliesRouter = require('../src/routes/anomalies').default;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderService = require('../src/services/orderService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const takerDetailController = require('../src/controllers/takerDetailController');

/* ============================================================
 * 2. 组装与生产一致的 express app（每个路由前缀均挂 authMiddleware）
 * ============================================================ */
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/backup', authMiddleware, backupRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/logs', authMiddleware, logsRouter);
app.use('/api/intervals', authMiddleware, intervalsRouter);
app.use('/api/commissions', authMiddleware, commissionsRouter);
app.use('/api/reminds', authMiddleware, remindsRouter);
app.use('/api/anomalies', authMiddleware, anomaliesRouter);

function token(payload: any): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const noPermToken = token({ userId: 'u-np', username: 'noperm', role: 'user', permissions: {} });
const exportViewerToken = token({
  userId: 'u-ev',
  username: 'exporter',
  role: 'user',
  permissions: { export: { view: true, edit: false } },
});
const adminToken = token({ userId: 'u-ad', username: 'admin', role: 'admin', permissions: {} });

async function req(port: number, method: string, path: string, headers: any, body?: any) {
  const init: any = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  let parsed: any = null;
  try { parsed = await r.json(); } catch { /* 非 JSON */ }
  return { status: r.status, body: parsed };
}

/* ============================================================
 * 3. 用例
 * ============================================================ */
(async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  /* ---------- A. 路由权限守卫 ---------- */
  console.log('\n=== A. 路由权限守卫（无权限用户应 403）===');

  const noPerm = { Authorization: `Bearer ${noPermToken}` };

  const guardCases: Array<[string, string, string, any?]> = [
    ['GET  /api/backup/export', 'GET', '/api/backup/export'],
    ['POST /api/backup/import', 'POST', '/api/backup/import', { data: {} }],
    ['PUT  /api/settings', 'PUT', '/api/settings', { settings: [{ key: 'review_commission_amount', value: '999' }] }],
    ['GET  /api/dashboard/stats', 'GET', '/api/dashboard/stats'],
    ['GET  /api/dashboard/incentive-summary', 'GET', '/api/dashboard/incentive-summary'],
    ['GET  /api/logs', 'GET', '/api/logs'],
    ['GET  /api/intervals', 'GET', '/api/intervals'],
    ['GET  /api/commissions', 'GET', '/api/commissions'],
    ['GET  /api/reminds', 'GET', '/api/reminds'],
    ['GET  /api/anomalies', 'GET', '/api/anomalies'],
  ];
  for (const [label, method, path, body] of guardCases) {
    const r = await req(port, method, path, noPerm, body);
    check(`[守卫] ${label} 无权限 → 403`, r.status, 403);
  }

  // settings PUT 的守卫必须在 body 校验之前拦截（否则会先返回 400）
  const guardNoBody = await req(port, 'PUT', '/api/settings', noPerm);
  check('[守卫] PUT /api/settings 无 body 无权限 → 403（先于 400）', guardNoBody.status, 403);

  // 未登录 → 401（authMiddleware）
  const anon = await req(port, 'GET', '/api/backup/export', {});
  check('[守卫] GET /api/backup/export 未登录 → 401', anon.status, 401);

  // 有 export.view 的普通用户 → 放行（200，导出真正执行）
  const ev = await req(port, 'GET', '/api/backup/export', { Authorization: `Bearer ${exportViewerToken}` });
  check('[守卫] GET /api/backup/export 有 export.view → 200（放行）', ev.status, 200);

  // 管理员 → 放行
  const admExport = await req(port, 'GET', '/api/backup/export', { Authorization: `Bearer ${adminToken}` });
  check('[守卫] GET /api/backup/export 管理员 → 200', admExport.status, 200);
  const admSettings = await req(port, 'PUT', '/api/settings', { Authorization: `Bearer ${adminToken}` }, { settings: [] });
  check('[守卫] PUT /api/settings 管理员 → 200', admSettings.status, 200);

  server.close();

  /* ---------- B. refundDate 不再被静默覆盖 ---------- */
  console.log('\n=== B. batchUpdateOrderStatus refundDate 口径 ===');
  const lastData = () => state.orderUpdateArgs[state.orderUpdateArgs.length - 1]?.data || {};
  const dataById = (id: string) => (state.orderUpdateArgs.find((a) => a?.where?.id === id)?.data) || {};
  const resetUpdates = () => { state.orderUpdateArgs = []; };

  const existingDate = new Date('2025-01-15T03:04:05.000Z');

  // B1. 已有 refundDate 的订单再次标记「已返款」→ 日期保持不变
  state.batchOrders = [
    { id: 'r1', actualPayment: 100, baseCommission: 5, reviewCommission: 0, refundDate: existingDate },
  ];
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['r1'], 'isRefunded', true);
  check('[B] 已有日期：refundDate 未被覆盖（保持原值）',
    dataById('r1').refundDate instanceof Date && dataById('r1').refundDate.getTime(),
    existingDate.getTime());

  // B2. refundDate 为空的订单标记「已返款」→ 回填当前时间（仍写 Date）
  state.batchOrders = [
    { id: 'r2', actualPayment: 100, baseCommission: 5, reviewCommission: 0, refundDate: null },
  ];
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['r2'], 'isRefunded', true);
  check('[B] 空日期：标记已返款 → 回填 Date', dataById('r2').refundDate instanceof Date, true);

  // B3. 标记「未返款」→ refundDate 置为 null
  state.batchOrders = [
    { id: 'r3', actualPayment: 100, baseCommission: 5, reviewCommission: 0, refundDate: existingDate },
  ];
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['r3'], 'isRefunded', false);
  check('[B] 改回未返款 → refundDate = null', dataById('r3').refundDate, null);

  // B4. isBaseCommissionRefunded 路径绝不写任何日期
  state.batchOrders = [
    { id: 'r4', actualPayment: 100, baseCommission: 5, reviewCommission: 0, refundDate: existingDate },
  ];
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['r4'], 'isBaseCommissionRefunded', true);
  check('[B] isBaseCommissionRefunded 路径：不写 refundDate', 'refundDate' in dataById('r4'), false);
  check('[B] isBaseCommissionRefunded 路径：不写 isRefunded', 'isRefunded' in dataById('r4'), false);

  /* ---------- C. takerDetail 好评统计 ---------- */
  console.log('\n=== C. takerDetail goodReviewCount / pendingReview ===');
  state.taker = { id: 'T1', wechatName: '张三', wechatId: 'wx1', status: 'active' };
  state.takerAllOrders = [
    { actualPayment: 100, baseCommission: 5, reviewCommission: 3, totalRefund: 108, isRefunded: true, isGoodReview: 'reviewed', orderDate: new Date('2025-03-01') },
    { actualPayment: 200, baseCommission: 5, reviewCommission: 3, totalRefund: 208, isRefunded: false, isGoodReview: 'reviewed', orderDate: new Date('2025-03-02') },
    { actualPayment: 300, baseCommission: 5, reviewCommission: 0, totalRefund: 305, isRefunded: false, isGoodReview: 'pending', orderDate: new Date('2025-03-03') },
  ];
  state.takerPagedOrders = state.takerAllOrders;
  state.takerCount = 3;

  const takerRes: any = {
    statusCode: 200,
    body: null,
    status(c: number) { this.statusCode = c; return this; },
    json(o: any) { this.body = o; return this; },
  };
  await takerDetailController.getTakerDetail({ params: { id: 'T1' }, query: {} } as any, takerRes as any);
  const summary = takerRes.body?.data?.summary || {};
  check('[C] 2 单 reviewed + 1 单 pending → goodReviewCount = 2', summary.goodReviewCount, 2);
  check('[C] pendingReview = 总数(3) − 已好评(2) = 1', summary.pendingReview, 1);
  check('[C] refundedCount 不受影响 = 1', summary.refundedCount, 1);
  check('[C] pendingRefund = 3 − 1 = 2', summary.pendingRefund, 2);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
