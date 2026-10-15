/**
 * logFilter.test.ts —— 第 6 批 W3（P2-2）审计日志筛选回归测试
 *
 * 用假 prisma 驱动**真实** logController.getAllLogs，校验：
 *   1. 传 userId 时确实进入 where（findMany 与 count 同一 where）；
 *   2. **不传 userId 时行为与改动前完全一致**（where 不含 userId 键）——防回归关键点；
 *   3. userId 白名单透传：空串 / 数组 / 对象等结构化输入一律被忽略（防注入）；
 *   4. 带前后空格的 userId 会被 trim；
 *   5. 既有筛选（action / orderId / startDate / endDate）不被破坏；
 *   6. 分页与排序不被破坏（skip / take / orderBy）；
 *   7. 响应形状不变（success / data.list / data.total / data.page / data.pageSize）；
 *   8. 镜像只读断言：零写操作、零裸 SQL。
 *
 * 手法：require.cache 预注入 fake prisma（**同时注入 `\` 与 `/` 两种路径键**）。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
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
 * 0. fake prisma（写方法一律 throw，读方法记录入参）
 * ============================================================ */
const state: {
  writeAttempts: string[];
  queryRawUnsafeCalls: number;
  queryRawCalls: number;
  findManyCalls: number;
  findManyArgs: any;
  countArgs: any;
  countResult: number;
  logsResult: any[];
  userFindManyCalls: number;
  userFindManyArgs: any;
  usersResult: any[];
} = {
  writeAttempts: [],
  queryRawUnsafeCalls: 0,
  queryRawCalls: 0,
  findManyCalls: 0,
  findManyArgs: null,
  countArgs: null,
  countResult: 0,
  logsResult: [],
  userFindManyCalls: 0,
  userFindManyArgs: null,
  usersResult: [],
};

function writeGuard(name: string) {
  return async () => {
    state.writeAttempts.push(name);
    throw new Error('WRITE DETECTED: ' + name);
  };
}

const fakePrisma: any = {
  log: {
    findMany: async (args: any) => {
      state.findManyCalls++;
      state.findManyArgs = args;
      return state.logsResult;
    },
    count: async (args: any) => {
      state.countArgs = args;
      return state.countResult;
    },
    create: writeGuard('log.create'),
    update: writeGuard('log.update'),
    delete: writeGuard('log.delete'),
    upsert: writeGuard('log.upsert'),
    createMany: writeGuard('log.createMany'),
    updateMany: writeGuard('log.updateMany'),
    deleteMany: writeGuard('log.deleteMany'),
  },
  user: {
    // 模拟 Prisma 的 select 投影：只回 select 白名单内的字段，
    // 以便对「controller 是否真的传了白名单 select」做**有效**验证（否则假数据会原样漏出敏感字段）。
    findMany: async (args: any) => {
      state.userFindManyCalls++;
      state.userFindManyArgs = args;
      const rows: any[] = state.usersResult;
      if (args?.select && typeof args.select === 'object') {
        const keys = Object.keys(args.select).filter((k) => args.select[k]);
        return rows.map((r) => {
          const projected: any = {};
          keys.forEach((k) => { if (k in r) projected[k] = r[k]; });
          return projected;
        });
      }
      return rows;
    },
    findUnique: async () => null,
    create: writeGuard('user.create'),
    update: writeGuard('user.update'),
    delete: writeGuard('user.delete'),
  },
  order: {
    findMany: async () => [],
    findUnique: async () => null,
    create: writeGuard('order.create'),
    update: writeGuard('order.update'),
    delete: writeGuard('order.delete'),
  },
  $queryRawUnsafe: async () => {
    state.queryRawUnsafeCalls++;
    return [];
  },
  $queryRaw: async () => {
    state.queryRawCalls++;
    return [];
  },
  $executeRawUnsafe: writeGuard('$executeRawUnsafe'),
  $executeRaw: writeGuard('$executeRaw'),
  $transaction: writeGuard('$transaction'),
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

// middleware/auth.ts 顶层会读 JWT_SECRET（未设置时打 ERROR 日志），这里预置以免噪声
process.env.JWT_SECRET = process.env.JWT_SECRET || 'log-filter-test-secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAllLogs, getLogOperators } = require('../src/controllers/logController');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { requireViewPermission } = require('../src/middleware/auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const logsRouter = require('../src/routes/logs').default;

function makeRes() {
  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.payload = payload; return res; },
  };
  return res;
}

