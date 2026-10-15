#!/usr/bin/env node
/**
 * render-permission-matrix.mjs —— 「权限渲染矩阵」可反复运行的自动化用例（零新依赖）
 *
 * ── 用途 ────────────────────────────────────────────────────────────────
 * 把上一轮一次性做过的「真实渲染取证」固化成可反复运行的脚本：
 * 用 esbuild 打包真实源码（`@/` 别名映射到 client/src/，另把 auth / chart 等
 * 无法在 SSR 下运行的模块替换为零依赖 shim）→ 交给 react-dom/server 的
 * renderToStaticMarkup 渲染出**真实 HTML** → 解析所有 `<a href>` →
 * 断言「任何身份都不会渲染出指向其无权限路由的可点击锚点」。
 *
 * 身份与「路径 → 所需权限」两张表**全部从源码推导**（读 App.tsx 的路由守卫 +
 * 用 shim 注入的 user 走真实的 usePermissions().canView 判定），因此不会随上游
 * 代码漂移而失效。产物 / 中间件一律写系统临时目录（$TEMP / os.tmpdir()），
 * 不向仓库落任何构建产物。
 *
 * ── 运行命令 ────────────────────────────────────────────────────────────
 *   cd client && node scripts/render-permission-matrix.mjs
 *
 * ── 预期输出（全绿）────────────────────────────────────────────────────
 *   [render-permission-matrix] 身份数=9，渲染次数=18，HTML 长度区间=[…, …]，href 总数=…
 *   [render-permission-matrix] 非空性：admin/Dashboard 锚点数=…（>0）
 *   PASS=… FAIL=0
 *   退出码 0
 *
 * 任一断言失败 → 打印「身份 / 页面 / 期望 / 实际」并以 process.exit(1) 退出，
 * 便于将来接入 CI / 一键校验。
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(CLIENT_DIR, 'src');
const APP_TSX = path.join(SRC_DIR, 'App.tsx');

// ─────────────────────────────── 断言框架 ───────────────────────────────
let passed = 0;
let failed = 0;

/** 断言工具：失败时打印「身份 / 页面 / 期望 / 实际」，风格与 server/tests 一致 */
function check(name, actual, expected, context = '') {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL  ${name}${context ? `\n        上下文：${context}` : ''}` +
        `\n        期望：${JSON.stringify(expected)}` +
        `\n        实际：${JSON.stringify(actual)}`
    );
  }
}

// ─────────────────────── ① 从源码推导「路径 → 所需权限」表 ───────────────────────
/**
 * 从 App.tsx 源码抽出所有被 <RequirePermission module="X"> / <RequireAdmin> 包裹的路由。
 * 返回 Map<path, module>，其中 admin-only 路由的 module 记为哨兵 '__admin__'。
 * 未被守卫包裹的路由（如 '/'、'/login'）不进表 —— 语义上「始终放行」。
 */
function parseRoutePermissionTable(src) {
  // 去掉注释，避免注释里的 <Route / module 干扰
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // 每个 <Route ... /> 都是自闭合，用 <Route 切段，段内不会跨到下一条路由
  const segments = noComments.split(/<Route\b/).slice(1);
  const table = new Map();
  for (const seg of segments) {
    const pathMatch = seg.match(/path="([^"]+)"/);
    if (!pathMatch) continue;
    const routePath = pathMatch[1];
    if (routePath === '*') continue; // 兜底 NotFound，不参与权限矩阵
    const requiresAdmin = /<RequireAdmin\b/.test(seg);
    const permMatch = seg.match(/<RequirePermission\s+module="([^"]+)"/);
    if (!permMatch && !requiresAdmin) continue; // 无守卫 → 始终放行
    table.set(routePath, requiresAdmin ? '__admin__' : permMatch[1]);
  }
  return table;
}

// ─────────────────────────── ② 身份矩阵（≥6 种）───────────────────────────
const V = { view: true, edit: false };
const N = { view: false, edit: false };
const u = (username, permissions) => ({ id: `u-${username}`, username, role: 'user', permissions });

/** 每个身份都是真实的 AuthUser 结构，交给真实的 usePermissions().canView 判定 */
const IDENTITIES = [
  { name: 'admin（全权限）', user: { id: 'u-admin', username: 'admin', role: 'admin' } },
  { name: '无任何权限', user: u('none', {}) },
  { name: '仅 dashboard', user: u('p-dashboard', { dashboard: V }) },
  { name: '仅 orders', user: u('p-orders', { orders: V }) },
  { name: '仅 logs', user: u('p-logs', { logs: V }) },
  { name: '仅 export', user: u('p-export', { export: V }) },
  { name: '仅 takers', user: u('p-takers', { takers: V }) },
  { name: '仅 anomalies', user: u('p-anomalies', { anomalies: V }) },
  { name: '仅 repeatDiscounts', user: u('p-repeat', { repeatDiscounts: V }) },
];

/** 与 lib/permissions.tsx:canView 等价（仅本脚本用于「期望值」推导，源判定仍走真实代码） */
function canView(user, module) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.permissions) return false;
  return user.permissions[module]?.view === true;
}
function isAdmin(user) {
  return user?.role === 'admin';
}
/** 某身份是否被允许访问某路由路径（无守卫路由始终放行） */
function routeAllowed(user, routePath, table) {
  if (!table.has(routePath)) return true; // '/'、'/login' 等无守卫 → 始终放行
  const module = table.get(routePath);
  return module === '__admin__' ? isAdmin(user) : canView(user, module);
}

// ────────────────────────── ③ esbuild 打包（含 shim）──────────────────────────
/** shim：@/contexts/AuthContext —— 用可注入的全局身份替换 localStorage 读取 */
const SHIM_AUTH = `
let __current = null;
export function __setAuth(a) { __current = a; }
export function useAuth() { return __current; }
export function AuthProvider({ children }) { return children; }
`;

/** shim：chart.js —— SSR 下不需要真实 canvas，全部降级为 no-op */
const SHIM_CHARTJS = `
const noop = () => {};
export const Chart = { register: noop, defaults: {} };
export function register() {}
export const CategoryScale = noop;
export const LinearScale = noop;
export const PointElement = noop;
export const LineElement = noop;
export const BarElement = noop;
export const ArcElement = noop;
export const Title = noop;
export const Tooltip = noop;
export const Legend = noop;
export const Filler = noop;
`;

/** shim：react-chartjs-2 —— 渲染 <canvas> 并记录 options（信息性证据，不作硬断言） */
const SHIM_RCC2 = `
import React from 'react';
function makeStub(kind) {
  return function Stub(props) {
    const bag = globalThis.__HARNESS_CHART_OPTIONS__;
    if (Array.isArray(bag)) {
      bag.push({ kind, hasOnClick: typeof props?.options?.onClick === 'function' });
    }
    return React.createElement('canvas', { 'data-chart': kind });
  };
}
export const Line = makeStub('line');
export const Bar = makeStub('bar');
export const Doughnut = makeStub('doughnut');
`;

/** 解析 @/ 别名：按常见扩展名 / 目录 index 逐一探测真实文件 */
const EXT_ORDER = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.css', '.json'];
function probeModuleFile(baseAbs) {
  for (const ext of EXT_ORDER) {
    if (fs.existsSync(baseAbs + ext)) return baseAbs + ext;
  }
  if (fs.existsSync(baseAbs) && fs.statSync(baseAbs).isFile()) return baseAbs;
  for (const ext of EXT_ORDER) {
    const idx = path.join(baseAbs, 'index' + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

const SHIM_SOURCES = {
  'shim:auth': SHIM_AUTH,
  'shim:chartjs': SHIM_CHARTJS,
  'shim:rcc2': SHIM_RCC2,
};

const aliasAndShimPlugin = {
  name: 'alias-and-shims',
  setup(build) {
    // 注意：shim 的 onResolve 必须在 `@/` 别名之前注册 —— esbuild 按注册顺序取
    // 第一个命中的回调。否则 `@/contexts/AuthContext` 会先被别名解析成真实文件。
    // AuthContext（无论经 @/ 还是相对路径）→ shim
    build.onResolve({ filter: /contexts\/AuthContext(\.[cm]?[jt]sx?)?$/ }, () => ({
      path: 'shim:auth',
      namespace: 'shim',
    }));
    // chart.js / react-chartjs-2 → shim（SSR 无 DOM，且要捕获 options）
    build.onResolve({ filter: /^chart\.js$/ }, () => ({ path: 'shim:chartjs', namespace: 'shim' }));
    build.onResolve({ filter: /^react-chartjs-2$/ }, () => ({
      path: 'shim:rcc2',
      namespace: 'shim',
    }));
    // @/ → client/src/
    build.onResolve({ filter: /^@\// }, (args) => {
      const target = probeModuleFile(path.join(SRC_DIR, args.path.slice(2)));
      return target ? { path: target } : null;
    });
    build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => ({
      contents: SHIM_SOURCES[args.path] ?? '',
      loader: 'js',
      resolveDir: CLIENT_DIR,
    }));
  },
};

/** 入口：导出 renderPage(name, auth, dashboardData) —— 返回真实 HTML 字符串 */
const ENTRY_SOURCE = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { __setAuth } from '@/contexts/AuthContext';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
// 事项14：提醒条链接的派生纯函数（真实的、被 Dashboard 复用的那一份）
export { deriveDashboardAlertLinks } from '@/lib/dashboardAlerts';

const PAGES = { Landing, Dashboard };

export function renderPage(name, auth, dashboardData, routePath) {
  __setAuth(auth);
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 0 } },
  });
  if (dashboardData !== undefined) {
    // Dashboard.tsx 的 queryKey 为 ['dashboard', startDate, endDate]，初始二者皆为 ''
    qc.setQueryData(['dashboard', '', ''], dashboardData);
  }
  const Page = PAGES[name];
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        MemoryRouter,
        { initialEntries: [routePath || '/'] },
        React.createElement(Page)
      )
    )
  );
}
`;

async function buildHarnessBundle() {
  const esbuild = require('esbuild');
  const outfile = path.join(os.tmpdir(), `render-permission-matrix.${process.pid}.cjs`);
  await esbuild.build({
    stdin: { contents: ENTRY_SOURCE, resolveDir: CLIENT_DIR, sourcefile: 'harness-entry.tsx', loader: 'tsx' },
    outfile,
    bundle: true,
    platform: 'node',
    // CJS 输出：react-dom/server 等 CJS 依赖内部会 `require('stream')` 等 Node 内建，
    // 打成 ESM 会触发 "Dynamic require of stream is not supported"，故用 CJS。
    format: 'cjs',
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [aliasAndShimPlugin],
  });
  return outfile;
}

// ─────────────────────────────── ④ 主流程 ───────────────────────────────
const HREF_RE = /<a\b[^>]*\bhref="([^"]*)"/g;
function collectHrefs(html) {
  const out = [];
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) out.push(m[1]);
  return out;
}
const pathnameOf = (href) => href.split('?')[0].split('#')[0];

