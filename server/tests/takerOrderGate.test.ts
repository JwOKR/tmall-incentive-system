/**
 * 接单限制（账号资质合格才能接单）回归测试
 *
 * 覆盖两层：
 *   1. 纯函数层：canTakeOrders / describeComplianceBlock（文案单一来源）
 *   2. Controller 层：真实的 taskController.quickOrder（用 require.cache 注入 fake prisma，
 *      不连数据库），证明「资质不合格时 force=true 仍被拒」「拒绝时未调用 $transaction」
 *
 * 口径（用户已确认）：
 *   - 只有 status === 'qualified' 能接单；unqualified / incomplete 一律拦下
 *   - 只拦截「快速接单」入口，Excel 批量导入订单不受影响
 *   - force 仅用于绕过 7 天接单间隔，对资质门槛无效
 */
import {
  evaluateTakerCompliance,
  canTakeOrders,
  describeComplianceBlock,
  type TakerComplianceInput,
} from '../src/utils/takerCompliance';

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

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** 一份全部达标的资质基线 */
const GOOD: TakerComplianceInput = {
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: true,
  creditLevel: '3心',
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
  screenshotCount: 3,
};

/* ============================================================
 * 1. 门槛判定：只有 qualified 放行
 * ============================================================ */
console.log('\n=== 1. canTakeOrders 门槛 ===');
check('合格 → 允许接单', canTakeOrders(evaluateTakerCompliance(GOOD)), true);
check(
  '不合格 → 拦截',
  canTakeOrders(evaluateTakerCompliance({ ...GOOD, isRealNameVerified: false })),
  false
);
check(
  '待完善 → 拦截',
  canTakeOrders(
    evaluateTakerCompliance({
      registerDate: null,
      isRealNameVerified: false,
      creditLevel: null,
      weeklyReceiptCount: null,
      monthlyReceiptCount: null,
      screenshotCount: 0,
    })
  ),
  false
);

/* ============================================================
 * 2. 三种 fails 各自单独触发时都被拦，且文案含对应关键词
 * ============================================================ */
console.log('\n=== 2. 单项不通过 → 拦截 + 文案含对应原因 ===');

const shortRegister = evaluateTakerCompliance({
  ...GOOD,
  registerDate: new Date(now - 100 * DAY),
});
check('注册未满一年 → status', shortRegister.status, 'unqualified');
check('注册未满一年 → 拦截', canTakeOrders(shortRegister), false);
check(
  '注册未满一年 → 文案含「注册未满一年」',
  describeComplianceBlock(shortRegister).includes('注册未满一年'),
  true
);

const noRealName = evaluateTakerCompliance({ ...GOOD, isRealNameVerified: false });
check('未完成实名 → status', noRealName.status, 'unqualified');
check('未完成实名 → 拦截', canTakeOrders(noRealName), false);
check(
  '未完成实名 → 文案含「未完成实名认证」',
  describeComplianceBlock(noRealName).includes('未完成实名认证'),
  true
);

const lowCredit = evaluateTakerCompliance({ ...GOOD, creditLevel: '2心' });
check('信誉 2心 → status', lowCredit.status, 'unqualified');
check('信誉 2心 → 拦截', canTakeOrders(lowCredit), false);
check(
  '信誉 2心 → 文案含「信誉等级不足3心」',
  describeComplianceBlock(lowCredit).includes('信誉等级不足3心'),
  true
);

/* ============================================================
 * 3. incomplete（从未登记资质）被拦，文案为「待完善」
 * ============================================================ */
console.log('\n=== 3. 从未登记资质（neverRegistered）→ 待完善，被拦 ===');
const neverRegistered = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
});
check('status = incomplete', neverRegistered.status, 'incomplete');
check('拦截', canTakeOrders(neverRegistered), false);
check('文案含「待完善」', describeComplianceBlock(neverRegistered).includes('待完善'), true);
check(
  '文案不含「不合格」',
  describeComplianceBlock(neverRegistered).includes('不合格'),
  false
);

