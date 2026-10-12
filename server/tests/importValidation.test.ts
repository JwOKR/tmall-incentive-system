/**
 * importValidation.test.ts —— Orders 导入「预校验 + 错误行号回显」的行为自证
 *
 * 覆盖第 2 批之二的两项后端改动：
 *   1. validateBatchOrders —— 只读批量预校验：
 *      - 5 行样本（1 正常 / 1 双单号全空 / 1 实付金额为负 / 1 库内重复 / 1 本批内重复）
 *        各自 status 与 reason 正确，且 row = 入参下标 + 2（Excel 行号，表头占第 1 行）；
 *      - **只读证明**：调用后 fake prisma 的写方法（create/update/delete/upsert）零调用；
 *      - 批量查库（避免 N+1）：整批只触发 **1 次** order.findMany。
 *   2. batchCreateOrders —— details / errors 每项都带 row（= 下标 + 2），
 *      且写入语义不变（成功 / 跳过 / 失败计数与 create 调用次数符合预期）。
 *
 * 手法：沿用 secfixRegression.test.ts —— 在加载业务源码前用 require.cache 预注入
 *       fake prisma（同时注入反斜杠 / 正斜杠两种路径键）与 fake logger，随后驱动
 *       **真实**的 orderService 逻辑。
 *
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */

process.env.JWT_SECRET = 'import-validation-test-secret';

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
  /** validateBatchOrders 批量查库返回的「库内已有订单」 */
  dbExistingOrders: any[];
  /** 库内已存在的 orderNo / orderNo19（供 batchCreateOrders 的逐条查重 findFirst 判定） */
  dbOrderNoSet: Set<string>;
  dbOrderNo19Set: Set<string>;
  /** 写方法调用计数（只读证明的核心） */
  writes: { create: number; update: number; delete: number; upsert: number };
  /** order.findMany 调用次数（N+1 证明） */
  findManyCallCount: number;
  /** 最近一次 order.findMany 的入参（校验批量查库形状） */
  lastFindManyArgs: any;
  /** batchCreateOrders 实际创建的订单数据 */
  createdOrders: any[];
} = {
  dbExistingOrders: [],
  dbOrderNoSet: new Set<string>(),
  dbOrderNo19Set: new Set<string>(),
  writes: { create: 0, update: 0, delete: 0, upsert: 0 },
  findManyCallCount: 0,
  lastFindManyArgs: null,
  createdOrders: [],
};

