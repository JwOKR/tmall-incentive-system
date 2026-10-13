/**
 * settingsAdminOnly.test.ts —— `/api/settings` 真·admin-only 硬拒回归测试
 *
 * 背景：`/api/settings` 原先只挂模块权限（requireViewPermission/requireEditPermission('settings')），
 * 属「排除式软保护」—— 普通用户只要被勾选 settings 模块就能读到 AI Key、改返款计算口径，
 * 而模块权限是**可选授予**的（漏勾=开放）。本次改为 admin-only 硬拒。
 *
 * 覆盖：
 *   A. requireAdmin 行为（**跑真实中间件**，不复制逻辑）：
 *      A1 admin → next() 恰 1 次、res.status 从未被调用；
 *      A2 user 且 permissions.settings = {view:true,edit:true} → 403 + body 形状 + next() 零调用；
 *      A3 userRole undefined（无 token 落到这里）→ 403、next() 零调用；
 *      A4 userRole ''（空串）→ 403。
 *   B. 灵敏度对照：同一份 { settings:{view:true} } 的普通用户走 requireViewPermission('settings')
 *      **仍然放行**（next() 1 次）—— 证明「严格性来自 requireAdmin，而不是模块守卫本身」，
 *      同时固定「requireViewPermission 语义未被本次改动影响」。
 *   C. 真实路由装配（函数**同一性**断言，比文本 grep 更强）：settings/admin 两条路由的
 *      中间件链首个 handler 必须 `=== requireAdmin`，且不再是 requireView/EditPermission 的返回值。
 *   D. 源码级回归护栏：settings.ts 中 requireAdmin 出现 ≥2 次、不再出现
 *      requireViewPermission('settings')/requireEditPermission('settings')；admin.ts 含 requireAdmin、
 *      不再含 `const adminOnly`（防重复实现回潮）。
 *   E. 逐行提取 settings.ts 的 router.get/put 行，断言**两条**都含 requireAdmin（防只改一条）。
 *
 * 手法：注入 fake db/logger 后直接 require 真实中间件与真实路由。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */
import fs from 'fs';
import path from 'path';

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
 * fake db / logger：本测试不查库，但 routes → controllers → utils/db 的
 * 模块加载链需要一个不会真连库的 prisma 替身。
 * ============================================================ */
const fakePrisma: any = {
  $transaction: async (arg: any) => (typeof arg === 'function' ? arg(fakePrisma) : Promise.all(arg)),
  systemSetting: {
    findMany: async () => [],
    findUnique: async () => null,
    upsert: async () => ({}),
  },
  user: { findMany: async () => [], findUnique: async () => null, count: async () => 0 },
  log: { findMany: async () => [], create: async () => ({}) },
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
  // 同时注入正斜杠路径键（Windows 下 require 缓存键可能是反斜杠形式）
  require.cache[resolved.replace(/\\/g, '/')] = entry;
}

injectFake('../src/utils/db', { __esModule: true, default: fakePrisma });
injectFake('../src/utils/logger', {
  __esModule: true,
  default: { info() {}, warn() {}, error() {}, debug() {} },
});

// auth.ts 顶层会读 JWT_SECRET（未设置时打 ERROR 日志），这里预置以免噪声
process.env.JWT_SECRET = process.env.JWT_SECRET || 'settings-admin-only-test-secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { requireAdmin, requireViewPermission, requireEditPermission } = require('../src/middleware/auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settingsRouter = require('../src/routes/settings').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminRouter = require('../src/routes/admin').default;

/* ============================================================
 * express req/res/next 桩（记录调用，用于断言「未被调用」）
 * ============================================================ */
function makeRes(): any {
  const res: any = {
    statusCode: 0,
    statusCalls: [] as number[],
    payload: null,
    status(code: number) {
      res.statusCalls.push(code);
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.payload = payload;
      return res;
    },
  };
  return res;
}