function resetSpies(): void {
  state.writeAttempts = [];
  state.queryRawUnsafeCalls = 0;
  state.queryRawCalls = 0;
  state.findManyCalls = 0;
  state.findManyArgs = null;
  state.countArgs = null;
  state.userFindManyCalls = 0;
  state.userFindManyArgs = null;
}

async function runGetAllLogs(query: Record<string, unknown>) {
  resetSpies();
  const res = makeRes();
  await getAllLogs({ query } as any, res);
  return res;
}

/** 跑 /api/logs/operators 控制器（fake user 表） */
async function runGetLogOperators() {
  resetSpies();
  const res = makeRes();
  await getLogOperators({} as any, res);
  return res;
}

/** 只跑单个中间件：返回 { res, nextCalls } */
function runMiddleware(mw: any, req: any) {
  const res = makeRes();
  let nextCalls = 0;
  mw(req, res, () => { nextCalls++; });
  return { res, nextCalls };
}

/** 从 router.stack 按 method+path 找中间件链（保持注册顺序） */
function findRoute(router: any, method: string, routePath: string): any[] | null {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === routePath && layer.route.methods?.[method]) {
      return layer.route.stack.map((s: any) => s.handle);
    }
  }
  return null;
}

/* ============================================================
 * 1. 用例
 * ============================================================ */