const fakePrisma: any = {
  order: {
    findMany: async (args: any) => {
      state.findManyCallCount++;
      state.lastFindManyArgs = args;
      // 预校验的批量查库形状：{ where: { OR: [...] }, select: {...} }
      if (args && args.where && Array.isArray(args.where.OR)) {
        return state.dbExistingOrders;
      }
      return [];
    },
    findFirst: async (args: any) => {
      const w = args?.where || {};
      if (w.orderNo && state.dbOrderNoSet.has(w.orderNo)) return { id: 'db-' + w.orderNo, orderNo: w.orderNo };
      if (w.orderNo19 && state.dbOrderNo19Set.has(w.orderNo19)) return { id: 'db-' + w.orderNo19, orderNo19: w.orderNo19 };
      return null;
    },
    findUnique: async () => null,
    create: async (args: any) => {
      state.writes.create++;
      // 模拟某一行写入时抛错，用于验证 errors 也带行号
      if (args?.data?.orderNo === 'BOOM') throw new Error('模拟写入失败');
      state.createdOrders.push(args?.data);
      return { id: 'new-' + state.writes.create };
    },
    update: async (args: any) => {
      state.writes.update++;
      return { id: args?.where?.id };
    },
    delete: async () => {
      state.writes.delete++;
      return {};
    },
    upsert: async () => {
      state.writes.upsert++;
      return {};
    },
    count: async () => 0,
  },
  orderTaker: {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => [],
    update: async () => {
      state.writes.update++;
      return {};
    },
    create: async () => ({ id: 'x' }),
  },
  task: {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => [],
    update: async () => {
      state.writes.update++;
      return {};
    },
    create: async () => ({ id: 'x' }),
  },
  user: { findMany: async () => [], findUnique: async () => null },
  log: { findMany: async () => [], create: async () => ({}) },
  repeatDiscount: { findMany: async () => [], findUnique: async () => null, create: async () => ({ id: 'x' }) },
  systemSetting: { findMany: async () => [], findUnique: async () => null, upsert: async () => ({}) },
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
 * 1. 加载真实模块
 * ============================================================ */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderService = require('../src/services/orderService');
const validateBatchOrders = orderService.validateBatchOrders;
const batchCreateOrders = orderService.batchCreateOrders;

const resetWrites = () => { state.writes = { create: 0, update: 0, delete: 0, upsert: 0 }; };
const totalWrites = () => state.writes.create + state.writes.update + state.writes.delete + state.writes.upsert;

/* ============================================================
 * 2. 用例
 * ============================================================ */
(async () => {
  /* ---------- A. validateBatchOrders：5 行样本判定 + 行号 ---------- */
  console.log('\n=== A. validateBatchOrders：5 行样本 ===');

  // 库内已存在 A-DUP（接单人「王五」）
  state.dbExistingOrders = [
    { orderNo: 'A-DUP', orderNo19: null, taker: { wechatName: '王五' } },
  ];

  const rows = [
    { orderNo: 'A-OK', orderNo19: '', actualPayment: 100 },              // 下标 0 → 第 2 行：正常
    { orderNo: '', orderNo19: '', actualPayment: 50 },                   // 下标 1 → 第 3 行：双单号全空
    { orderNo: 'A-NEG', orderNo19: '', actualPayment: -5 },             // 下标 2 → 第 4 行：金额为负
    { orderNo: 'A-DUP', orderNo19: '', actualPayment: 20 },             // 下标 3 → 第 5 行：库内重复
    { orderNo: 'A-OK', orderNo19: '', actualPayment: 30 },              // 下标 4 → 第 6 行：本批内重复
  ];

  // 只读证明：调用前把写计数与 findMany 计数归零
  resetWrites();
  state.findManyCallCount = 0;

  const v = await validateBatchOrders(rows);

  // 行号 = 下标 + 2
  check('[A] 第 1 行（下标 0）→ status=ok, row=2', v.rows[0], { row: 2, status: 'ok' });
  check('[A] 第 2 行（下标 1）→ invalid：双单号全空, row=3', v.rows[1],
    { row: 3, status: 'invalid', reason: '订单编号与19订单号至少填写一个' });
  check('[A] 第 3 行（下标 2）→ invalid：实付金额非法, row=4', v.rows[2],
    { row: 4, status: 'invalid', reason: '实付金额非法' });
  check('[A] 第 4 行（下标 3）→ dup：库内重复（带接单人）, row=5', v.rows[3],
    { row: 5, status: 'dup', reason: '订单编号已存在（接单人 王五）' });
  check('[A] 第 5 行（下标 4）→ dup：本文件内重复（引用第 2 行）, row=6', v.rows[4],
    { row: 6, status: 'dup', reason: '本文件内重复（第 2 行已出现）' });

  check('[A] summary 汇总', v.summary, { total: 5, ok: 1, dup: 2, invalid: 2 });

  // 只读证明 + 批量查库（无 N+1）
  check('[A][只读] 调用 validate 后 create 调用数 = 0', state.writes.create, 0);
  check('[A][只读] 调用 validate 后 update 调用数 = 0', state.writes.update, 0);
  check('[A][只读] 调用 validate 后 delete 调用数 = 0', state.writes.delete, 0);
  check('[A][只读] 调用 validate 后 upsert 调用数 = 0', state.writes.upsert, 0);
  check('[A][只读] 调用 validate 后写方法总调用数 = 0', totalWrites(), 0);
  check('[A][无N+1] 整批 only 1 次 order.findMany', state.findManyCallCount, 1);
  check('[A][无N+1] findMany 用批量 OR in 形式',
    Array.isArray(state.lastFindManyArgs?.where?.OR), true);

  /* ---------- B. batchCreateOrders：details / errors 均带 row ---------- */
  console.log('\n=== B. batchCreateOrders：details / errors 带行号 ===');

  // 库内已有 A-DUP；本批：正常 / 库内重复(跳过) / 写入抛错(失败)
  state.dbOrderNoSet = new Set(['A-DUP']);
  state.dbOrderNo19Set = new Set();
  state.createdOrders = [];
  resetWrites();

  const importRows = [
    { orderNo: 'NEW-1' },  // 下标 0 → 第 2 行：成功
    { orderNo: 'A-DUP' },  // 下标 1 → 第 3 行：库内重复 → skipped
    { orderNo: 'BOOM' },   // 下标 2 → 第 4 行：create 抛错 → failed
  ];

  const r = await batchCreateOrders(importRows);

  check('[B] 计数：success=1 skipped=1 failed=0... 实际 failed=1（BOOM 抛错）',
    { success: r.success, skipped: r.skipped, failed: r.failed }, { success: 1, skipped: 1, failed: 1 });

  const detailRows = r.details.map((d: any) => d.row);
  check('[B] details 行号 = [2,3]', detailRows, [2, 3]);
  check('[B] details 每项都带数字 row', r.details.every((d: any) => typeof d.row === 'number'), true);
  check('[B] details[0] = 成功（row=2, orderNo=NEW-1）',
    { row: r.details[0].row, orderNo: r.details[0].orderNo, status: r.details[0].status },
    { row: 2, orderNo: 'NEW-1', status: 'success' });
  check('[B] details[1] = 跳过（row=3, 订单编号已存在）',
    { row: r.details[1].row, orderNo: r.details[1].orderNo, status: r.details[1].status, reason: r.details[1].reason },
    { row: 3, orderNo: 'A-DUP', status: 'skipped', reason: '订单编号已存在' });

  check('[B] errors 每项都带数字 row', r.errors.every((e: any) => typeof e.row === 'number'), true);
  check('[B] errors[0] 带行号 = 4（BOOM 位于第 4 行）',
    { row: r.errors[0].row, orderNo: r.errors[0].orderNo, message: r.errors[0].message },
    { row: 4, orderNo: 'BOOM', message: '模拟写入失败' });

  // 写入语义不变：只为 NEW-1 与 BOOM 发起 create（BOOM 抛错前已计数）
  check('[B] create 调用次数 = 2（NEW-1 成功 + BOOM 抛错）', state.writes.create, 2);
  check('[B] 实际写入库的订单仅 1 条（BOOM 抛错未落库）', state.createdOrders.length, 1);
  check('[B] 落库订单 orderNo = NEW-1', state.createdOrders[0]?.orderNo, 'NEW-1');

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