/**
 * 极小 DOM 兜底：Dashboard.tsx 内的图表包裹组件在「渲染期」会读
 * `document.documentElement.classList.contains('dark')`（这不是 effect）。
 * SSR 无 DOM，故注入最小 document。注意**不注入 window** —— notify.ts 的
 * `typeof window !== 'undefined'` 判断因此短路为 'unsupported'，与本仓库
 * 在无浏览器环境下的一贯降级路径一致。
 */
function installDomPolyfills() {
  if (typeof globalThis.document !== 'undefined') return;
  const classList = { contains: () => false, add() {}, remove() {}, toggle() {} };
  globalThis.document = {
    documentElement: { classList, style: {} },
    body: { classList, style: {}, appendChild() {}, removeChild() {} },
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ style: {}, click() {}, setAttribute() {}, appendChild() {} }),
    querySelector: () => null,
  };
}

/** 静音 React 的 useLayoutEffect-SSR 警告（与本次断言无关，避免污染证据输出） */
function installReactWarningFilter() {
  const orig = console.error;
  console.error = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('useLayoutEffect does nothing on the server')) return;
    orig.apply(console, args);
  };
}

const DASHBOARD_DATA = {
  data: {
    totalOrders: 1234,
    totalAmount: 5678.9,
    totalRefund: 100,
    activeTakers: 12,
    rangeLabel: '今日',
    rangeOrders: 5,
    rangeAmount: 66,
    rangeReward: 7,
    pendingRefundCount: 9,
    pendingReviewCount: 3,
    activeTasks: 2,
    topTakers: [{ id: 't1', wechatName: '张三', wechatId: 'wx1', totalOrders: 8, totalAmount: 88 }],
    dailySummary: [
      { date: '2026-10-01', orderCount: 3, totalRefund: 30, refundedCount: 2, pendingCount: 1, goodReviewCount: 2 },
    ],
  },
};

