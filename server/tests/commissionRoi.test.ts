/**
 * commissionRoi.test.ts —— P1-8「佣金 ROI 分析」回归测试
 *
 * 覆盖：
 *   A. safeRatio：分母为 0 / 负数 / 非有限数 → null（绝不产生 NaN / Infinity）的边界
 *   B. getCommissionStats：实付总额为 0 时 commissionToPaymentRatio 必须是 null（非 NaN/Infinity）
 *   C. 未返款率口径 = 未返款单数 ÷ 总单数（构造已知命中/不命中样例）
 *   D. 未返款判定为**订单级** isRefunded = 0，绝不掺入分项级 isBaseCommissionRefunded
 *   E. 好评返佣（已好评口径）必须用 isGoodReview = 'reviewed' 字符串比较，禁止真值判断
 *   F. 既有字段全部保留（不回归）；byTaker / byProduct / byMonth 新增比率接线正确
 *
 * 手法：require.cache 预注入 fake prisma（同时注入 `\` 与 `/` 两种路径键）驱动**真实** controller。
 *   - fake 的 $queryRawUnsafe 按 SQL 特征分派返回预置聚合行，并**记录真实发出的 SQL 文本**，
 *     用于断言口径谓词（订单级 isRefunded / 字符串 isGoodReview / 无 isBaseCommissionRefunded）。
 *   - 数值 ROI 数学（比率、NaN 守卫）由真实 controller 对预置聚合结果直接推导验证。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */

process.env.JWT_SECRET = 'commission-roi-test-secret';

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
 * 0. fake prisma / logger（必须在 require 业务源码前注入）
 * ============================================================ */
const state: {
  summary: any;
  byTaker: any[];
  byProduct: any[];
  byMonth: any[];
  sqlLog: { sql: string; params: any[] }[];
} = {
  summary: undefined,
  byTaker: [],
  byProduct: [],
  byMonth: [],
  sqlLog: [],
};