/** 只跑单个中间件：返回 { res, nextCalls } */
function runMiddleware(mw: any, req: any): { res: any; nextCalls: number } {
  const res = makeRes();
  let nextCalls = 0;
  const next = () => {
    nextCalls++;
  };
  mw(req, res, next);
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

const READ_SETTINGS_SRC = path.join(__dirname, '..', 'src', 'routes', 'settings.ts');
const ADMIN_SRC = path.join(__dirname, '..', 'src', 'routes', 'admin.ts');

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/* ============================================================
 * A. requireAdmin 行为（真实中间件）
 * ============================================================ */
function sectionA(): void {
  console.log('\n=== A. requireAdmin 行为（真实中间件） ===');

  // A1. admin 放行
  const a1 = runMiddleware(requireAdmin, { userRole: 'admin' });
  check('[A1] admin → next() 恰被调用 1 次', a1.nextCalls, 1);
  check('[A1] admin → res.status 从未被调用', a1.res.statusCalls.length, 0);
  check('[A1] admin → 未写任何响应体', a1.res.payload, null);

  // A2. 核心：普通用户即便被授予 settings 模块权限也必须被拦
  const a2 = runMiddleware(requireAdmin, {
    userRole: 'user',
    userPermissions: { settings: { view: true, edit: true } },
  });
  check('[A2] 普通用户（已勾选 settings view+edit）→ 403', a2.res.statusCode, 403);
  check('[A2] A2 → next() 零调用（核心断言）', a2.nextCalls, 0);
  check('[A2] 响应 success = false', a2.res.payload?.success, false);
  check('[A2] 响应 code = FORBIDDEN', a2.res.payload?.code, 'FORBIDDEN');
  check('[A2] 响应 message 文案逐字一致', a2.res.payload?.message, '权限不足，仅管理员可操作');
  check('[A2] 响应体仅 3 个字段（success/code/message）', Object.keys(a2.res.payload || {}).sort(), ['code', 'message', 'success']);

  // A3. 无 token 落到这里（userRole undefined）也必须 403，绝不能因「非 'admin' 以外都放行」的写法漏掉
  const a3 = runMiddleware(requireAdmin, {});
  check('[A3] userRole undefined → 403', a3.res.statusCode, 403);
  check('[A3] A3 → next() 零调用', a3.nextCalls, 0);

  // A4. 空串 role（历史数据/异常 token 可能产生）
  const a4 = runMiddleware(requireAdmin, { userRole: '' });
  check('[A4] userRole 空串 → 403', a4.res.statusCode, 403);
  check('[A4] A4 → next() 零调用', a4.nextCalls, 0);

  // A5. 形近值不得被当成 admin
  const a5 = runMiddleware(requireAdmin, { userRole: 'ADMIN' });
  check('[A5] userRole "ADMIN"（大小写不同）→ 403', a5.res.statusCode, 403);
  const a6 = runMiddleware(requireAdmin, { userRole: 'admin ', userPermissions: { settings: { view: true, edit: true } } });
  check('[A6] userRole "admin "（带空格）→ 403', a6.res.statusCode, 403);
}

/* ============================================================
 * B. 灵敏度对照：模块守卫仍然放行（证明严格性来自 requireAdmin）
 * ============================================================ */
function sectionB(): void {
  console.log('\n=== B. 灵敏度对照：模块守卫语义未被改动 ===');
  const userReq = () => ({ userRole: 'user', userPermissions: { settings: { view: true, edit: true } } });

  const b1 = runMiddleware(requireViewPermission('settings'), userReq());
  check('[B] 同一用户走 requireViewPermission(settings) 仍放行（next 1 次）', b1.nextCalls, 1);
  check('[B] requireViewPermission 放行时不写响应', b1.res.statusCalls.length, 0);

  const b2 = runMiddleware(requireEditPermission('settings'), userReq());
  check('[B] 同一用户走 requireEditPermission(settings) 仍放行（next 1 次）', b2.nextCalls, 1);

  // 反向对照：无任何权限的普通用户，模块守卫会拦（说明两者都在工作，只是口径不同）
  const b3 = runMiddleware(requireViewPermission('settings'), { userRole: 'user', userPermissions: {} });
  check('[B] 无 settings 权限的普通用户走模块守卫 → 403（守卫未被误改坏）', b3.res.statusCode, 403);

  // 关键区分：requireAdmin 对「已勾选 settings」的同一份 req 仍然拒绝
  const b4 = runMiddleware(requireAdmin, userReq());
  check('[B] 同一份 req 走 requireAdmin → 403（这就是本次收紧的差异点）', b4.res.statusCode, 403);
}

/* ============================================================
 * C. 真实路由装配：函数同一性（比文本 grep 更强）
 * ============================================================ */
function sectionC(): void {
  console.log('\n=== C. 真实路由装配（函数同一性） ===');

  const settingsGet = findRoute(settingsRouter, 'get', '/');
  const settingsPut = findRoute(settingsRouter, 'put', '/');
  check('[C] GET /api/settings 已注册', !!settingsGet, true);
  check('[C] PUT /api/settings 已注册', !!settingsPut, true);
  check('[C] GET / 首个 handler 就是 requireAdmin（同一函数引用）', settingsGet?.[0] === requireAdmin, true);
  check('[C] PUT / 首个 handler 就是 requireAdmin（同一函数引用）', settingsPut?.[0] === requireAdmin, true);
  check('[C] GET / 链长 2（中间件 + handler）', settingsGet?.length, 2);
  check('[C] PUT / 链长 2（中间件 + handler）', settingsPut?.length, 2);

  // 不再是 requireView/EditPermission('settings') 的返回值
  const oldView = requireViewPermission('settings');
  const oldEdit = requireEditPermission('settings');
  check('[C] GET / 不再挂 requireViewPermission(settings) 的实例', settingsGet?.[0] === oldView, false);
  check('[C] PUT / 不再挂 requireEditPermission(settings) 的实例', settingsPut?.[0] === oldEdit, false);

  // admin 路由复用同一函数引用（证明是「去重复实现」而非又抄了一份）
  const adminRoutes = [
    findRoute(adminRouter, 'get', '/'),
    findRoute(adminRouter, 'post', '/'),
    findRoute(adminRouter, 'put', '/:id'),
    findRoute(adminRouter, 'delete', '/:id'),
  ];
  check('[C] admin 4 条路由均已注册', adminRoutes.every((r) => !!r), true);
  check('[C] admin 4 条路由首个 handler 均为 requireAdmin（同一引用）', adminRoutes.map((r) => r?.[0] === requireAdmin), [true, true, true, true]);

  // 端到端：用装配好的真实链跑一次，普通用户（含 settings 权限）必须 403 且业务层不被触达
  const res = makeRes();
  let nextCalls = 0;
  const next = () => {
    nextCalls++;
  };
  const chain = settingsPut as any[];
  // 只跑首个中间件（业务 handler 需要真实 controller 依赖，403 场景下本就不该进到它）
  chain[0]({ userRole: 'user', userPermissions: { settings: { view: true, edit: true } }, headers: {}, body: {} }, res, next);
  check('[C] 端到端：普通用户 PUT /api/settings → 403', res.statusCode, 403);
  check('[C] 端到端：业务 handler 未被触达（next 零调用）', nextCalls, 0);
}

/* ============================================================
 * D. 源码级回归护栏
 * ============================================================ */
function sectionD(): void {
  console.log('\n=== D. 源码级回归护栏 ===');
  const settingsSrc = fs.readFileSync(READ_SETTINGS_SRC, 'utf8');
  const adminSrc = fs.readFileSync(ADMIN_SRC, 'utf8');

  check('[D] settings.ts 中 requireAdmin 出现 ≥ 2 次（GET + PUT）', countOccurrences(settingsSrc, 'requireAdmin') >= 2, true);
  check('[D] settings.ts 不再出现 requireViewPermission(\'settings\')', settingsSrc.includes("requireViewPermission('settings')"), false);
  check('[D] settings.ts 不再出现 requireEditPermission(\'settings\')', settingsSrc.includes("requireEditPermission('settings')"), false);
  check('[D] settings.ts 不再 import requireViewPermission/requireEditPermission', /import\s*\{[^}]*require(?:View|Edit)Permission[^}]*\}\s*from\s*'\.\.\/middleware\/auth'/.test(settingsSrc), false);
  check('[D] settings.ts 已 import requireAdmin', /import\s*\{[^}]*requireAdmin[^}]*\}\s*from\s*'\.\.\/middleware\/auth'/.test(settingsSrc), true);

  check('[D] admin.ts 含 requireAdmin', adminSrc.includes('requireAdmin'), true);
  check('[D] admin.ts 不再含局部实现 `const adminOnly`', adminSrc.includes('const adminOnly'), false);
  check('[D] admin.ts 不再 import Response/NextFunction（避免未使用导入）', adminSrc.includes('NextFunction'), false);
  check('[D] admin.ts 从 middleware/auth 引入 requireAdmin', /import\s*\{[^}]*requireAdmin[^}]*\}\s*from\s*'\.\.\/middleware\/auth'/.test(adminSrc), true);
}

