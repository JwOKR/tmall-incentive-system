/**
 * 「好评返佣默认金额」自动填充 回归测试
 *
 * 背景（用户报告的 Bug：点击已好评，没有自动填充好评返佣）：
 *   前端标记「已好评」时只写了 reviewCommissionDate，没有任何金额填充。
 *   修复后由服务端统一判定（业务规则单一数据源）：
 *     - 标记「已好评」时，好评返佣一律覆盖为系统设置 review_commission_amount 的值（默认 3 元）；
 *     - 但请求**显式**传了 reviewCommission（用户在单元格里手工改金额）时，尊重手工值；
 *     - 无论哪条分支，totalRefund 都要用**最终**的 reviewCommission 重算。
 *   两条写入路径都必须生效：
 *     - 单条：orderService.updateOrder（PUT /api/orders/:id）
 *     - 批量：orderService.batchUpdateOrderStatus（PUT /api/orders/batch/status）
 *
 * 手法：沿用 takerOrderGate.test.ts —— require.cache 预注入 fake prisma 驱动真实源码，
 *       不连数据库（本机无 MySQL）。fake prisma 内部维护一个内存版 SystemSetting 表，
 *       顺带验证 getSettings / updateSettings 的读写闭环。
 */
import {
  DEFAULT_REVIEW_COMMISSION,
  REVIEW_COMMISSION_SETTING_KEY,
  parseReviewCommissionSetting,
} from '../src/utils/reviewCommission';

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
 * 0. 纯函数：parseReviewCommissionSetting 取值矩阵
 * ============================================================ */
console.log('\n=== 0. parseReviewCommissionSetting 取值矩阵 ===');
check('null → 默认 3', parseReviewCommissionSetting(null), DEFAULT_REVIEW_COMMISSION);
check('undefined → 默认 3', parseReviewCommissionSetting(undefined), DEFAULT_REVIEW_COMMISSION);
check('空串 → 默认 3', parseReviewCommissionSetting(''), DEFAULT_REVIEW_COMMISSION);
check('纯空白 "   " → 默认 3', parseReviewCommissionSetting('   '), DEFAULT_REVIEW_COMMISSION);
check("'3' → 3", parseReviewCommissionSetting('3'), 3);
check("' 3 ' → 3（trim）", parseReviewCommissionSetting(' 3 '), 3);
check("'3.5' → 3.5", parseReviewCommissionSetting('3.5'), 3.5);
check("' 3.5 ' → 3.5", parseReviewCommissionSetting(' 3.5 '), 3.5);
check("'0' → 0（0 是合法值，不回退）", parseReviewCommissionSetting('0'), 0);
check("'  0  ' → 0", parseReviewCommissionSetting('  0  '), 0);
check("'0.0' → 0", parseReviewCommissionSetting('0.0'), 0);
check("'-1' → 默认 3（负数回退）", parseReviewCommissionSetting('-1'), DEFAULT_REVIEW_COMMISSION);
check("'-0.5' → 默认 3", parseReviewCommissionSetting('-0.5'), DEFAULT_REVIEW_COMMISSION);
check("'abc' → 默认 3（非数字）", parseReviewCommissionSetting('abc'), DEFAULT_REVIEW_COMMISSION);
check("'10元' → 默认 3", parseReviewCommissionSetting('10元'), DEFAULT_REVIEW_COMMISSION);
check("'NaN' → 默认 3", parseReviewCommissionSetting('NaN'), DEFAULT_REVIEW_COMMISSION);
check("'Infinity' → 默认 3", parseReviewCommissionSetting('Infinity'), DEFAULT_REVIEW_COMMISSION);
check("'-Infinity' → 默认 3", parseReviewCommissionSetting('-Infinity'), DEFAULT_REVIEW_COMMISSION);
check("'1e2' → 100（科学计数法合法）", parseReviewCommissionSetting('1e2'), 100);
check('DEFAULT_REVIEW_COMMISSION 常量 = 3', DEFAULT_REVIEW_COMMISSION, 3);
check('REVIEW_COMMISSION_SETTING_KEY = review_commission_amount', REVIEW_COMMISSION_SETTING_KEY, 'review_commission_amount');

/* ============================================================
 * 1. fake prisma（注入到 require.cache，避免初始化真实 PrismaClient）
 *    内含一个内存版 SystemSetting 表，供 getSettings / updateSettings / getSettingValue 使用。
 * ============================================================ */
type SettingRow = { key: string; value: string; group: string };

