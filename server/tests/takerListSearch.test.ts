/**
 * 接单人列表「服务端搜索」回归测试
 *
 * 背景（快速接单搜不到人）：
 *   前端原先一次性拉最多 100 条再在本地过滤 wechatName / wechatId，
 *   导致：① 超过 100 人时最早的接单人永远不在候选集里；② 用淘宝昵称搜必然零结果；
 *   ③ 本地 slice(0, 30) 静默截断且无提示。
 *   修复后改为把关键词交给服务端（GET /api/takers?search=&pageSize=），
 *   本测试锁定服务端对应的三个契约：
 *     1. search 命中 wechatName / wechatId / taobaoNickname 三个字段
 *     2. pageSize 透传到 take（前端可指定任意页大小，不受旧的 100 条约束）
 *     3. 不传 status 时不加 status 过滤（不会误过滤掉停用接单人）
 *
 * 手法：沿用 takerOrderGate.test.ts —— require.cache 注入 fake prisma 驱动真实 controller，
 *       不连数据库。
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
 * fake prisma：只实现 getAllTakers 用到的 orderTaker.findMany / count，
 * 并把入参记录下来供断言
 * ============================================================ */
const state: {
  findManyArgs: any;
  countWhere: any;
  findManyCalls: number;
  countCalls: number;
} = {
  findManyArgs: null,
  countWhere: null,
  findManyCalls: 0,
  countCalls: 0,
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** 一条齐备的接单人记录（覆盖 LIST_SELECT 全部字段 + 资质字段） */
const TAKER_ROW = {
  id: 'taker-1',
  wechatName: '旺旺张三',
  wechatId: 'zhangsan_wx',
  taobaoNickname: 'tb_zhangsan',
  status: 'active',
  totalOrders: 3,
  totalAmount: 300,
  createdAt: new Date(now - 10 * DAY),
  updatedAt: new Date(now - 1 * DAY),
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: true,
  creditLevel: '3心',
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
  screenshotCount: 3,
  accountInfoUpdatedAt: new Date(now - 2 * DAY),
};

const fakePrisma = {
  orderTaker: {
    findMany: async (args: any) => {
      state.findManyArgs = args;
      state.findManyCalls++;
      return [TAKER_ROW];
    },
    count: async (args: any) => {
      state.countWhere = args.where;
      state.countCalls++;
      return 1;
    },
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
const { getAllTakers } = require('../src/controllers/takerController');

/** 构造最小的 express req / res，并驱动真实的 getAllTakers */
async function runGetAllTakers(query: Record<string, unknown>): Promise<{ res: any }> {
  state.findManyArgs = null;
  state.countWhere = null;
  state.findManyCalls = 0;
  state.countCalls = 0;
  const req: any = { query };
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
  await getAllTakers(req, res);
  return { res };
}

(async () => {
  /* ============================================================
   * 1. 带 search：where.OR 必须同时覆盖 微信昵称 / 微信号 / 淘宝昵称
   * ============================================================ */
  console.log('\n=== 1. search 命中三个字段（nickname / wechatId / taobaoNickname）===');
  const searched = await runGetAllTakers({ search: '张三', pageSize: 50 });
  check('HTTP 200', searched.res.statusCode, 0); // 正常路径不调用 res.status
  check('success = true', searched.res.payload?.success, true);
  check(
    'where.OR 含三个 contains 条件',
    state.findManyArgs?.where?.OR,
    [
      { wechatName: { contains: '张三' } },
      { wechatId: { contains: '张三' } },
      { taobaoNickname: { contains: '张三' } },
    ]
  );
  check('where 不含 status（未传 status 不误过滤）', 'status' in (state.findManyArgs?.where ?? {}), false);
  check('响应式 truly 命中：count 与 findMany 用同一个 where', state.countWhere, state.findManyArgs?.where);
  check('返回列表长度 1', searched.res.payload?.data?.list?.length, 1);
  check('返回 total 来自 count', searched.res.payload?.data?.total, 1);
  check('每条记录附带 compliance', typeof searched.res.payload?.data?.list?.[0]?.compliance, 'object');

  /* ============================================================
   * 2. pageSize 透传给 take（前端可指定页大小）
   * ============================================================ */
  console.log('\n=== 2. pageSize → take 透传 ===');
  await runGetAllTakers({ pageSize: 50 });
  check('pageSize=50 → take = 50', state.findManyArgs?.take, 50);

  await runGetAllTakers({ pageSize: 200 });
  check('pageSize=200 → take = 200（突破旧的前端 100 条上限）', state.findManyArgs?.take, 200);

  await runGetAllTakers({ page: 3, pageSize: 50 });
  check('page=3 & pageSize=50 → skip = 100', state.findManyArgs?.skip, 100);

  await runGetAllTakers({});
  check('未传 pageSize → take 回落默认 10', state.findManyArgs?.take, 10);

  /* ============================================================
   * 3. 未传 status 时不加 status 过滤；传了才加
   * ============================================================ */
  console.log('\n=== 3. status 过滤只在显式传入时才生效 ===');
  await runGetAllTakers({ pageSize: 50 });
  check('不传 status → where 无 status 键', 'status' in (state.findManyArgs?.where ?? {}), false);
  check('不传 status → where 无 OR 键', 'OR' in (state.findManyArgs?.where ?? {}), false);
  check('不传 status → count 的 where 同为 {}', state.countWhere, {});

  await runGetAllTakers({ status: 'active', pageSize: 50 });
  check('传 status=active → where.status = active', state.findManyArgs?.where?.status, 'active');
  check('传 status → count 的 where 也带 status', state.countWhere?.status, 'active');

  /* ============================================================
   * 4. 前端实际的下拉请求形态（search 为空时不带关键词）
   * ============================================================ */
  console.log('\n=== 4. 前端下拉默认请求（无关键词）===');
  const plain = await runGetAllTakers({ pageSize: 50 });
  check('不带 search → where 不带 OR', 'OR' in (state.findManyArgs?.where ?? {}), false);
  check('不带 search → 仍返回列表', plain.res.payload?.data?.list?.length, 1);
  check('列表项含 taobaoNickname（前端展示/辨认所需）', plain.res.payload?.data?.list?.[0]?.taobaoNickname, 'tb_zhangsan');

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})();
