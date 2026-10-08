/**
 * 「基础返佣是否已返款」回归测试
 *
 * 需求（用户逐条确认）：
 *   - 订单级 isRefunded 是针对「总返款」的；本次新增的 isBaseCommissionRefunded
 *     只针对「基础返佣」，二者**完全独立、互不影响**。
 *   - 新字段**只存布尔状态，不记录任何日期**（区别于 isRefunded + refundDate）。
 *   - 标记已返款不得改动 totalRefund（总返款只由金额决定）。
 *   - 列表列筛选必须产出 { isBaseCommissionRefunded: true } 这种布尔 where，
 *     绝不能走 { contains: ... }（Prisma 在布尔字段上用 contains 会报错/永远筛不出）。
 *
 * 手法：沿用 reviewCommission.test.ts —— require.cache 预注入 fake prisma 驱动真实源码，
 *       不连数据库（本机无 MySQL）。fake 同时注入反斜杠 / 正斜杠两种路径键，
 *       规避 Windows 下 require.cache 键格式差异。
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
 * 0. fake prisma
 * ============================================================ */
type SettingRow = { key: string; value: string; group: string };

const state: {
  /** updateOrder：order.findUnique 返回的既有订单 */
  existingOrder: any;
  /** batchUpdateOrders：order.findFirst 返回的既有订单 */
  findFirstResult: any;
  /** batchUpdateOrderStatus：order.findMany 返回的订单列表（where.id.in 分支） */
  batchOrders: any[];
  /** getOrderList：order.findMany 返回的列表 */
  orderList: any[];
  orderCount: number;
  /** 记录 order.update 入参 */
  orderUpdateArgs: any[];
  /** 记录 order.create 入参 */
  orderCreateArgs: any[];
  /** 记录 getOrderList 的 findMany / count 入参 */
  listFindManyArgs: any;
  listCountArgs: any;
  /** 内存版 SystemSetting 表 */
  configRows: SettingRow[];
} = {
  existingOrder: null,
  findFirstResult: null,
  batchOrders: [],
  orderList: [],
  orderCount: 0,
  orderUpdateArgs: [],
  orderCreateArgs: [],
  listFindManyArgs: null,
  listCountArgs: null,
  configRows: [],
};

const fakePrisma: any = {
  order: {
    findUnique: async () => state.existingOrder,
    findFirst: async () => state.findFirstResult,
    update: async (args: any) => {
      state.orderUpdateArgs.push(args);
      return { id: args?.where?.id };
    },
    create: async (args: any) => {
      state.orderCreateArgs.push(args);
      return { id: 'created' };
    },
    findMany: async (args: any) => {
      // batchUpdateOrderStatus 走 where.id.in；getOrderList 走普通的列表查询。
      if (args?.where?.id?.in) return state.batchOrders;
      state.listFindManyArgs = args;
      return state.orderList;
    },
    count: async (args: any) => {
      state.listCountArgs = args;
      return state.orderCount;
    },
  },
  systemSetting: {
    findUnique: async (args: any) => state.configRows.find(r => r.key === args?.where?.key) ?? null,
  },
  task: { findUnique: async () => null, findFirst: async () => null, update: async () => ({}) },
  orderTaker: { findFirst: async () => null, update: async () => ({}) },
  // 供真实 createAuditLog 使用（backupController.importBackup 末尾会写审计日志）
  log: { create: async () => ({}) },
  $transaction: async (arg: any) => {
    if (typeof arg === 'function') return arg(fakePrisma);
    return Promise.all(arg);
  },
};

// 在加载 service 之前把 `../utils/db` 换成假实现。
const dbPath = require.resolve('../src/utils/db');
const fakeDbEntry = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { __esModule: true, default: fakePrisma },
  children: [],
  paths: [],
} as unknown as NodeModule;
require.cache[dbPath] = fakeDbEntry;
require.cache[dbPath.replace(/\\/g, '/')] = fakeDbEntry;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderService = require('../src/services/orderService');

// 备份导入测试：驱动**真实的** backupController.importBackup。
// 仅给「纯副作用基础设施」logger 做桩（它在 import 时会 mkdir logs/ 并注册文件 transport）；
// 其它依赖（db / auditLog）保持真实，db 复用上面的 fakePrisma（已补 log.create）。
const loggerPath = require.resolve('../src/utils/logger');
const fakeLoggerEntry = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { __esModule: true, default: { info() {}, warn() {}, error() {}, debug() {} } },
  children: [],
  paths: [],
} as unknown as NodeModule;
require.cache[loggerPath] = fakeLoggerEntry;
require.cache[loggerPath.replace(/\\/g, '/')] = fakeLoggerEntry;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backupController = require('../src/controllers/backupController');

