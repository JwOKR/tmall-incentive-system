/**
 * takerPayee.test.ts —— 接单人「收款信息 + 风控标记」全链路回归测试（第 5 批 A1）
 *
 * 覆盖：
 *   A. createTaker        —— 4 个新字段（payeeName / payeeAccount / riskFlag / blacklistReason）落库
 *   B. updateTaker        —— 4 字段落库 + 「不传不覆盖」+ riskFlag:false 真布尔语义
 *   C. batchCreateTakers  —— Excel 批量导入路径同样落库 4 字段
 *   D. backupController.importBackup —— 备份还原映射含 4 字段（否则还原丢字段）
 *   E. quickOrder 风控硬拦截 —— riskFlag:true / status:'suspended' → 403 TAKER_RISK_BLOCKED，
 *      且 force:true 不能绕过、$transaction 未被调用（零副作用）；控制组证明守卫未误伤
 *
 * 手法：require.cache 预注入 fake prisma（**同时注入 `\` 与 `/` 两种路径键**）驱动真实 controller，
 *       不连数据库。写方法统一走 writeGuard（记录调用名并 throw），用于证明拦截发生在 $transaction 之前。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */
import { evaluateTakerRisk, describeRiskBlock } from '../src/utils/takerRisk';

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
 * fake prisma
 * ============================================================ */
const state: {
  takerCreated: any;      // 最近一次 orderTaker.create 的 data
  takerUpdated: any;      // 最近一次 orderTaker.update 的 data
  createdCalls: number;
  updatedCalls: number;
  writeAttempts: string[]; // 任何写方法（含 $transaction）被调用的记录
  transactionCalls: number;
  existingById: any;       // findUnique({where:{id}}) —— updateTaker / quickOrder 都会用到
  existingByWechatId: any; // createTaker / batchCreateTakers 的唯一性检查
} = {
  takerCreated: null,
  takerUpdated: null,
  createdCalls: 0,
  updatedCalls: 0,
  writeAttempts: [],
  transactionCalls: 0,
  existingById: null,
  existingByWechatId: null,
};

function writeGuard(name: string) {
  return async () => {
    state.writeAttempts.push(name);
    throw new Error('WRITE DETECTED: ' + name);
  };
}

const fakePrisma: any = {
  orderTaker: {
    findUnique: async (args: any) => {
      if (args?.where?.id) return state.existingById;
      return state.existingByWechatId;
    },
    create: async (args: any) => {
      state.createdCalls++;
      state.takerCreated = args.data;
      return { id: 'created-id', ...args.data };
    },
    update: async (args: any) => {
      state.updatedCalls++;
      state.takerUpdated = args.data;
      return { id: args.where.id, ...args.data };
    },
    findMany: async () => [],
    delete: writeGuard('orderTaker.delete'),
    updateMany: writeGuard('orderTaker.updateMany'),
    upsert: writeGuard('orderTaker.upsert'),
  },
  task: {
    findUnique: async () => state.task,
    update: writeGuard('task.update'),
  },
  order: {
    findFirst: async () => null,
    create: writeGuard('order.create'),
    update: writeGuard('order.update'),
  },
  log: {
    create: async () => ({}),
  },
  $transaction: async () => {
    state.transactionCalls++;
    state.writeAttempts.push('$transaction');
    throw new Error('WRITE DETECTED: $transaction');
  },
};

// quickOrder 取到的任务
let QUICK_TASK: any = null;

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
const { createTaker, updateTaker, batchCreateTakers } = require('../src/controllers/takerController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { quickOrder } = require('../src/controllers/taskController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importBackup } = require('../src/controllers/backupController');

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

/** 构造最小 express req：headers/ip 齐备，避免 getClientIp 抛错导致误判 500 */
function mkReq(extra: Record<string, unknown>): any {
  return { headers: {}, ip: '127.0.0.1', ...extra };
}

function resetWrites(): void {
  state.writeAttempts = [];
  state.transactionCalls = 0;
}

/* ============================================================
 * 用例
 * ============================================================ */