/* ============================================================
 * 4. 只填周 / 月收货次数 → 仍是 incomplete，被拦
 *    （证明周月不构成「登记过资质」，也不是合格条件）
 * ============================================================ */
console.log('\n=== 4. 只填周/月收货次数 → 仍为待完善，被拦 ===');
const onlyReceipt = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: 3,
  monthlyReceiptCount: 10,
  screenshotCount: 0,
});
check('status = incomplete', onlyReceipt.status, 'incomplete');
check('拦截', canTakeOrders(onlyReceipt), false);
check('文案含「待完善」', describeComplianceBlock(onlyReceipt).includes('待完善'), true);
check('fails 为空', onlyReceipt.fails, []);

// 周月超限不构成拦截理由（参考项不参与判定）
const overLimit = evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 9, monthlyReceiptCount: 30 });
check('周月超限但三项核心达标 → 放行', canTakeOrders(overLimit), true);

/* ============================================================
 * 5. describeComplianceBlock 文案输出
 * ============================================================ */
console.log('\n=== 5. describeComplianceBlock 文案 ===');
const multi = evaluateTakerCompliance({
  registerDate: new Date(now - 100 * DAY),
  isRealNameVerified: false,
  creditLevel: '3心',
  screenshotCount: 0,
});
check('status = unqualified', multi.status, 'unqualified');
check(
  'unqualified 文案 = 前缀 + fails 用「、」连接',
  describeComplianceBlock(multi),
  '该接单人账号资质不合格：注册未满一年、未完成实名认证'
);
check(
  'unqualified 但 fails 为空 → 兜底文案',
  describeComplianceBlock({ status: 'unqualified', fails: [] }),
  '该接单人账号资质不合格'
);
check(
  'incomplete 且 fails 为空 → 纯待完善文案',
  describeComplianceBlock({ status: 'incomplete', fails: [] }),
  '该接单人账号资质待完善（尚未登记资质信息）'
);
check(
  'incomplete 且 fails 非空 → 追加原因',
  describeComplianceBlock({ status: 'incomplete', fails: ['未完成实名认证'] }),
  '该接单人账号资质待完善（尚未登记资质信息）：未完成实名认证'
);
check('qualified → 空串（不拦截）', describeComplianceBlock({ status: 'qualified', fails: [] }), '');

/* ============================================================
 * 6. Controller 层：真实 quickOrder（require.cache 注入 fake prisma）
 * ============================================================ */
console.log('\n=== 6. taskController.quickOrder 真实驱动（fake prisma）===');

/** 每次用例可换的假数据 / 调用记录 */
const state: {
  taker: any;
  recentOrder: any;
  transactionCalled: boolean;
  orderCreateCalled: boolean;
  takerUpdateCalled: boolean;
} = {
  taker: null,
  recentOrder: null,
  transactionCalled: false,
  orderCreateCalled: false,
  takerUpdateCalled: false,
};

const fakePrisma = {
  task: {
    findUnique: async () => ({
      id: 'task-1',
      status: 'active',
      currentOrders: 0,
      maxOrders: 10,
      productId: 'p1',
      productCode: 'c1',
      price: 100,
      baseCommission: 5,
      reviewReward: 0,
    }),
    update: async () => ({}),
  },
  orderTaker: {
    findUnique: async () => state.taker,
    update: async () => {
      state.takerUpdateCalled = true;
      return {};
    },
  },
  order: {
    findFirst: async () => state.recentOrder,
    create: async () => {
      state.orderCreateCalled = true;
      return { id: 'order-1' };
    },
  },
  log: { create: async () => ({}) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    state.transactionCalled = true;
    return fn(fakePrisma);
  },
};

// 在加载 controller 之前把 `../utils/db` 换成假实现，避免初始化真实 PrismaClient
const dbPath = require.resolve('../src/utils/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { __esModule: true, default: fakePrisma },
  children: [],
  paths: [],
} as unknown as NodeModule;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { quickOrder } = require('../src/controllers/taskController');

