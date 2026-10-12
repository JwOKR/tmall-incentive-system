/**
 * refundAlerts.test.ts —— 「超期未返款看板」回归测试 + 催单列表重构等价性证明
 *
 * 覆盖：
 *   A. parseRefundAlertDays：非法 / 越界输入的天数解析边界
 *   B. getRefundAlerts：
 *      - where 必须是 `orderDate: { lte }`（超期），**不能是 gte**（催单窗口）——本次最易搞反处；
 *      - overdueDays 精确计算（今天减 45 天、days=30 → 45）；
 *      - skippedNoTaker 统计准确（无接单人的超期未返款订单不静默丢弃）；
 *      - copyText 含天数标题 / 接单人昵称 / 微信号 / 金额；
 *      - 未达阈值的订单被排除。
 *   C. getRemindList 重构无行为变化：用一份「重构前的内联实现」作为参照，断言重构后
 *      的 list 与 copyText（剥离生成时间）与之逐字相同。
 *
 * 手法：require.cache 预注入 fake prisma（**同时注入 `\` 与 `/` 两种路径键**）驱动真实 controller。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */

process.env.JWT_SECRET = 'refund-alerts-test-secret';

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
const DAY = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
/** n 天前的本地 00:00（用于构造确定性的自然日差） */
function daysAgoMidnight(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

const state: {
  orders: any[];
  takers: any[];
  orderFindManyArgs: any;
} = {
  orders: [],
  takers: [],
  orderFindManyArgs: null,
};

const fakePrisma: any = {
  order: {
    findMany: async (args: any) => {
      state.orderFindManyArgs = args;
      return state.orders;
    },
  },
  orderTaker: {
    findMany: async () => state.takers,
  },
  systemSetting: {
    findUnique: async () => null,
    findMany: async () => [],
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
const { getRemindList, getRefundAlerts } = require('../src/controllers/remindController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseRefundAlertDays, DEFAULT_REFUND_ALERT_DAYS } = require('../src/services/systemSettingService');

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

/* ============================================================
 * 2. 参照实现：重构前的 remindController 内联逻辑（逐字复刻）
 * ============================================================ */
function legacyRemindList(pendingOrders: any[]) {
  const takerMap = new Map<string, {
    wechatName: string;
    wechatId: string;
    unpaidOrders: Array<{ orderId: string; orderNo19: string | null; actualPayment: number; orderDate: Date }>;
    unreviewedOrders: Array<{ orderId: string; orderNo19: string | null; baseCommission: number; orderDate: Date }>;
  }>();

  for (const order of pendingOrders) {
    if (!order.takerId || !order.taker) continue;
    const tid = order.takerId;
    if (!takerMap.has(tid)) {
      takerMap.set(tid, {
        wechatName: order.taker.wechatName,
        wechatId: order.taker.wechatId,
        unpaidOrders: [],
        unreviewedOrders: [],
      });
    }
    const entry = takerMap.get(tid)!;
    if (!order.isRefunded) {
      entry.unpaidOrders.push({
        orderId: order.id,
        orderNo19: order.orderNo19,
        actualPayment: order.actualPayment,
        orderDate: order.orderDate,
      });
    }
    if (order.isGoodReview !== 'reviewed') {
      entry.unreviewedOrders.push({
        orderId: order.id,
        orderNo19: order.orderNo19,
        baseCommission: order.baseCommission,
        orderDate: order.orderDate,
      });
    }
  }

  const result = Array.from(takerMap.entries())
    .map(([id, data]) => ({ takerId: id, ...data, totalPending: data.unpaidOrders.length + data.unreviewedOrders.length }))
    .sort((a, b) => b.totalPending - a.totalPending);

  const fmt = (n: number) => {
    const fixed = n.toFixed(2);
    return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
  };

  let copyText = `待处理催单列表\n`;
  copyText += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  copyText += `共 ${result.length} 人需处理\n\n`;

  for (const taker of result) {
    copyText += `【${taker.wechatName}】(${taker.wechatId})\n`;
    if (taker.unpaidOrders.length > 0) {
      copyText += `  待返款 ${taker.unpaidOrders.length} 单:\n`;
      for (const o of taker.unpaidOrders) {
        copyText += `    ${o.orderNo19 || '未填写'} - ¥${fmt(o.actualPayment)}\n`;
      }
    }
    if (taker.unreviewedOrders.length > 0) {
      copyText += `  待好评 ${taker.unreviewedOrders.length} 单:\n`;
      for (const o of taker.unreviewedOrders) {
        copyText += `    ${o.orderNo19 || '未填写'} - 佣金¥${fmt(o.baseCommission)}\n`;
      }
    }
    copyText += `\n`;
  }

  return { list: result, copyText, totalTakers: result.length, totalPendingOrders: pendingOrders.length };
}

/** 剥离生成时间（两次调用毫秒不同）后再比较 */
const stripTime = (s: string) => s.replace(/生成时间: .*/g, '生成时间: <T>');

/* ============================================================
 * 3. 用例
 * ============================================================ */
(async () => {
  /* ---------- A. parseRefundAlertDays ---------- */
  console.log('\n=== A. parseRefundAlertDays 取值边界 ===');
  check('DEFAULT_REFUND_ALERT_DAYS = 30', DEFAULT_REFUND_ALERT_DAYS, 30);
  check('undefined → 30', parseRefundAlertDays(undefined), 30);
  check("'abc' → 30", parseRefundAlertDays('abc'), 30);
  check("'0' → 30", parseRefundAlertDays('0'), 30);
  check("'-5' → 30", parseRefundAlertDays('-5'), 30);
  check("'' → 30", parseRefundAlertDays(''), 30);
  check("'7' → 7", parseRefundAlertDays('7'), 7);
  check("'999' → 365（上限夹取）", parseRefundAlertDays('999'), 365);
  check("'30.6' → 31（取整）", parseRefundAlertDays('30.6'), 31);

  /* ---------- B. getRefundAlerts ---------- */
  console.log('\n=== B. getRefundAlerts（超期未返款看板）===');

  const taker1 = { wechatName: '张三', wechatId: 'zhangsan_wx' };
  state.orders = [
    // 超期 45 天，未返款 → 纳入
    { id: 'o1', orderNo19: '19AAA', actualPayment: 100, baseCommission: 5, orderDate: daysAgoMidnight(45), isRefunded: false, isGoodReview: 'pending', takerId: 't1', taker: taker1 },
    // 超期 35 天，未返款 → 纳入
    { id: 'o2', orderNo19: '19BBB', actualPayment: 50, baseCommission: 5, orderDate: daysAgoMidnight(35), isRefunded: false, isGoodReview: 'reviewed', takerId: 't1', taker: taker1 },
    // 超期 40 天，**无接单人** → 计入 skippedNoTaker，不分组
    { id: 'o3', orderNo19: '19CCC', actualPayment: 80, baseCommission: 5, orderDate: daysAgoMidnight(40), isRefunded: false, isGoodReview: 'pending', takerId: null, taker: null },
    // 仅 10 天，未达阈值 → 被内存精确过滤排除
    { id: 'o4', orderNo19: '19DDD', actualPayment: 999, baseCommission: 5, orderDate: daysAgoMidnight(10), isRefunded: false, isGoodReview: 'pending', takerId: 't2', taker: { wechatName: '李四', wechatId: 'lisi_wx' } },
  ];

  const resB = makeRes();
  await getRefundAlerts({ query: { days: '30' } } as any, resB);

  // B1. where 必须是 lte（超期），**绝不能是 gte**（那是催单窗口）
  check('[B] where.isRefunded = false', state.orderFindManyArgs?.where?.isRefunded, false);
  check('[B] where.orderDate 使用 lte（超期语义，非 gte）', 'lte' in (state.orderFindManyArgs?.where?.orderDate ?? {}), true);
  check('[B] where.orderDate 不含 gte（未误用催单窗口语义）', 'gte' in (state.orderFindManyArgs?.where?.orderDate ?? {}), false);

  const payload = resB.payload?.data;
  check('[B] success = true', resB.payload?.success, true);
  check('[B] days = 30', payload?.days, 30);
  check('[B] summary.days = 30', payload?.summary?.days, 30);

  // B2. overdueDays 精确：45 天订单
  const g1 = (payload?.list || []).find((g: any) => g.takerId === 't1');
  const o1 = g1?.overdueOrders?.find((o: any) => o.orderId === 'o1');
  check('[B] 45 天订单 overdueDays = 45', o1?.overdueDays, 45);
  check('[B] 45 天订单 orderNo19 = 19AAA', o1?.orderNo19, '19AAA');
  const o2 = g1?.overdueOrders?.find((o: any) => o.orderId === 'o2');
  check('[B] 35 天订单 overdueDays = 35', o2?.overdueDays, 35);

  // B3. 未达阈值（10 天）被排除
  const allOrderIds = (payload?.list || []).flatMap((g: any) => g.overdueOrders.map((o: any) => o.orderId));
  check('[B] 10 天订单 o4 被排除', allOrderIds.includes('o4'), false);
  check('[B] 纳入的超期订单 = o1,o2', allOrderIds.sort(), ['o1', 'o2']);

  // B4. skippedNoTaker（o3 无接单人）
  check('[B] skippedNoTaker = 1（o3 未静默丢弃）', payload?.summary?.skippedNoTaker, 1);

  // B5. 汇总
  check('[B] totalTakers = 1', payload?.summary?.totalTakers, 1);
  check('[B] totalOrders = 2', payload?.summary?.totalOrders, 2);
  check('[B] totalAmount = 150', payload?.summary?.totalAmount, 150);
  check('[B] oldestOverdueDays = 45', payload?.summary?.oldestOverdueDays, 45);
  check('[B] 分组 totalAmount = 150', g1?.totalAmount, 150);
  check('[B] 分组 maxOverdueDays = 45', g1?.maxOverdueDays, 45);

  // B6. copyText 内容
  const ct = payload?.copyText || '';
  check('[B] copyText 含天数标题', ct.includes('超期未返款对账（超 30 天）'), true);
  check('[B] copyText 含接单人昵称', ct.includes('张三'), true);
  check('[B] copyText 含微信号', ct.includes('zhangsan_wx'), true);
  check('[B] copyText 含金额 150', ct.includes('¥150'), true);
  check('[B] copyText 含超期天数', ct.includes('已超期 45 天'), true);

  console.log('----- getRefundAlerts copyText 原文 -----');
  console.log(ct);
  console.log('----------------------------------------');

  /* ---------- B7. skippedNoTaker 谓词与分组一致（不静默丢弃）---------- */
  // 兜底保护：未来若把接单人外键策略改成软删除等，可能出现「takerId 有值但 taker 缺失」的
  // 孤儿订单。skippedNoTaker 的谓词必须与 groupOrdersByTaker 的 `!takerId || !taker` 一致，
  // 保证这类订单「要么进 list、要么进 skippedNoTaker」，绝不静默消失。
  console.log('\n=== B7. skippedNoTaker 谓词对齐（ghost taker / 无接单人）===');
  state.orders = [
    // takerId 有值但关联 taker 缺失（ghost）→ 分组会跳过，必须计入 skippedNoTaker
    { id: 'g1', orderNo19: 'G111', actualPayment: 100, baseCommission: 5, orderDate: daysAgoMidnight(50), isRefunded: false, isGoodReview: 'pending', takerId: 'tGhost', taker: null },
    // takerId 为空 → 同样计入
    { id: 'g2', orderNo19: 'G222', actualPayment: 100, baseCommission: 5, orderDate: daysAgoMidnight(50), isRefunded: false, isGoodReview: 'pending', takerId: null, taker: null },
    // 正常接单人 → 纳入分组（对照，确保不是把所有订单都算进 skipped）
    { id: 'g3', orderNo19: 'G333', actualPayment: 100, baseCommission: 5, orderDate: daysAgoMidnight(50), isRefunded: false, isGoodReview: 'pending', takerId: 't1', taker: { wechatName: '张三', wechatId: 'zhangsan_wx' } },
  ];
  const resB7 = makeRes();
  await getRefundAlerts({ query: { days: '30' } } as any, resB7);
  const p7 = resB7.payload?.data;
  const inList = (id: string) => (p7?.list || []).some((g: any) => g.overdueOrders.some((o: any) => o.orderId === id));
  check('[B7] ghost taker(g1) + 无接单人(g2) → skippedNoTaker = 2', p7?.summary?.skippedNoTaker, 2);
  check('[B7] g1(ghost taker) 不出现在 list', inList('g1'), false);
  check('[B7] g2(无接单人) 不出现在 list', inList('g2'), false);
  check('[B7] g3(有接单人) 出现在 list', inList('g3'), true);
  check('[B7] totalOrders = 1（仅 g3 纳入）', p7?.summary?.totalOrders, 1);

  /* ---------- C. getRemindList 重构等价性 ---------- */
  console.log('\n=== C. getRemindList 重构无行为变化（与重构前内联实现对比）===');

  state.takers = [{ id: 't1', wechatName: '张三', wechatId: 'zhangsan_wx', status: 'active' }];
  state.orders = [
    // 1 单无 takerId → 分组跳过
    { id: 'r0', orderNo19: 'R000', actualPayment: 70, baseCommission: 5, orderDate: daysAgoMidnight(3), isRefunded: false, isGoodReview: 'pending', takerId: null, taker: null },
    // 1 单已返款且已好评 → 不计入任何待办
    { id: 'r1', orderNo19: 'R111', actualPayment: 100, baseCommission: 5, orderDate: daysAgoMidnight(2), isRefunded: true, isGoodReview: 'reviewed', takerId: 't1', taker: { wechatName: '张三', wechatId: 'zhangsan_wx' } },
    // 1 单未返款且未好评 → 待返款 + 待好评
    { id: 'r2', orderNo19: 'R222', actualPayment: 200, baseCommission: 8, orderDate: daysAgoMidnight(1), isRefunded: false, isGoodReview: 'creating', takerId: 't1', taker: { wechatName: '张三', wechatId: 'zhangsan_wx' } },
  ];

  const resC = makeRes();
  await getRemindList({ query: { type: 'both' } } as any, resC);
  const actual = resC.payload?.data;
  const legacy = legacyRemindList(state.orders);

  check('[C] totalTakers 与重构前一致', actual?.totalTakers, legacy.totalTakers);
  check('[C] totalPendingOrders 与重构前一致', actual?.totalPendingOrders, legacy.totalPendingOrders);
  check('[C] list 与重构前逐字一致', actual?.list, legacy.list);
  check('[C] copyText 与重构前逐字一致（剥离生成时间）', stripTime(actual?.copyText || ''), stripTime(legacy.copyText));
  check('[C] 仅 1 人需处理', actual?.totalTakers, 1);
  check('[C] totalPending = 待返款1 + 待好评1 = 2', actual?.list?.[0]?.totalPending, 2);
  check('[C] 待返款订单 = r2', actual?.list?.[0]?.unpaidOrders?.map((o: any) => o.orderId), ['r2']);
  check('[C] 待好评订单 = r2', actual?.list?.[0]?.unreviewedOrders?.map((o: any) => o.orderId), ['r2']);
  check('[C] 无 takerId 的 r0 未进入分组', (actual?.list || []).some((g: any) =>
    [...(g.unpaidOrders || []), ...(g.unreviewedOrders || [])].some((o: any) => o.orderId === 'r0')), false);

  console.log('----- getRemindList copyText 原文（重构后）-----');
  console.log(actual?.copyText);
  console.log('-----------------------------------------------');

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