(async () => {
  state.countResult = 42;
  state.logsResult = [
    {
      id: 'log1',
      action: 'update',
      detail: '实付款: 100 → 200',
      ipAddress: '127.0.0.1',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
      order: { id: 'o1', orderNo: 'TB001', productId: 'p1', productCode: 'P001' },
      user: { id: 'u1', username: 'alice' },
    },
  ];

  /* ---------- A. 不传 userId：行为与改动前完全一致 ---------- */
  console.log('\n=== A. 不传 userId（防回归关键点） ===');
  const resA = await runGetAllLogs({ page: 2, pageSize: 20 });
  check('[A] success = true', resA.payload?.success, true);
  check('[A] findMany.where 不含 userId 键', 'userId' in (state.findManyArgs?.where ?? {}), false);
  check('[A] count.where 不含 userId 键', 'userId' in (state.countArgs?.where ?? {}), false);
  check('[A] findMany.where 为空对象（无其它筛选）', state.findManyArgs?.where, {});
  check('[A] 分页：page=2/pageSize=20 → skip=20, take=20',
    [state.findManyArgs?.skip, state.findManyArgs?.take], [20, 20]);
  check('[A] 排序：createdAt desc', state.findManyArgs?.orderBy, { createdAt: 'desc' });
  check('[A] count 与 findMany 用同一 where（深比较）',
    JSON.stringify(state.countArgs?.where), JSON.stringify(state.findManyArgs?.where));
  check('[A] 响应形状不变',
    [resA.payload?.data?.total, resA.payload?.data?.page, resA.payload?.data?.pageSize],
    [42, 2, 20]);

  /* ---------- B. 传 userId：进入 where ---------- */
  console.log('\n=== B. 传 userId（筛选生效） ===');
  await runGetAllLogs({ userId: 'u123' });
  check('[B] findMany.where.userId = u123', state.findManyArgs?.where?.userId, 'u123');
  check('[B] count.where.userId = u123（同一 where）', state.countArgs?.where?.userId, 'u123');
  check('[B] where 仅含 userId（不引入其它键）', state.findManyArgs?.where, { userId: 'u123' });

  /* ---------- C. 白名单透传：非法输入被忽略 ---------- */
  console.log('\n=== C. userId 白名单透传（防注入） ===');
  await runGetAllLogs({ userId: '' });
  check('[C] 空串 → 不进 where', 'userId' in (state.findManyArgs?.where ?? {}), false);
  await runGetAllLogs({ userId: ['a', 'b'] });
  check('[C] 数组 → 不进 where（结构化输入被忽略）', 'userId' in (state.findManyArgs?.where ?? {}), false);
  await runGetAllLogs({ userId: { not: null } });
  check('[C] 对象 → 不进 where（结构化输入被忽略）', 'userId' in (state.findManyArgs?.where ?? {}), false);
  await runGetAllLogs({ userId: '  u1  ' });
  check('[C] 带空格 → trim 后进 where', state.findManyArgs?.where?.userId, 'u1');

  /* ---------- D. 与既有筛选叠加，且互不破坏 ---------- */
  console.log('\n=== D. 与既有筛选叠加 ===');
  await runGetAllLogs({
    action: 'update',
    orderId: 'ord1',
    userId: 'u1',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  });
  const w = state.findManyArgs?.where;
  check('[D] action 仍生效', w?.action, 'update');
  check('[D] orderId 仍生效', w?.orderId, 'ord1');
  check('[D] userId 仍生效', w?.userId, 'u1');
  check('[D] createdAt 范围仍生效',
    [w?.createdAt?.gte?.toISOString?.() ?? null, w?.createdAt?.lte?.toISOString?.() ?? null],
    ['2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z']);
  check('[D] where 键集合恰为 4 项（不引入额外键）',
    Object.keys(w ?? {}).sort(), ['action', 'createdAt', 'orderId', 'userId']);

  /* ---------- E. 分页/排序不被 userId 破坏 ---------- */
  console.log('\n=== E. 分页与排序 ===');
  await runGetAllLogs({ userId: 'u1', page: 3, pageSize: 50 });
  check('[E] skip = (3-1)*50 = 100', state.findManyArgs?.skip, 100);
  check('[E] take = 50', state.findManyArgs?.take, 50);
  check('[E] orderBy.createdAt = desc', state.findManyArgs?.orderBy, { createdAt: 'desc' });
  check('[E] include 仍带 order 与 user 关联',
    ['order' in (state.findManyArgs?.include ?? {}), 'user' in (state.findManyArgs?.include ?? {})],
    [true, true]);

  /* ---------- F. 镜像只读断言 ---------- */
  console.log('\n=== F. 只读性 ===');
  await runGetAllLogs({ userId: 'u1' });
  check('[F] 无任何写方法被调用', state.writeAttempts, []);
  check('[F] $queryRawUnsafe 调用次数 = 0', state.queryRawUnsafeCalls, 0);
  check('[F] $queryRaw 调用次数 = 0', state.queryRawCalls, 0);
  check('[F] findMany 恰好调用 1 次（Promise.all 内一次）', state.findManyCalls, 1);

  /* ---------- G. /api/logs/operators：路由装配与权限（真实中间件） ---------- */
  console.log('\n=== G. /api/logs/operators 路由与权限 ===');
  const operatorsRoute = findRoute(logsRouter, 'get', '/operators');
  check('[G] GET /api/logs/operators 已注册', !!operatorsRoute, true);
  check('[G] 链长 2（中间件 + handler）', operatorsRoute?.length, 2);

  // 无 logs 视图权限 → 403
  const gNoPerm = runMiddleware(requireViewPermission('logs'), { userRole: 'user', userPermissions: {} });
  check('[G] 无 logs 视图权限 → 403', gNoPerm.res.statusCode, 403);
  check('[G] 无权限时 next 零调用', gNoPerm.nextCalls, 0);
  check('[G] 403 响应 code = FORBIDDEN', gNoPerm.res.payload?.code, 'FORBIDDEN');

  // 有 logs 视图权限 → 放行
  const gView = runMiddleware(requireViewPermission('logs'), { userRole: 'user', userPermissions: { logs: { view: true, edit: false } } });
  check('[G] 有 logs 视图权限 → next 1 次', gView.nextCalls, 1);
  const gAdmin = runMiddleware(requireViewPermission('logs'), { userRole: 'admin' });
  check('[G] admin → next 1 次', gAdmin.nextCalls, 1);

  // 真实路由链首个 handler 行为一致（与同模块视图守卫语义相同）
  const gChainNoPerm = runMiddleware(operatorsRoute?.[0], { userRole: 'user', userPermissions: {} });
  check('[G] 路由链首个 handler：无权限 → 403', gChainNoPerm.res.statusCode, 403);
  const gChainView = runMiddleware(operatorsRoute?.[0], { userRole: 'user', userPermissions: { logs: { view: true, edit: false } } });
  check('[G] 路由链首个 handler：有权限 → next 1 次', gChainView.nextCalls, 1);

  /* ---------- H. /api/logs/operators：白名单 select 与敏感字段阴性断言 ---------- */
  console.log('\n=== H. /api/logs/operators 返回体 ===');
  // 空数据
  state.usersResult = [];
  const hEmpty = await runGetLogOperators();
  check('[H] 空数据 → success true', hEmpty.payload?.success, true);
  check('[H] 空数据 → data 为 []', hEmpty.payload?.data, []);

  // 单条
  state.usersResult = [{ id: 'u1', username: 'alice' }];
  const hOne = await runGetLogOperators();
  check('[H] 单条 → 长度 1', hOne.payload?.data?.length, 1);
  check('[H] 单条 → 每项 key 集合恰为 {id, username}', Object.keys(hOne.payload?.data?.[0] || {}).sort(), ['id', 'username']);

  // 多条 + 伪造敏感字段：controller 传了白名单 select → fake 按 select 投影，敏感字段不得漏出
  state.usersResult = [
    { id: 'u1', username: 'alice', password: 'BCRYPT_HASH', role: 'admin', permissions: '{"logs":{"view":true}}' },
    { id: 'u2', username: 'bob', password: 'BCRYPT_HASH2', role: 'user' },
  ];
  const hMulti = await runGetLogOperators();
  check('[H] 多条 → 长度 2', hMulti.payload?.data?.length, 2);
  check('[H] 多条 → 每项 key 集合恰为 {id, username}',
    hMulti.payload?.data.map((u: any) => Object.keys(u).sort()),
    [['id', 'username'], ['id', 'username']]);

  // controller 传给 prisma 的 select 白名单恰为 {id, username}
  check('[H] select 只含 id 与 username', Object.keys(state.userFindManyArgs?.select || {}).sort(), ['id', 'username']);
  // 上限保护与排序
  check('[H] take 为正整数（上限保护）', Number.isInteger(state.userFindManyArgs?.take) && state.userFindManyArgs.take > 0, true);
  check('[H] orderBy 已指定', !!state.userFindManyArgs?.orderBy, true);

  // 敏感字段阴性断言（真实 User 模型字段名：password / role / permissions + 通用 apiKey 词族）
  const hSerialized = JSON.stringify(hMulti.payload).toLowerCase();
  ['password', 'hash', 'permissions', 'apikey', 'aiapikey', 'deepseekapikey'].forEach((f) => {
    check(`[H] 响应体不含敏感字段 "${f}"`, hSerialized.includes(f), false);
  });

  // 只读性
  check('[H] operators 无任何写方法被调用', state.writeAttempts, []);
  check('[H] operators 未触发裸 SQL', [state.queryRawUnsafeCalls, state.queryRawCalls], [0, 0]);
  check('[H] user.findMany 恰调用 1 次', state.userFindManyCalls, 1);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