/** 构造最小的 express req / res */
function makeReqRes(body: Record<string, unknown>): { req: any; res: any } {
  const req: any = { body, headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' };
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.payload = payload;
      return res;
    },
  };
  return { req, res };
}

async function runQuickOrder(takerRecord: any, force: boolean): Promise<{ res: any }> {
  state.taker = takerRecord;
  state.recentOrder = null;
  state.transactionCalled = false;
  state.orderCreateCalled = false;
  state.takerUpdateCalled = false;
  const { req, res } = makeReqRes({ taskId: 'task-1', takerId: 'taker-1', force });
  await quickOrder(req, res);
  return { res };
}

(async () => {
  // 6.1 合格接单人 → 放行，走事务
  const ok = await runQuickOrder(
    {
      id: 'taker-1',
      wechatName: '合格号',
      registerDate: new Date(now - 500 * DAY),
      isRealNameVerified: true,
      creditLevel: '3心',
      weeklyReceiptCount: 1,
      monthlyReceiptCount: 1,
      screenshotCount: 3,
    },
    false
  );
  check('合格 → HTTP 201', ok.res.statusCode, 201);
  check('合格 → success = true', ok.res.payload?.success, true);
  check('合格 → 调用了 $transaction', state.transactionCalled, true);
  check('合格 → 事务内创建了订单', state.orderCreateCalled, true);

  // 6.2 不合格（注册未满一年 + 未实名）+ force=true → 仍被拒
  const bad = await runQuickOrder(
    {
      id: 'taker-2',
      wechatName: '不合格号',
      registerDate: new Date(now - 100 * DAY),
      isRealNameVerified: false,
      creditLevel: '3心',
      weeklyReceiptCount: 1,
      monthlyReceiptCount: 1,
      screenshotCount: 3,
    },
    true
  );
  check('不合格 + force=true → HTTP 403', bad.res.statusCode, 403);
  check('不合格 + force=true → code', bad.res.payload?.code, 'TAKER_NOT_QUALIFIED');
  check('不合格 + force=true → success = false', bad.res.payload?.success, false);
  check(
    '不合格文案含两项原因',
    String(bad.res.payload?.message || '') ===
      '该接单人账号资质不合格：注册未满一年、未完成实名认证',
    true
  );
  check('不合格 → 未调用 $transaction（无副作用）', state.transactionCalled, false);
  check('不合格 → 未创建订单', state.orderCreateCalled, false);
  check('不合格 → 未更新接单人统计', state.takerUpdateCalled, false);

  // 6.3 待完善（从未登记资质）→ 被拒
  const inc = await runQuickOrder(
    {
      id: 'taker-3',
      wechatName: '待完善号',
      registerDate: null,
      isRealNameVerified: false,
      creditLevel: null,
      weeklyReceiptCount: null,
      monthlyReceiptCount: null,
      screenshotCount: 0,
    },
    false
  );
  check('待完善 → HTTP 403', inc.res.statusCode, 403);
  check('待完善 → code', inc.res.payload?.code, 'TAKER_NOT_QUALIFIED');
  check(
    '待完善文案',
    inc.res.payload?.message,
    '该接单人账号资质待完善（尚未登记资质信息）'
  );
  check('待完善 → 未调用 $transaction', state.transactionCalled, false);

  // 6.4 只填周/月收货次数 → 仍被拒（周月不构成资质登记）
  const onlyReceiptCase = await runQuickOrder(
    {
      id: 'taker-4',
      wechatName: '只填周月号',
      registerDate: null,
      isRealNameVerified: false,
      creditLevel: null,
      weeklyReceiptCount: 3,
      monthlyReceiptCount: 10,
      screenshotCount: 0,
    },
    true
  );
  check('只填周月 + force=true → HTTP 403', onlyReceiptCase.res.statusCode, 403);
  check(
    '只填周月 → 文案含「待完善」',
    String(onlyReceiptCase.res.payload?.message || '').includes('待完善'),
    true
  );
  check('只填周月 → 未调用 $transaction', state.transactionCalled, false);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})();