const fakePrisma: any = {
  $queryRawUnsafe: async (sql: string, ...params: any[]) => {
    state.sqlLog.push({ sql, params });
    if (/AS totalOrders/.test(sql)) return [state.summary];
    if (/GROUP BY o\.takerId/.test(sql)) return state.byTaker;
    if (/GROUP BY COALESCE\(o\.productCode/.test(sql)) return state.byProduct;
    if (/DATE_FORMAT/.test(sql)) return state.byMonth;
    return [];
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
const { getCommissionStats, safeRatio } = require('../src/controllers/commissionController');

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

function resetState() {
  state.summary = undefined;
  state.byTaker = [];
  state.byProduct = [];
  state.byMonth = [];
  state.sqlLog = [];
}

/** 取本次调用中「汇总查询」的 SQL 文本（按 AS totalOrders 识别） */
function summarySql(): string {
  return state.sqlLog.find((s) => /AS totalOrders/.test(s.sql))?.sql || '';
}
function takerSql(): string {
  return state.sqlLog.find((s) => /GROUP BY o\.takerId/.test(s.sql))?.sql || '';
}
function allSql(): string {
  return state.sqlLog.map((s) => s.sql).join('\n----\n');
}

/** 构造一份完整的「汇总聚合行」（controller 期望的全部列） */
function agg(over: Partial<Record<string, number>> = {}): any {
  return {
    totalOrders: 0,
    totalPayment: 0,
    totalBaseCommission: 0,
    totalReviewCommission: 0,
    reviewedReviewCommission: 0,
    unpaidOrders: 0,
    totalRefundAmount: 0,
    unpaidRefundAmount: 0,
    ...over,
  };
}

const isFiniteOrNull = (v: unknown): boolean => v === null || Number.isFinite(Number(v));
const notNaN = (v: unknown): boolean => !(typeof v === 'number' && Number.isNaN(v));

/* ============================================================
 * 2. 用例
 * ============================================================ */
(async () => {
  /* ---------- A. safeRatio 边界（分母为 0 的 NaN/Infinity 守卫）---------- */
  console.log('\n=== A. safeRatio 边界 ===');
  check('[A] safeRatio(1, 0) = null', safeRatio(1, 0), null);
  check('[A] safeRatio(0, 0) = null', safeRatio(0, 0), null);
  check('[A] safeRatio(1, -5) = null（分母为负）', safeRatio(1, -5), null);
  check('[A] safeRatio(NaN, 5) = null', safeRatio(NaN, 5), null);
  check('[A] safeRatio(5, NaN) = null', safeRatio(5, NaN), null);
  check('[A] safeRatio(Infinity, 5) = null', safeRatio(Infinity, 5), null);
  check('[A] safeRatio(5, Infinity) = null', safeRatio(5, Infinity), null);
  check('[A] safeRatio(5, 0.0000001) 正常', Math.abs((safeRatio(5, 0.0000001) as number) - 50000000) < 1, true);
  check('[A] safeRatio(3, 4) = 0.75', safeRatio(3, 4), 0.75);
  check('[A] safeRatio(0, 4) = 0（分子 0、分母合法 → 0）', safeRatio(0, 4), 0);
  check('[A] safeRatio(5, 5) = 1', safeRatio(5, 5), 1);

  /* ---------- B. 分母为 0（实付总额 0）不产生 NaN / Infinity ---------- */
  console.log('\n=== B. 实付总额 0 → 返款/实付比 = null（不 NaN/Infinity）===');
  resetState();
  state.summary = agg({ totalOrders: 3, totalPayment: 0, totalBaseCommission: 15, totalReviewCommission: 0, unpaidOrders: 1 });
  const resB = makeRes();
  await getCommissionStats({ query: {} } as any, resB);
  const sB = resB.payload?.data?.summary;
  check('[B] success = true', resB.payload?.success, true);
  check('[B] 实付总额 = 0', sB?.totalPayment, 0);
  check('[B] 返款/实付比 = null', sB?.commissionToPaymentRatio, null);
  check('[B] 返款/实付比 非 NaN', notNaN(sB?.commissionToPaymentRatio), true);
  check('[B] 返款/实付比 非 Infinity', sB?.commissionToPaymentRatio === null, true);
  check('[B] 未返款率 = 1/3（分母=订单总数 3）', sB?.unpaidRate, 1 / 3);
  check('[B] 未返款率 为有限数', isFiniteOrNull(sB?.unpaidRate), true);
  // 连续「反例」：把佣金也置 0，确认 0/0 仍是 null 而不是 NaN
  resetState();
  state.summary = agg({ totalOrders: 0, totalPayment: 0, totalBaseCommission: 0, totalReviewCommission: 0, unpaidOrders: 0 });
  const resB2 = makeRes();
  await getCommissionStats({ query: {} } as any, resB2);
  const sB2 = resB2.payload?.data?.summary;
  check('[B] 订单/实付/佣金全 0 → 返款实付比 null（0/0 不 NaN）', sB2?.commissionToPaymentRatio, null);
  check('[B] 订单总数 0 → 未返款率 null', sB2?.unpaidRate, null);
  check('[B] 既有字段 单均佣金仍为 0（口径未变）', sB2?.avgCommissionPerOrder, 0);
  check('[B] payload 整体不含 NaN/Infinity 字面', !/NaN|Infinity/.test(JSON.stringify(resB2.payload)), true);

  /* ---------- C. 未返款率口径 = 未返款单数 ÷ 总单数 ---------- */
  console.log('\n=== C. 未返款率口径（构造已知命中/不命中样例）===');
  resetState();
  // 样例：4 单中 1 单未返款（命中） → 0.25
  state.summary = agg({ totalOrders: 4, totalPayment: 400, totalBaseCommission: 20, totalReviewCommission: 0, unpaidOrders: 1, totalRefundAmount: 420, unpaidRefundAmount: 105 });
  const resC = makeRes();
  await getCommissionStats({ query: {} } as any, resC);
  const sC = resC.payload?.data?.summary;
  check('[C] 4 单中 1 单未返款 → 未返款率 = 0.25', sC?.unpaidRate, 0.25);
  check('[C] 未返款单数原样透传 = 1', sC?.unpaidOrders, 1);
  check('[C] 未返款金额原样透传 = 105', sC?.unpaidRefundAmount, 105);
  check('[C] 应返款总额原样透传 = 420', sC?.totalRefundAmount, 420);
  // 样例：4 单全部已返款（不命中） → 0（不是 null）
  resetState();
  state.summary = agg({ totalOrders: 4, totalPayment: 400, unpaidOrders: 0, totalRefundAmount: 400, unpaidRefundAmount: 0 });
  const resC2 = makeRes();
  await getCommissionStats({ query: {} } as any, resC2);
  const sC2 = resC2.payload?.data?.summary;
  check('[C] 4 单 0 未返款 → 未返款率 = 0（分母合法，非 null）', sC2?.unpaidRate, 0);
  check('[C] 未返款率为数字类型', typeof sC2?.unpaidRate, 'number');

  /* ---------- D. 未返款按订单级 isRefunded 判定，不含分项级 isBaseCommissionRefunded ---------- */
  console.log('\n=== D. 未返款口径：订单级 isRefunded = 0（不掺 isBaseCommissionRefunded）===');
  const sumSql = summarySql();
  check('[D] 汇总 SQL 含订单级判定 o.isRefunded = 0', /o\.isRefunded\s*=\s*0/.test(sumSql), true);
  check('[D] 汇总 SQL 不含 isBaseCommissionRefunded（未混用分项口径）', /isBaseCommissionRefunded/.test(allSql()), false);
  check('[D] 接单人 SQL 含订单级判定 o.isRefunded = 0', /o\.isRefunded\s*=\s*0/.test(takerSql()), true);
  check('[D] 接单人 SQL 不含 isBaseCommissionRefunded', /isBaseCommissionRefunded/.test(takerSql()), false);
  // 反例驱动：接单人聚合行里塞入 isBaseCommissionRefunded 干扰字段，输出不得受其影响
  resetState();
  state.summary = agg({ totalOrders: 2, totalPayment: 200, totalBaseCommission: 10 });
  state.byTaker = [
    { takerId: 't1', name: '张三', wechatId: 'zs', orders: 2, totalPayment: 200, baseCommission: 10, reviewCommission: 0, totalRefund: 210, unpaidOrders: 1, isBaseCommissionRefunded: true },
  ];
  const resD = makeRes();
  await getCommissionStats({ query: {} } as any, resD);
  const tD = resD.payload?.data?.byTaker?.[0];
  check('[D] 干扰字段 isBaseCommissionRefunded 未进入输出对象', Object.prototype.hasOwnProperty.call(tD, 'isBaseCommissionRefunded'), false);
  check('[D] 接单人未返款率 = 1/2（仅由 unpaidOrders/orders 决定）', tD?.unpaidRate, 0.5);

  /* ---------- E. 好评返佣：仅 isGoodReview === 'reviewed' 计入 ---------- */
  console.log("\n=== E. 好评返佣：字符串比较 isGoodReview = 'reviewed' ===");
  const sumSqlE = summarySql();
  check("E 汇总 SQL 含 o.isGoodReview = 'reviewed'（字符串字面量）", /o\.isGoodReview\s*=\s*'reviewed'/.test(sumSqlE), true);
  check('[E] 汇总 SQL 未退化为 isGoodReview = 1', /isGoodReview\s*=\s*1/.test(allSql()), false);
  check('[E] 汇总 SQL 未退化为 isGoodReview = true', /isGoodReview\s*=\s*true/i.test(allSql()), false);
  check('[E] 汇总 SQL 未出现真值判断 IF(o.isGoodReview / IS TRUE', /IF\s*\(\s*o\.isGoodReview|isGoodReview\s+IS\s+TRUE/i.test(allSql()), false);
  // 驱动：已好评返佣只取 reviewedReviewCommission
  resetState();
  state.summary = agg({ totalOrders: 3, totalPayment: 300, totalBaseCommission: 15, totalReviewCommission: 9, reviewedReviewCommission: 3, unpaidOrders: 0 });
  const resE = makeRes();
  await getCommissionStats({ query: {} } as any, resE);
  const sE = resE.payload?.data?.summary;
  check('[E] 已好评返佣 = 3（仅 reviewed 单）', sE?.reviewedReviewCommission, 3);
  check('[E] 好评返佣合计 = 9（保留既有 SUM(reviewCommission) 口径）', sE?.totalReviewCommission, 9);
  check('[E] 汇总 SQL 保留 SUM(o.reviewCommission) 既有口径', /SUM\(o\.reviewCommission\)/.test(summarySql()), true);

  /* ---------- F. 既有字段保留 + 各分组比率接线 ---------- */
  console.log('\n=== F. 既有字段保留 + 分组比率接线 ===');
  resetState();
  state.summary = agg({ totalOrders: 10, totalPayment: 1000, totalBaseCommission: 50, totalReviewCommission: 30, reviewedReviewCommission: 20, unpaidOrders: 2, totalRefundAmount: 1080, unpaidRefundAmount: 216 });
  state.byTaker = [
    { takerId: 't1', name: '张三', wechatId: 'zs', orders: 6, totalPayment: 600, baseCommission: 30, reviewCommission: 18, totalRefund: 648, unpaidOrders: 1 },
    { takerId: 't2', name: '李四', wechatId: 'ls', orders: 4, totalPayment: 0, baseCommission: 20, reviewCommission: 12, totalRefund: 0, unpaidOrders: 1 },
  ];
  state.byProduct = [
    { id: 'P1', code: 'P1', orders: 10, totalPayment: 1000, baseCommission: 50, reviewCommission: 30 },
  ];
  state.byMonth = [
    { month: '2026-07', orders: 10, totalPayment: 1000, baseCommission: 50, reviewCommission: 30 },
  ];
  const resF = makeRes();
  await getCommissionStats({ query: { startDate: '2026-07-01', endDate: '2026-07-31' } } as any, resF);
  const dF = resF.payload?.data;

  // F1. 既有 summary 字段
  ['totalOrders', 'totalPayment', 'totalBaseCommission', 'totalReviewCommission', 'totalCommission', 'avgCommissionPerOrder'].forEach((k) => {
    check(`[F] summary 保留既有字段 ${k}`, Object.prototype.hasOwnProperty.call(dF?.summary, k), true);
  });
  check('[F] 佣金合计 = 50 + 30 = 80', dF?.summary?.totalCommission, 80);
  check('[F] 单均佣金 = 80 / 10 = 8', dF?.summary?.avgCommissionPerOrder, 8);
  check('[F] 返款/实付比 = 80 / 1000 = 0.08', dF?.summary?.commissionToPaymentRatio, 0.08);
  check('[F] 未返款率 = 2 / 10 = 0.2', dF?.summary?.unpaidRate, 0.2);

  // F2. 日期过滤条件（既有行为）
  check('[F] 汇总 SQL 含 orderDate >= ?', /o\.orderDate\s*>=\s*\?/.test(summarySql()), true);
  check('[F] 汇总 SQL 含 orderDate <= ?', /o\.orderDate\s*<=\s*\?/.test(summarySql()), true);
  check('[F] 汇总查询收到 2 个日期参数', state.sqlLog.find((s) => /AS totalOrders/.test(s.sql))?.params.length, 2);

  // F3. byTaker 既有字段 + 新比率
  const t1 = dF?.byTaker?.[0];
  ['id', 'name', 'wechatId', 'orders', 'totalPayment', 'baseCommission', 'reviewCommission', 'totalRefund', 'avgCommission'].forEach((k) => {
    check(`[F] byTaker 保留既有字段 ${k}`, Object.prototype.hasOwnProperty.call(t1, k), true);
  });
  check('[F] t1 单均佣金 = 48 / 6 = 8', t1?.avgCommission, 8);
  check('[F] t1 返款/实付比 = 48 / 600 = 0.08', t1?.commissionToPaymentRatio, 0.08);
  check('[F] t1 未返款率 = 1 / 6', t1?.unpaidRate, 1 / 6);
  // t2 实付为 0 → 比率 null，且未产生 NaN
  const t2 = dF?.byTaker?.[1];
  check('[F] t2 实付 0 → 返款/实付比 null', t2?.commissionToPaymentRatio, null);
  check('[F] t2 未返款率 = 1 / 4 = 0.25（分母为订单数，与实付无关）', t2?.unpaidRate, 0.25);

  // F4. byProduct / byMonth 新比率
  check('[F] byProduct 保留既有字段 orders', Object.prototype.hasOwnProperty.call(dF?.byProduct?.[0], 'orders'), true);
  check('[F] byProduct 返款/实付比 = 80 / 1000 = 0.08', dF?.byProduct?.[0]?.commissionToPaymentRatio, 0.08);
  check('[F] byMonth 保留既有字段 totalCommission = 80', dF?.byMonth?.[0]?.totalCommission, 80);
  check('[F] byMonth 返款/实付比 = 80 / 1000 = 0.08', dF?.byMonth?.[0]?.commissionToPaymentRatio, 0.08);

  // F5. 全部 SQL 均不含 NaN/Infinity 计算（无裸除法出现在无守卫处）——软断言
  check('[F] 响应体不含 NaN/Infinity', !/NaN|Infinity/.test(JSON.stringify(dF)), true);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
