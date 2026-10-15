/**
 * dashboardAlerts 单元测试（自带断言，零依赖）。
 *
 * 覆盖两件事：
 *   ① 等价性：deriveDashboardAlertCounts / deriveDashboardAlertLinks 与 Dashboard.tsx
 *      「旧内联逻辑」对 N 组输入逐字等价（含 `?? 0` 兜底、文案、字段、顺序、条件分支）；
 *   ② 权限门控：无对应权限的身份**不得**产生指向无权限路由的 link
 *      （link===undefined → 渲染为不可点击，保留数据文案）。
 *
 * 说明：本仓库前端未安装 vitest（见 lib/__tests__/dateInput.test.ts 的同类说明），
 * 故此测试写成「自带断言」的独立脚本，不 import vitest，保持 tsc 零报错。
 *
 * 运行（Node 原生支持 TS 类型擦除）：
 *   node client/src/lib/__tests__/dashboardAlerts.test.ts
 */
import {
  deriveDashboardAlertCounts,
  deriveDashboardAlertLinks,
  type DashboardAlertCounts,
  type DashboardAlertPermissions,
} from '../dashboardAlerts.ts';

let passed = 0;
let failed = 0;

/** 断言工具：与 server/tests 风格一致，失败时打印期望/实际 */
function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

// ─────────────────── ① 旧的「内联逻辑」作为等价性 oracle ───────────────────
/** 逐字复刻 Dashboard.tsx 原 useEffect 内的内联对象字面量 */
function legacyCounts(refundRes: any, anomalyRes: any): DashboardAlertCounts {
  return {
    overdueOrders: refundRes?.data?.summary?.totalOrders ?? 0,
    overdueAmount: refundRes?.data?.summary?.totalAmount ?? 0,
    anomalies: anomalyRes?.data?.summary?.totalAnomalies ?? 0,
  };
}

/** 逐字复刻提醒条旧 JSX 的两段 `alerts.x > 0 && <OptionalLink to={canViewX ? … : undefined}>` */
function legacyLinkItems(counts: DashboardAlertCounts, can: DashboardAlertPermissions) {
  const items: { key: 'overdue' | 'anomalies'; text: string; link?: string }[] = [];
  if (counts.overdueOrders > 0) {
    items.push({
      key: 'overdue',
      text: `超期未返款 ${counts.overdueOrders} 单`,
      link: can.orders ? '/orders?refund=false' : undefined,
    });
  }
  if (counts.anomalies > 0) {
    items.push({
      key: 'anomalies',
      text: `数据异常 ${counts.anomalies} 条`,
      link: can.anomalies ? '/anomalies' : undefined,
    });
  }
  return items;
}

// ─────────────────── ② 计数派生：≥5 组输入，等价 + 硬编码期望 ───────────────────
const countCases: { name: string; refund: any; anomaly: any }[] = [
  {
    name: '两响应齐全',
    refund: { data: { summary: { totalOrders: 5, totalAmount: 120.5 } } },
    anomaly: { data: { summary: { totalAnomalies: 2 } } },
  },
  { name: '两响应均为 null', refund: null, anomaly: null },
  { name: '两响应均为 undefined', refund: undefined, anomaly: undefined },
  { name: 'summary 缺失', refund: { data: {} }, anomaly: { data: {} } },
  { name: '仅 refund 有值（anomaly 缺字段）', refund: { data: { summary: { totalOrders: 0, totalAmount: 0 } } }, anomaly: { data: { summary: {} } } },
  { name: 'refund 缺 totalAmount', refund: { data: { summary: { totalOrders: 7 } } }, anomaly: { data: { summary: { totalAnomalies: 3 } } } },
  {
    name: '含 0 / 负数边界',
    refund: { data: { summary: { totalOrders: 0, totalAmount: -1 } } },
    anomaly: { data: { summary: { totalAnomalies: 0 } } },
  },
];
for (const c of countCases) {
  const inputSnap = JSON.stringify(c);
  check(
    `等价性(counts): ${c.name}`,
    deriveDashboardAlertCounts(c.refund, c.anomaly),
    legacyCounts(c.refund, c.anomaly)
  );
  if (JSON.stringify(c) !== inputSnap) {
    // 防呆：确保用例输入未被就地修改（纯函数不应改入参）
    check(`纯函数不修改入参: ${c.name}`, JSON.stringify(c), inputSnap);
  }
}
// 硬编码期望（不依赖 oracle，防自证）
check(
  '硬编码(counts): 两响应齐全',
  deriveDashboardAlertCounts(
    { data: { summary: { totalOrders: 5, totalAmount: 120.5 } } },
    { data: { summary: { totalAnomalies: 2 } } }
  ),
  { overdueOrders: 5, overdueAmount: 120.5, anomalies: 2 }
);
check(
  '硬编码(counts): 全部非法值兜底为 0',
  deriveDashboardAlertCounts(null, undefined),
  { overdueOrders: 0, overdueAmount: 0, anomalies: 0 }
);