(async () => {
  /* ---------- 0. takerRisk 纯函数（单一数据源）---------- */
  console.log('\n=== 0. takerRisk.evaluateTakerRisk（单一数据源）===');
  check('[0] riskFlag:true → blocked', evaluateTakerRisk({ riskFlag: true }).blocked, true);
  check('[0] status:suspended → blocked', evaluateTakerRisk({ status: 'suspended' }).blocked, true);
  check('[0] active + riskFlag:false → 不拦截', evaluateTakerRisk({ status: 'active', riskFlag: false }).blocked, false);
  check('[0] status:inactive → 不拦截（停用≠拉黑）', evaluateTakerRisk({ status: 'inactive' }).blocked, false);
  check('[0] 空对象 → 不拦截', evaluateTakerRisk({}).blocked, false);
  check('[0] describeRiskBlock：riskFlag 命中含原因', describeRiskBlock({ riskFlag: true, blacklistReason: '恶意退款' }), '该接单人已被风控拦截（账号已被风控标记）：恶意退款');
  check('[0] describeRiskBlock：suspended 命中', describeRiskBlock({ status: 'suspended' }), '该接单人已被风控拦截（账号已被拉黑/暂停）');
  check('[0] describeRiskBlock：未命中返回空串', describeRiskBlock({ status: 'active' }), '');

  /* ---------- A. createTaker ---------- */
  console.log('\n=== A. createTaker 落库 4 字段 ===');
  state.existingByWechatId = null;
  state.takerCreated = null;
  state.createdCalls = 0;
  {
    const res = makeRes();
    await createTaker(
      mkReq({
        userId: 'u1',
        body: {
          wechatName: '新接单人',
          wechatId: 'wx_new_pay',
          payeeName: '张三',
          payeeAccount: 'alipay@example.com',
          riskFlag: true,
          blacklistReason: '创建即风控',
        },
      }),
      res
    );
    check('[A] HTTP 201', res.statusCode, 201);
    check('[A] orderTaker.create 调用 1 次', state.createdCalls, 1);
    check('[A] payeeName 落库', state.takerCreated?.payeeName, '张三');
    check('[A] payeeAccount 落库', state.takerCreated?.payeeAccount, 'alipay@example.com');
    check('[A] riskFlag 落库 = true', state.takerCreated?.riskFlag, true);
    check('[A] blacklistReason 落库', state.takerCreated?.blacklistReason, '创建即风控');
  }

  /* ---------- B. updateTaker ---------- */
  console.log('\n=== B. updateTaker 4 字段 + 不传不覆盖 + 布尔语义 ===');
  state.existingById = { id: 'taker-1', wechatId: 'wx1', status: 'active', payeeAccount: 'OLD_ACC', payeeName: '旧名' };

  // B1：显式传全 4 字段 → 全部落库
  state.takerUpdated = null;
  {
    const res = makeRes();
    await updateTaker(
      mkReq({
        params: { id: 'taker-1' },
        userId: 'u1',
        body: {
          wechatName: '接单人1',
          wechatId: 'wx1',
          payeeName: '李四',
          payeeAccount: 'new_acc_888',
          riskFlag: true,
          blacklistReason: '手动风控',
        },
      }),
      res
    );
    check('[B1] payeeName 落库', state.takerUpdated?.payeeName, '李四');
    check('[B1] payeeAccount 落库', state.takerUpdated?.payeeAccount, 'new_acc_888');
    check('[B1] riskFlag 落库 = true', state.takerUpdated?.riskFlag, true);
    check('[B1] blacklistReason 落库', state.takerUpdated?.blacklistReason, '手动风控');
  }

  // B2：不传 payeeAccount → 不得出现在 update data（原值不被覆盖）
  state.takerUpdated = null;
  {
    const res = makeRes();
    await updateTaker(
      mkReq({ params: { id: 'taker-1' }, userId: 'u1', body: { wechatName: '接单人1', wechatId: 'wx1' } }),
      res
    );
    check('[B2] 不传 payeeAccount → data 无 payeeAccount 键', 'payeeAccount' in (state.takerUpdated ?? {}), false);
    check('[B2] 不传 payeeName → data 无 payeeName 键', 'payeeName' in (state.takerUpdated ?? {}), false);
    check('[B2] 不传 riskFlag → data 无 riskFlag 键', 'riskFlag' in (state.takerUpdated ?? {}), false);
    check('[B2] 不传 blacklistReason → data 无 blacklistReason 键', 'blacklistReason' in (state.takerUpdated ?? {}), false);
  }

  // B3：riskFlag:false 必须真正生效（真布尔语义，不能被真值判断吞掉）
  state.takerUpdated = null;
  {
    const res = makeRes();
    await updateTaker(
      mkReq({ params: { id: 'taker-1' }, userId: 'u1', body: { wechatName: '接单人1', wechatId: 'wx1', riskFlag: false } }),
      res
    );
    check('[B3] riskFlag:false → data.riskFlag === false（取消风控生效）', state.takerUpdated?.riskFlag, false);
    check('[B3] riskFlag:false 确实写入了该键', 'riskFlag' in (state.takerUpdated ?? {}), true);
  }

  // B4：解除风控组合（status=active + riskFlag=false + blacklistReason=null）
  state.takerUpdated = null;
  {
    const res = makeRes();
    await updateTaker(
      mkReq({
        params: { id: 'taker-1' },
        userId: 'u1',
        body: { wechatName: '接单人1', wechatId: 'wx1', status: 'active', riskFlag: false, blacklistReason: null },
      }),
      res
    );
    check('[B4] 解除：status = active', state.takerUpdated?.status, 'active');
    check('[B4] 解除：riskFlag = false', state.takerUpdated?.riskFlag, false);
    check('[B4] 解除：blacklistReason = null', state.takerUpdated?.blacklistReason, null);
  }

  /* ---------- C. batchCreateTakers ---------- */
  console.log('\n=== C. batchCreateTakers 落库 4 字段 ===');
  state.existingByWechatId = null;
  state.takerCreated = null;
  state.createdCalls = 0;
  {
    const res = makeRes();
    await batchCreateTakers(
      mkReq({
        userId: 'u1',
        body: {
          takers: [
            {
              wechatName: '批量接单人',
              wechatId: 'wx_batch_pay',
              payeeName: '王五',
              payeeAccount: 'bank_6222_0000',
              riskFlag: true,
              blacklistReason: '批量导入风控',
            },
          ],
        },
      }),
      res
    );
    check('[C] 导入成功 1 条', res.payload?.data?.success, 1);
    check('[C] payeeName 落库', state.takerCreated?.payeeName, '王五');
    check('[C] payeeAccount 落库', state.takerCreated?.payeeAccount, 'bank_6222_0000');
    check('[C] riskFlag 落库 = true', state.takerCreated?.riskFlag, true);
    check('[C] blacklistReason 落库', state.takerCreated?.blacklistReason, '批量导入风控');
  }

  /* ---------- D. backupController.importBackup ---------- */
  console.log('\n=== D. importBackup 映射含 4 字段（备份还原不丢字段）===');
  state.takerCreated = null;
  state.createdCalls = 0;
  {
    const res = makeRes();
    await importBackup(
      mkReq({
        body: {
          mode: 'overwrite',
          data: {
            orderTakers: [
              {
                id: 'bk-t1',
                wechatName: '备份接单人',
                wechatId: 'wx_bk',
                status: 'suspended',
                payeeName: '赵六',
                payeeAccount: 'bk_acc_001',
                riskFlag: true,
                blacklistReason: '备份原因',
              },
            ],
          },
        },
      }),
      res
    );
    check('[D] 接单人还原 1 条', res.payload?.data?.takers?.created, 1);
    check('[D] payeeName 还原', state.takerCreated?.payeeName, '赵六');
    check('[D] payeeAccount 还原', state.takerCreated?.payeeAccount, 'bk_acc_001');
    check('[D] riskFlag 还原 = true', state.takerCreated?.riskFlag, true);
    check('[D] blacklistReason 还原', state.takerCreated?.blacklistReason, '备份原因');
    check('[D] status=suspended 还原', state.takerCreated?.status, 'suspended');
  }

  /* ---------- E. quickOrder 风控硬拦截 ---------- */
  console.log('\n=== E. quickOrder 风控硬拦截（$transaction 前、零副作用）===');
  QUICK_TASK = {
    id: 'task-1',
    status: 'active',
    currentOrders: 0,
    maxOrders: 5,
    productId: 'p1',
    productCode: 'c1',
    baseCommission: 5,
    reviewReward: 0,
    price: 100,
  };
  // fake 的 task.findUnique 读取 QUICK_TASK（避免闭包 TDZ）
  (fakePrisma.task as any).findUnique = async () => QUICK_TASK;

  /** quickOrder 与 updateTaker 都走 findUnique({where:{id}}) —— 统一用 existingById 提供接单人 */
  function setQuickTaker(t: any) {
    state.existingById = t;
  }

  // E1：riskFlag:true → 403 TAKER_RISK_BLOCKED，且未进入事务
  resetWrites();
  setQuickTaker({ id: 'taker-1', wechatName: '风控人', wechatId: 'wx_risk', status: 'active', riskFlag: true, blacklistReason: '恶意退款' });
  {
    const res = makeRes();
    await quickOrder(mkReq({ userId: 'u1', body: { taskId: 'task-1', takerId: 'taker-1', orderNo: 'NO-1' } }), res);
    check('[E1] HTTP 403', res.statusCode, 403);
    check('[E1] code = TAKER_RISK_BLOCKED', res.payload?.code, 'TAKER_RISK_BLOCKED');
    check('[E1] 响应带 blacklistReason', res.payload?.blacklistReason, '恶意退款');
    check('[E1] success = false', res.payload?.success, false);
    check('[E1] $transaction 未被调用（零副作用）', state.transactionCalls, 0);
    check('[E1] 无任何写方法被调用', state.writeAttempts, []);
  }

  // E2：status:'suspended' → 403 同上
  resetWrites();
  setQuickTaker({ id: 'taker-1', wechatName: '拉黑人', wechatId: 'wx_sus', status: 'suspended', riskFlag: false, blacklistReason: '多次失联' });
  {
    const res = makeRes();
    await quickOrder(mkReq({ userId: 'u1', body: { taskId: 'task-1', takerId: 'taker-1', orderNo: 'NO-2' } }), res);
    check('[E2] HTTP 403', res.statusCode, 403);
    check('[E2] code = TAKER_RISK_BLOCKED', res.payload?.code, 'TAKER_RISK_BLOCKED');
    check('[E2] 响应带 blacklistReason', res.payload?.blacklistReason, '多次失联');
    check('[E2] $transaction 未被调用', state.transactionCalls, 0);
  }

  // E3：force:true 不得绕过风控
  resetWrites();
  setQuickTaker({ id: 'taker-1', wechatName: '风控人', wechatId: 'wx_risk', status: 'active', riskFlag: true, blacklistReason: '恶意退款' });
  {
    const res = makeRes();
    await quickOrder(mkReq({ userId: 'u1', body: { taskId: 'task-1', takerId: 'taker-1', orderNo: 'NO-3', force: true } }), res);
    check('[E3] force:true 仍 HTTP 403', res.statusCode, 403);
    check('[E3] force:true 仍 TAKER_RISK_BLOCKED', res.payload?.code, 'TAKER_RISK_BLOCKED');
    check('[E3] force:true 仍未进入 $transaction', state.transactionCalls, 0);
  }

  // E4：控制组 —— 未命中风控的普通接单人不会被风控守卫误伤（继续走到资质门槛，返回 TAKER_NOT_QUALIFIED）
  resetWrites();
  setQuickTaker({ id: 'taker-1', wechatName: '普通新人', wechatId: 'wx_plain', status: 'active', riskFlag: false });
  {
    const res = makeRes();
    await quickOrder(mkReq({ userId: 'u1', body: { taskId: 'task-1', takerId: 'taker-1', orderNo: 'NO-4' } }), res);
    check('[E4] 未命中风控 → 不是 TAKER_RISK_BLOCKED', res.payload?.code === 'TAKER_RISK_BLOCKED', false);
    check('[E4] 未命中风控 → 继续走资质门槛（TAKER_NOT_QUALIFIED）', res.payload?.code, 'TAKER_NOT_QUALIFIED');
    check('[E4] 仍未进入 $transaction', state.transactionCalls, 0);
  }

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