/* ============================================================
 * 主要用例
 * ============================================================ */
(async () => {
  const baseOrder = () => ({
    id: 'o1',
    orderNo: 'A1',
    orderNo19: null,
    orderLink: null,
    actualPayment: 100,
    baseCommission: 5,
    reviewCommission: 0,
    isRefunded: false,
    refundDate: null,
    isBaseCommissionRefunded: false,
    isGoodReview: 'pending',
    reviewCommissionDate: null,
    drawingDate: null,
    taskId: null,
    takerId: null,
    remark: null,
  });

  const lastData = () => state.orderUpdateArgs[state.orderUpdateArgs.length - 1]?.data || {};
  const dataById = (id: string) => {
    const hit = state.orderUpdateArgs.find(a => a?.where?.id === id);
    return hit?.data || {};
  };
  const resetUpdates = () => { state.orderUpdateArgs = []; state.orderCreateArgs = []; };

  /* ============================================================
   * 1. 单条 updateOrder
   * ============================================================ */
  console.log('\n=== 1. 单条 updateOrder ===');

  // 1.1 显式传 isBaseCommissionRefunded: true → 落库正确；订单级字段与 totalRefund 均不受影响
  state.configRows = [];
  state.existingOrder = baseOrder();
  resetUpdates();
  await orderService.updateOrder('o1', { isBaseCommissionRefunded: true });
  check('[单条] 显式 true：写为布尔 true', lastData().isBaseCommissionRefunded, true);
  check('[单条] 显式 true：不改 isRefunded', lastData().isRefunded, undefined);
  check('[单条] 显式 true：不写 refundDate（新字段不记录日期）', lastData().refundDate, undefined);
  check('[单条] 显式 true：totalRefund 仍 = 100+5+0 = 105', lastData().totalRefund, 105);
  check('[单条] 显式 true：不改 reviewCommission', lastData().reviewCommission, undefined);

  // 1.2 显式传 false（覆盖已返款）→ 落库正确
  state.existingOrder = { ...baseOrder(), isBaseCommissionRefunded: true };
  resetUpdates();
  await orderService.updateOrder('o1', { isBaseCommissionRefunded: false });
  check('[单条] 显式 false：写为布尔 false', lastData().isBaseCommissionRefunded, false);

  // 1.3 不传该字段 → 不覆盖（写 undefined），且其它布尔/日期不受影响
  state.existingOrder = { ...baseOrder(), isBaseCommissionRefunded: true };
  resetUpdates();
  await orderService.updateOrder('o1', { remark: '改个备注' });
  check('[单条] 不传：isBaseCommissionRefunded 未写入（undefined）', lastData().isBaseCommissionRefunded, undefined);
  check('[单条] 不传：totalRefund 仍 = 105', lastData().totalRefund, 105);

  // 1.4 订单级 isRefunded=true → 不得连带打开基础返佣返款状态（独立性）
  state.existingOrder = baseOrder();
  resetUpdates();
  await orderService.updateOrder('o1', { isRefunded: true });
  check('[单条] 标记订单级已返款：isBaseCommissionRefunded 未被写入', lastData().isBaseCommissionRefunded, undefined);
  check('[单条] 标记订单级已返款：isRefunded 写为 true', lastData().isRefunded, true);

  /* ============================================================
   * 2. 批量 batchUpdateOrderStatus
   * ============================================================ */
  console.log('\n=== 2. 批量 batchUpdateOrderStatus ===');

  const batchBase = () => [
    { id: 'b1', actualPayment: 100, baseCommission: 5, reviewCommission: 0 },
    { id: 'b2', actualPayment: 200, baseCommission: 10, reviewCommission: 4 },
  ];

  // 2.1 批量标记基础返佣已返款 → 全部 true；不写 refundDate；totalRefund 不变
  state.configRows = [];
  state.batchOrders = batchBase();
  resetUpdates();
  const n = await orderService.batchUpdateOrderStatus(['b1', 'b2'], 'isBaseCommissionRefunded', true);
  check('[批量] 返回更新条数 2', n, 2);
  check('[批量] b1 = 布尔 true', dataById('b1').isBaseCommissionRefunded, true);
  check('[批量] b2 = 布尔 true', dataById('b2').isBaseCommissionRefunded, true);
  check('[批量] b1 未写 refundDate', dataById('b1').refundDate, undefined);
  check('[批量] b2 未写 refundDate', dataById('b2').refundDate, undefined);
  check('[批量] b1 totalRefund 不变 = 105', dataById('b1').totalRefund, 105);
  check('[批量] b2 totalRefund 不变 = 214', dataById('b2').totalRefund, 214);
  check('[批量] 不写 isRefunded', dataById('b1').isRefunded, undefined);

  // 2.2 前端可能传字符串 'true'，必须归一化为布尔 true
  state.batchOrders = batchBase();
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['b1'], 'isBaseCommissionRefunded', 'true');
  check('[批量] 字符串 "true" → 布尔 true', dataById('b1').isBaseCommissionRefunded, true);

  // 2.3 批量标记订单级 isRefunded=true → 新字段完全不受影响（独立性）
  state.configRows = [];
  state.batchOrders = batchBase();
  resetUpdates();
  await orderService.batchUpdateOrderStatus(['b1', 'b2'], 'isRefunded', true);
  check('[批量] 订单级返款：不改 isBaseCommissionRefunded', dataById('b1').isBaseCommissionRefunded, undefined);
  check('[批量] 订单级返款：仍写 refundDate', dataById('b1').refundDate instanceof Date, true);

  /* ============================================================
   * 3. 导入 batchCreateOrders
   * ============================================================ */
  console.log('\n=== 3. 导入 batchCreateOrders ===');

  state.findFirstResult = null; // 无重复订单
  resetUpdates();
  await orderService.batchCreateOrders([
    { orderNo: 'C1', isBaseCommissionRefunded: '是' },
    { orderNo: 'C2', isBaseCommissionRefunded: '否' },
    { orderNo: 'C3', isBaseCommissionRefunded: '' },
    { orderNo: 'C4' },
  ]);
  const created = state.orderCreateArgs.map(a => a?.data);
  check('[导入] 创建 4 条', created.length, 4);
  check('[导入] "是" → true', created[0]?.isBaseCommissionRefunded, true);
  check('[导入] "否" → false', created[1]?.isBaseCommissionRefunded, false);
  check('[导入] "" → false', created[2]?.isBaseCommissionRefunded, false);
  check('[导入] undefined → false', created[3]?.isBaseCommissionRefunded, false);

  /* ============================================================
   * 4. 批量修改 batchUpdateOrders
   * ============================================================ */
  console.log('\n=== 4. 批量修改 batchUpdateOrders ===');

  const batchExisting = () => ({
    id: 'u1',
    orderNo: 'U1',
    orderNo19: null,
    actualPayment: 100,
    baseCommission: 5,
    reviewCommission: 0,
    isRefunded: false,
    isBaseCommissionRefunded: false,
    remark: null,
  });

  // 4.1 带该字段 → 覆盖为 true，且不写 refundDate
  state.findFirstResult = batchExisting();
  resetUpdates();
  await orderService.batchUpdateOrders([{ orderNo: 'U1', isBaseCommissionRefunded: true }]);
  check('[批量修改] 带字段：覆盖为 true', dataById('u1').isBaseCommissionRefunded, true);
  check('[批量修改] 带字段：不写 refundDate', dataById('u1').refundDate, undefined);
  check('[批量修改] 带字段：totalRefund = 105', dataById('u1').totalRefund, 105);

  // 4.2 不带该字段（改备注）→ 完全不写入该字段
  state.findFirstResult = { ...batchExisting(), isBaseCommissionRefunded: true };
  resetUpdates();
  await orderService.batchUpdateOrders([{ orderNo: 'U1', remark: 'x' }]);
  check('[批量修改] 不带字段：未写入（undefined）', dataById('u1').isBaseCommissionRefunded, undefined);

  /* ============================================================
   * 5. 列表列筛选：必须产出布尔 where，绝不能是 contains
   * ============================================================ */
  console.log('\n=== 5. 列表列筛选 columnFilters ===');

  state.orderList = [];
  state.orderCount = 0;
  await orderService.getOrderList({ columnFilters: JSON.stringify({ isBaseCommissionRefunded: 'true' }) });
  const whereTrue = state.listFindManyArgs?.where || {};
  check('[筛选] where.isBaseCommissionRefunded === true', whereTrue.isBaseCommissionRefunded, true);
  check('[筛选] where 不含 contains', JSON.stringify(whereTrue).includes('contains'), false);
  check('[筛选] where 仅含该键', Object.keys(whereTrue).join(','), 'isBaseCommissionRefunded');

  await orderService.getOrderList({ columnFilters: { isBaseCommissionRefunded: 'false' } });
  const whereFalse = state.listFindManyArgs?.where || {};
  check('[筛选] 传 "false" → where = false', whereFalse.isBaseCommissionRefunded, false);

  /* ============================================================
   * 6. parseBoolValue 取值矩阵（新字段复用该工具）
   * ============================================================ */
  console.log('\n=== 6. parseBoolValue 取值矩阵 ===');
  check('parseBoolValue("是") === true', orderService.parseBoolValue('是'), true);
  check('parseBoolValue("否") === false', orderService.parseBoolValue('否'), false);
  check('parseBoolValue("") === false', orderService.parseBoolValue(''), false);
  check('parseBoolValue(undefined) === false', orderService.parseBoolValue(undefined), false);
  check('parseBoolValue("true") === true', orderService.parseBoolValue('true'), true);
  check('parseBoolValue(true) === true', orderService.parseBoolValue(true), true);

  /* ============================================================
   * 7. 备份导入 importBackup：布尔字段必须走 parseBoolValue
   *    修复背景：原写法 `order.xxx ?? false` 不解析字符串，备份 JSON 里若是 '是'，
   *    真 Prisma 对布尔列会抛 PrismaClientValidationError → 被 try/catch 吞掉 →
   *    该条订单静默导入失败、只进 errors 计数。改为与 batchCreateOrders/batchUpdateOrders 一致的 parseBoolValue。
   * ============================================================ */
  console.log('\n=== 7. 备份导入 importBackup 布尔解析 ===');

  const runImport = async (orders: any[]) => {
    state.findFirstResult = null;      // 无重复，全部走 create
    state.orderCreateArgs = [];
    const req: any = { headers: {}, body: { data: { orders }, mode: 'merge' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
    const res: any = {
      statusCode: 200,
      body: null,
      status(c: number) { this.statusCode = c; return this; },
      setHeader() { /* noop */ },
      json(o: any) { this.body = o; return this; },
    };
    await backupController.importBackup(req, res);
    return { res, data: state.orderCreateArgs.map((a: any) => a?.data) };
  };

  const { res: importRes, data: imported } = await runImport([
    { orderNo19: 'B1', isRefunded: undefined, isBaseCommissionRefunded: undefined },
    { orderNo19: 'B2', isRefunded: '是', isBaseCommissionRefunded: '是' },
    { orderNo19: 'B3', isRefunded: '否', isBaseCommissionRefunded: '否' },
    { orderNo19: 'B4', isRefunded: true, isBaseCommissionRefunded: true },
  ]);
  const byNo = (no: string) => imported.find((d: any) => d.orderNo19 === no) || {};

  check('[备份] 导入无错误（errors = 0）', importRes.body?.data?.orders?.errors, 0);
  check('[备份] 4 条全部创建成功', importRes.body?.data?.orders?.created, 4);
  // isBaseCommissionRefunded：本次修复的核心
  check('[备份] 缺字段(undefined) → false', byNo('B1').isBaseCommissionRefunded, false);
  check('[备份] "是" → 布尔 true', byNo('B2').isBaseCommissionRefunded, true);
  check('[备份] "是" 落库确为 boolean 类型', typeof byNo('B2').isBaseCommissionRefunded, 'boolean');
  check('[备份] "否" → 布尔 false', byNo('B3').isBaseCommissionRefunded, false);
  check('[备份] 布尔 true → true', byNo('B4').isBaseCommissionRefunded, true);
  // isRefunded：同类型字段必须同一套解析规则（两字段一起改）
  check('[备份] isRefunded 缺字段 → false', byNo('B1').isRefunded, false);
  check('[备份] isRefunded "是" → 布尔 true', byNo('B2').isRefunded, true);
  check('[备份] isRefunded "否" → 布尔 false', byNo('B3').isRefunded, false);
  check('[备份] isRefunded 布尔 true → true', byNo('B4').isRefunded, true);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})();