// ─────────────────── ③ 链接派生：权限门控（核心）───────────────────
const linkCases: { name: string; counts: DashboardAlertCounts; can: DashboardAlertPermissions }[] = [
  { name: '双计数为 0 → 无条目', counts: { overdueOrders: 0, overdueAmount: 0, anomalies: 0 }, can: { orders: false, anomalies: false } },
  { name: '仅超期 + 无 orders 权限 → link=undefined', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 0 }, can: { orders: false, anomalies: false } },
  { name: '仅超期 + 有 orders 权限 → link=/orders?refund=false', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 0 }, can: { orders: true, anomalies: false } },
  { name: '仅异常 + 无 anomalies 权限 → link=undefined', counts: { overdueOrders: 0, overdueAmount: 0, anomalies: 4 }, can: { orders: false, anomalies: false } },
  { name: '仅异常 + 有 anomalies 权限 → link=/anomalies', counts: { overdueOrders: 0, overdueAmount: 0, anomalies: 4 }, can: { orders: false, anomalies: true } },
  { name: '两者皆有计数但均无权限', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 4 }, can: { orders: false, anomalies: false } },
  { name: '两者皆有计数：仅 anomalies 有权限', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 4 }, can: { orders: false, anomalies: true } },
  { name: '两者皆有计数：仅 orders 有权限', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 4 }, can: { orders: true, anomalies: false } },
  { name: '两者皆有计数：均有权限', counts: { overdueOrders: 3, overdueAmount: 30, anomalies: 4 }, can: { orders: true, anomalies: true } },
];
for (const c of linkCases) {
  const got = deriveDashboardAlertLinks(c.counts, c.can);
  // 等价性：与新纯函数 vs 旧 JSX oracle
  check(`等价性(links): ${c.name}`, got, legacyLinkItems(c.counts, c.can));
  // 硬编码门控不变量：任何 link 非 undefined 都必须「有对应权限」
  const violation = got.find(
    (it) =>
      it.link !== undefined &&
      !(
        (it.key === 'overdue' && c.can.orders && it.link.startsWith('/orders')) ||
        (it.key === 'anomalies' && c.can.anomalies && it.link.startsWith('/anomalies'))
      )
  );
  check(`门控不变量(links): ${c.name} 无权不得产生越权 link`, violation ?? null, null);
}

// 硬编码期望（核心门控）
check(
  '硬编码(links): 无 orders 权限时 overdue.link 必须为 undefined',
  deriveDashboardAlertLinks(
    { overdueOrders: 3, overdueAmount: 30, anomalies: 0 },
    { orders: false, anomalies: false }
  ),
  [{ key: 'overdue', text: '超期未返款 3 单', link: undefined }]
);
check(
  '硬编码(links): 有 orders 权限时 overdue.link=/orders?refund=false',
  deriveDashboardAlertLinks(
    { overdueOrders: 3, overdueAmount: 30, anomalies: 0 },
    { orders: true, anomalies: false }
  ),
  [{ key: 'overdue', text: '超期未返款 3 单', link: '/orders?refund=false' }]
);
check(
  '硬编码(links): 无 anomalies 权限时 anomalies.link=undefined，且文案与顺序不变',
  deriveDashboardAlertLinks(
    { overdueOrders: 2, overdueAmount: 20, anomalies: 4 },
    { orders: false, anomalies: false }
  ),
  [
    { key: 'overdue', text: '超期未返款 2 单', link: undefined },
    { key: 'anomalies', text: '数据异常 4 条', link: undefined },
  ]
);

console.log(`\n========== dashboardAlerts 结果：PASS=${passed}  FAIL=${failed} ==========`);
if (failed > 0) {
  process.exit(1);
}