/* ============================================================
 * E. 逐行断言两条 settings 路由都挂了 requireAdmin
 * ============================================================ */
function sectionE(): void {
  console.log('\n=== E. router.get / router.put 逐行断言 ===');
  const settingsSrc = fs.readFileSync(READ_SETTINGS_SRC, 'utf8');
  const routeLines = settingsSrc
    .split('\n')
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter((r) => /^router\.(get|put)\(/.test(r.line));

  check('[E] settings.ts 中 router.get/put 共 2 条', routeLines.length, 2);
  check('[E] 两条都含 requireAdmin', routeLines.map((r) => r.line.includes('requireAdmin')), [true, true]);
  check('[E] 其中一条是 GET /', routeLines.some((r) => r.line.startsWith("router.get('/'")), true);
  check('[E] 其中一条是 PUT /', routeLines.some((r) => r.line.startsWith("router.put('/'")), true);
  routeLines.forEach((r) => console.log(`         L${r.no}: ${r.line}`));
}

/* ============================================================
 * 主流程
 * ============================================================ */
(async () => {
  try {
    sectionA();
    sectionB();
    sectionC();
    sectionD();
    sectionE();
  } catch (e) {
    failed++;
    console.error(`\n  FAIL  测试主流程抛出未捕获异常: ${(e as Error).stack}`);
  }
  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  console.log(`${passed}/${passed + failed} PASS`);
  process.exit(failed > 0 ? 1 : 0);
})();