const state: {
  /** 内存版 SystemSetting 表 */
  rows: SettingRow[];
  /** 配置读取次数（getSettingValue → systemSetting.findUnique） */
  configReads: number;
  /** 单条更新：order.findUnique 返回的既有订单 */
  existingOrder: any;
  /** 批量更新：order.findMany 返回的订单列表 */
  batchOrders: any[];
  /** 记录 order.update 的入参，供断言 */
  orderUpdateArgs: any[];
} = {
  rows: [],
  configReads: 0,
  existingOrder: null,
  batchOrders: [],
  orderUpdateArgs: [],
};

const fakePrisma: any = {
  order: {
    findUnique: async () => state.existingOrder,
    findFirst: async () => null,
    update: async (args: any) => {
      state.orderUpdateArgs.push(args);
      return { id: args?.where?.id };
    },
    findMany: async () => state.batchOrders,
  },
  systemSetting: {
    findUnique: async (args: any) => {
      if (args?.where?.key === REVIEW_COMMISSION_SETTING_KEY) state.configReads++;
      const row = state.rows.find(r => r.key === args?.where?.key);
      return row ?? null;
    },
    findMany: async (args: any) => {
      const group = args?.where?.group;
      const rows = state.rows.filter(r => r.group === group);
      return rows.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
    upsert: async (args: any) => {
      const key = args.where.key;
      const existing = state.rows.find(r => r.key === key);
      if (existing) {
        existing.value = args.update.value;
        return existing;
      }
      const created: SettingRow = {
        key,
        value: args.create.value,
        group: args.create.group,
      };
      state.rows.push(created);
      return created;
    },
  },
  task: { findUnique: async () => null, update: async () => ({}) },
  $transaction: async (arg: any) => {
    if (typeof arg === 'function') return arg(fakePrisma);
    return Promise.all(arg);
  },
};

// 在加载 service 之前把 `../utils/db` 换成假实现。
// 同时注入反斜杠 / 正斜杠两种路径键，规避 Windows 下 require.cache 键格式差异。
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const systemSettingService = require('../src/services/systemSettingService');

/* ============================================================
 * 2. 设置读写闭环：getSettings / updateSettings
 * ============================================================ */
(async () => {
  console.log('\n=== 2. 设置读写闭环（general 分组默认值合并 + 保历史键）===');

  // 2.1 库里没有该行时，getSettings('general') 仍返回默认 3
  state.rows = [];
  const emptyGeneral = await systemSettingService.getSettings('general');
  const rcRow = emptyGeneral.find((r: any) => r.key === REVIEW_COMMISSION_SETTING_KEY);
  check('库里无该行 → getSettings(general) 仍含该键', !!rcRow, true);
  check('无行时 value 回落默认 "3"', rcRow?.value, '3');
  check('label 存在', rcRow?.label, '好评返佣默认金额（元）');
  check('group = general', rcRow?.group, 'general');

  // 2.2 历史遗留键必须保留，不能凭空消失
  state.rows = [{ key: 'legacy_key', value: 'legacy', group: 'general' }];
  const withLegacy = await systemSettingService.getSettings('general');
  check('保留不在默认表里的历史键', withLegacy.some((r: any) => r.key === 'legacy_key'), true);
  check('同时仍有默认键 review_commission_amount', withLegacy.some((r: any) => r.key === REVIEW_COMMISSION_SETTING_KEY), true);

  // 2.3 updateSettings 写入后能读回，且落到 general 分组
  state.rows = [];
  await systemSettingService.updateSettings([{ key: REVIEW_COMMISSION_SETTING_KEY, value: '7' }]);
  const stored = state.rows.find(r => r.key === REVIEW_COMMISSION_SETTING_KEY);
  check('updateSettings 落库 group = general', stored?.group, 'general');
  const afterWrite = await systemSettingService.getSettings('general');
  check('写 7 后读回 7', afterWrite.find((r: any) => r.key === REVIEW_COMMISSION_SETTING_KEY)?.value, '7');

  // 2.4 不破坏 ai 分组现有行为（只返回 5 个 AI 键，缺省回落默认）
  state.rows = [];
  const ai = await systemSettingService.getSettings('ai');
  check('ai 分组返回 5 个键', ai.length, 5);
  check('ai 分组缺省回落默认 model', ai.find((r: any) => r.key === 'ai_model')?.value, 'deepseek-chat');
  check('ai 分组仍为 group=ai', ai.every((r: any) => r.group === 'ai'), true);

  // 2.5 getReviewCommissionAmount：缺省 → 3；存在 → 解析值；非法 → 3
  state.rows = [];
  check('getReviewCommissionAmount 缺省 → 3', await systemSettingService.getReviewCommissionAmount(), 3);
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '4.5', group: 'general' }];
  check('getReviewCommissionAmount 读 4.5', await systemSettingService.getReviewCommissionAmount(), 4.5);
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: 'oops', group: 'general' }];
  check('getReviewCommissionAmount 非法 → 3', await systemSettingService.getReviewCommissionAmount(), 3);

  /* ============================================================
   * 3. 写入路径 A：单条 updateOrder
   * ============================================================ */
  console.log('\n=== 3. 单条 updateOrder ===');

  const baseOrder = () => ({
    id: 'o1',
    orderNo: 'A1',
    orderNo19: null,
    orderLink: null,
    actualPayment: 100,
    baseCommission: 5,
    reviewCommission: 0,
    isRefunded: false,
    isGoodReview: 'pending',
    reviewCommissionDate: null,
    drawingDate: null,
    taskId: null,
    takerId: null,
    remark: null,
  });

  const resetOrder = () => {
    state.orderUpdateArgs = [];
    state.configReads = 0;
  };

  const lastData = () => state.orderUpdateArgs[state.orderUpdateArgs.length - 1]?.data || {};

  // 3.1 标记已好评 + 库里无配置行 → 好评返佣覆盖为默认 3，totalRefund 重算
  state.rows = [];
  state.existingOrder = baseOrder();
  resetOrder();
  await orderService.updateOrder('o1', { isGoodReview: 'reviewed', reviewCommissionDate: new Date().toISOString() });
  check('[单条] reviewed：reviewCommission 写为默认 3', lastData().reviewCommission, 3);
  check('[单条] reviewed：totalRefund = 100+5+3 = 108', lastData().totalRefund, 108);
  check('[单条] reviewed：isGoodReview 写为 "reviewed"', lastData().isGoodReview, 'reviewed');
  check('[单条] reviewed：保留了自动写入的 reviewCommissionDate', lastData().reviewCommissionDate !== undefined, true);
  check('[单条] reviewed：查了一次配置', state.configReads, 1);

  // 3.2 已存在手工改过的金额 + 配置=5 → 即便之前手工改过，也要覆盖为 5
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.existingOrder = { ...baseOrder(), reviewCommission: 99 };
  resetOrder();
  await orderService.updateOrder('o1', { isGoodReview: 'reviewed', reviewCommissionDate: new Date().toISOString() });
  check('[单条] 配置=5：覆盖此前手工值 99 → 5', lastData().reviewCommission, 5);
  check('[单条] 配置=5：totalRefund = 100+5+5 = 110', lastData().totalRefund, 110);

  // 3.3 显式传 reviewCommission（手工改金额）→ 尊重手工值，不查配置
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.existingOrder = baseOrder();
  resetOrder();
  await orderService.updateOrder('o1', { reviewCommission: 8 });
  check('[单条] 显式 8：reviewCommission = 8（不被覆盖）', lastData().reviewCommission, 8);
  check('[单条] 显式 8：totalRefund = 100+5+8 = 113', lastData().totalRefund, 113);
  check('[单条] 显式 8：未查询配置', state.configReads, 0);

  // 3.4 显式 reviewCommission 且同时 marked reviewed → 仍尊重显式值
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.existingOrder = baseOrder();
  resetOrder();
  await orderService.updateOrder('o1', { isGoodReview: 'reviewed', reviewCommission: 7 });
  check('[单条] 显式 7 + reviewed：reviewCommission = 7', lastData().reviewCommission, 7);
  check('[单条] 显式 7 + reviewed：totalRefund = 100+5+7 = 112', lastData().totalRefund, 112);

  // 3.5 非 reviewed（作图中）→ reviewCommission 完全不变、不写该字段
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.existingOrder = { ...baseOrder(), reviewCommission: 2, isGoodReview: 'pending' };
  resetOrder();
  await orderService.updateOrder('o1', { isGoodReview: 'creating', drawingDate: new Date().toISOString() });
  check('[单条] creating：reviewCommission 未写入（undefined）', lastData().reviewCommission, undefined);
  check('[单条] creating：totalRefund 用旧值 = 100+5+2 = 107', lastData().totalRefund, 107);
  check('[单条] creating：drawingDate 仍自动写入（回归）', lastData().drawingDate !== undefined, true);
  check('[单条] creating：未查询配置', state.configReads, 0);

  // 3.6 完全没带 isGoodReview 的普通编辑（如改备注）→ 好评返佣不变
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.existingOrder = { ...baseOrder(), reviewCommission: 2 };
  resetOrder();
  await orderService.updateOrder('o1', { remark: '改个备注' });
  check('[单条] 普通编辑：reviewCommission 未写入', lastData().reviewCommission, undefined);
  check('[单条] 普通编辑：totalRefund 用旧值 = 107', lastData().totalRefund, 107);
  check('[单条] 普通编辑：未查询配置', state.configReads, 0);

  /* ============================================================
   * 4. 写入路径 B：批量 batchUpdateOrderStatus
   * ============================================================ */
  console.log('\n=== 4. 批量 batchUpdateOrderStatus ===');

  const batchBase = () => [
    { id: 'b1', actualPayment: 100, baseCommission: 5, reviewCommission: 0 },
    { id: 'b2', actualPayment: 200, baseCommission: 10, reviewCommission: 4 },
  ];
  const dataById = (id: string) => {
    const hit = state.orderUpdateArgs.find(a => a?.where?.id === id);
    return hit?.data || {};
  };

  // 4.1 批量标记已好评 + 配置=5 → 每条覆盖为 5、totalRefund 用新金额；配置只查一次
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.batchOrders = batchBase();
  state.orderUpdateArgs = [];
  state.configReads = 0;
  const n = await orderService.batchUpdateOrderStatus(['b1', 'b2'], 'isGoodReview', 'reviewed');
  check('[批量] 返回更新条数 2', n, 2);
  check('[批量] b1 reviewCommission = 5', dataById('b1').reviewCommission, 5);
  check('[批量] b1 totalRefund = 100+5+5 = 110', dataById('b1').totalRefund, 110);
  check('[批量] b2 reviewCommission = 5（覆盖旧 4）', dataById('b2').reviewCommission, 5);
  check('[批量] b2 totalRefund = 200+10+5 = 215', dataById('b2').totalRefund, 215);
  check('[批量] 每条都写了 reviewCommissionDate', dataById('b1').reviewCommissionDate instanceof Date && dataById('b2').reviewCommissionDate instanceof Date, true);
  check('[批量] 配置只查一次（hoist）', state.configReads, 1);
  check('[批量] isGoodReview 写为 reviewed', dataById('b1').isGoodReview, 'reviewed');

  // 4.2 无配置行时批量已好评 → 回落默认 3
  state.rows = [];
  state.batchOrders = batchBase();
  state.orderUpdateArgs = [];
  state.configReads = 0;
  await orderService.batchUpdateOrderStatus(['b1', 'b2'], 'isGoodReview', 'reviewed');
  check('[批量] 无配置 → reviewCommission = 默认 3', dataById('b1').reviewCommission, 3);
  check('[批量] 无配置 → b1 totalRefund = 108', dataById('b1').totalRefund, 108);
  check('[批量] 无配置 → 仍只查一次配置', state.configReads, 1);

  // 4.3 批量标记返款（isRefunded）→ 不碰 reviewCommission、不查配置
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.batchOrders = batchBase();
  state.orderUpdateArgs = [];
  state.configReads = 0;
  await orderService.batchUpdateOrderStatus(['b1', 'b2'], 'isRefunded', true);
  check('[批量] 返款：未写 reviewCommission', dataById('b1').reviewCommission, undefined);
  check('[批量] 返款：totalRefund 用旧值 b2 = 200+10+4 = 214', dataById('b2').totalRefund, 214);
  check('[批量] 返款：写了 refundDate', dataById('b1').refundDate instanceof Date, true);
  check('[批量] 返款：未查询配置', state.configReads, 0);

  // 4.4 批量标记非 reviewed 的好评状态（作图中）→ 不覆盖金额
  state.rows = [{ key: REVIEW_COMMISSION_SETTING_KEY, value: '5', group: 'general' }];
  state.batchOrders = batchBase();
  state.orderUpdateArgs = [];
  state.configReads = 0;
  await orderService.batchUpdateOrderStatus(['b1'], 'isGoodReview', 'creating');
  check('[批量] creating：未写 reviewCommission', dataById('b1').reviewCommission, undefined);
  check('[批量] creating：totalRefund 用旧值 b1 = 100+5+0 = 105', dataById('b1').totalRefund, 105);
  check('[批量] creating：未查询配置', state.configReads, 0);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})();