async function main() {
  installDomPolyfills();
  installReactWarningFilter();

  const appSrc = fs.readFileSync(APP_TSX, 'utf8');
  const table = parseRoutePermissionTable(appSrc);
  if (table.size === 0) {
    console.error('  FAIL  未能从 App.tsx 解析出任何受守卫路由（路径 → 权限表为空）');
    failed++;
  }

  const bundlePath = await buildHarnessBundle();
  let renderPage;
  try {
    const mod = require(bundlePath);
    renderPage = mod.renderPage;
    if (typeof renderPage !== 'function') {
      throw new Error('bundle 未导出 renderPage');
    }

    const pages = ['Landing', 'Dashboard'];
    const routePathFor = { Landing: '/', Dashboard: '/dashboard' };

    const htmlLens = [];
    let totalHrefs = 0;
    let adminDashboardAnchors = 0;
    let dashboardAnchorsTotal = 0;

    /** 记录每个 (身份, 页面) 的 href 集合，供后续按身份断言 */
    const observed = new Map(); // key: `${identity}|${page}` → string[]

    for (const id of IDENTITIES) {
      const auth = {
        user: id.user,
        token: 'harness-token',
        isAuthenticated: true,
        loading: false,
        login: async () => {},
        logout: () => {},
      };
      for (const page of pages) {
        const html = renderPage(page, auth, DASHBOARD_DATA, routePathFor[page]);
        const hrefs = collectHrefs(html);
        htmlLens.push(html.length);
        totalHrefs += hrefs.length;
        observed.set(`${id.name}|${page}`, hrefs);
        const ctx = `身份=「${id.name}」 页面=${page}`;

        // 非空性：每次渲染都必须产出真实 HTML
        check(`渲染非空(${id.name}/${page})`, html.length > 200, true, ctx);

        // 核心断言：不得出现指向「该身份无权限路由」的可点击锚点
        const offenders = [];
        for (const href of hrefs) {
          const p = pathnameOf(href);
          if (!routeAllowed(id.user, p, table)) offenders.push(href);
        }
        check(`无越权锚点(${id.name}/${page})`, offenders, [], ctx);

        if (page === 'Dashboard') {
          dashboardAnchorsTotal += hrefs.length;
          if (id.user.role === 'admin') adminDashboardAnchors = hrefs.length;
        }
      }
    }

    const has = (idName, page, p) =>
      (observed.get(`${idName}|${page}`) || []).some((h) => pathnameOf(h) === p);

    if (process.env.DEBUG_MATRIX === '1') {
      for (const id of IDENTITIES) {
        for (const page of pages) {
          const hs = observed.get(`${id.name}|${page}`) || [];
          console.log(`  [debug] ${id.name} / ${page} → ${JSON.stringify(hs)}`);
        }
      }
    }

    // Landing 期望：两张卡片是否渲染 ⟺ 是否有对应模块权限
    for (const id of IDENTITIES) {
      const ctx = `身份=「${id.name}」 页面=Landing`;
      check(
        `Landing /dashboard 出现 ⟺ canView(dashboard)（${id.name}）`,
        has(id.name, 'Landing', '/dashboard'),
        canView(id.user, 'dashboard'),
        ctx
      );
      check(
        `Landing /repeat-discounts 出现 ⟺ canView(repeatDiscounts)（${id.name}）`,
        has(id.name, 'Landing', '/repeat-discounts'),
        canView(id.user, 'repeatDiscounts'),
        ctx
      );
    }
    // Landing 空态：无任何权限身份必须看到空态文案
    const noneLandingHtml = renderPage('Landing', {
      user: IDENTITIES[1].user,
      token: 't',
      isAuthenticated: true,
      loading: false,
      login: async () => {},
      logout: () => {},
    }, DASHBOARD_DATA, '/');
    check(
      'Landing 无权限身份展示空态文案',
      noneLandingHtml.includes('您当前没有可访问的模块'),
      true,
      '身份=「无任何权限」 页面=Landing'
    );

    // Dashboard 期望：数据卡入口锚点出现 ⟺ 有对应模块权限
    for (const id of IDENTITIES) {
      const ctx = `身份=「${id.name}」 页面=Dashboard`;
      for (const [route, module] of [
        ['/orders', 'orders'],
        ['/takers', 'takers'],
        ['/tasks', 'tasks'],
      ]) {
        check(
          `Dashboard ${route} 出现 ⟺ canView(${module})（${id.name}）`,
          has(id.name, 'Dashboard', route),
          canView(id.user, module),
          ctx
        );
      }
      // 承载数据的卡片必须保留（无权时只取消跳转，不隐藏数据）
      const html = renderPage('Dashboard', {
        user: id.user,
        token: 't',
        isAuthenticated: true,
        loading: false,
        login: async () => {},
        logout: () => {},
      }, DASHBOARD_DATA, '/dashboard');
      const retain =
        html.includes('待返款订单') &&
        html.includes('待好评订单') &&
        html.includes('活跃任务') &&
        html.includes('1,234');
      check(`Dashboard 数据卡保留展示(${id.name})`, retain, true, ctx);
    }

    // 说明：Dashboard 页内提醒条（alerts）由 useEffect 驱动，SSR 不运行 effect，
    // 故 SSR HTML 中本该没有 /anomalies 锚点 —— 这不是运行时门控证据（见 事项14）。
    for (const id of IDENTITIES) {
      check(
        `Dashboard SSR 不含 /anomalies 锚点（提醒条不在 SSR 渲染）（${id.name}）`,
        has(id.name, 'Dashboard', '/anomalies'),
        false,
        `身份=「${id.name}」 页面=Dashboard`
      );
    }

    // ── 事项14：提醒条两条链接的权限门控（运行时证据）──
    // 直接调用 Dashboard 复用的那个纯函数（bundle 内真实模块），用与身份矩阵一致的
    // canView 结果作为入参，断言「无对应权限的身份不得产生指向无权限路由的 link」。
    const deriveLinks = mod.deriveDashboardAlertLinks;
    check('bundle 导出 deriveDashboardAlertLinks', typeof deriveLinks, 'function', '事项14');
    if (typeof deriveLinks === 'function') {
      const sampleCounts = { overdueOrders: 3, overdueAmount: 30, anomalies: 4 };
      for (const id of IDENTITIES) {
        const ctx = `身份=「${id.name}」 事项14 提醒条`;
        const items = deriveLinks(sampleCounts, {
          orders: canView(id.user, 'orders'),
          anomalies: canView(id.user, 'anomalies'),
        });
        // 核心：任何非 undefined 的 link 必须是该身份有权限的路由
        const offenders = items.filter(
          (it) => it.link !== undefined && !routeAllowed(id.user, pathnameOf(it.link), table)
        );
        check(`提醒条不得产生越权 link（${id.name}）`, offenders, [], ctx);
        // 逐条断言 link 的期望值
        check(
          `提醒条 overdue.link（${id.name}）`,
          items.find((it) => it.key === 'overdue')?.link,
          canView(id.user, 'orders') ? '/orders?refund=false' : undefined,
          ctx
        );
        check(
          `提醒条 anomalies.link（${id.name}）`,
          items.find((it) => it.key === 'anomalies')?.link,
          canView(id.user, 'anomalies') ? '/anomalies' : undefined,
          ctx
        );
        // 计数 >0 时文案必须保留（无权只取消跳转，不隐藏数据）
        check(
          `提醒条文案保留（${id.name}）`,
          items.map((it) => it.text),
          ['超期未返款 3 单', '数据异常 4 条'],
          ctx
        );
      }
    }

    // ── 非空性证据（防止“空转绿”）──
    const lens = htmlLens.length ? htmlLens : [0];
    const minLen = Math.min(...lens);
    const maxLen = Math.max(...lens);
    console.log(
      `[render-permission-matrix] 身份数=${IDENTITIES.length}，渲染次数=${htmlLens.length}，` +
        `HTML 长度区间=[${minLen}, ${maxLen}]，收集 href 总数=${totalHrefs}`
    );
    console.log(
      `[render-permission-matrix] 非空性：admin/Dashboard 锚点数=${adminDashboardAnchors}，` +
        `Dashboard 锚点合计=${dashboardAnchorsTotal}，受守卫路由数=${table.size}`
    );

    check('身份数 ≥ 6', IDENTITIES.length >= 6, true, '身份矩阵');
    check('HTML 长度全部 > 200', minLen > 200, true, '非空性');
    check('存在锚点（admin/Dashboard > 0，防空转绿）', adminDashboardAnchors > 0, true, '非空性');
    check('受守卫路由数 ≥ 10', table.size >= 10, true, `实际=${table.size}`);
  } finally {
    try {
      fs.unlinkSync(bundlePath);
    } catch {
      /* 临时产物清理失败不影响结论 */
    }
  }

  console.log(`\n========== render-permission-matrix：PASS=${passed}  FAIL=${failed} ==========`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[render-permission-matrix] 运行异常：', err);
  process.exit(1);
});
