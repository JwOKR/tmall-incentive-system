/**
 * dashboardAlerts.ts —— Dashboard「提醒条」派生逻辑（纯函数，零依赖、零副作用）
 *
 * 背景：Dashboard.tsx 页内的提醒条（alerts）由 `useEffect → setAlerts` 驱动，
 * 而 SSR 不运行 effect —— 因此提醒条里两条链接的权限门控此前**只有源码级证据**。
 * 把派生逻辑抽成纯函数后，可被独立用例化断言（见 __tests__/dashboardAlerts.test.ts），
 * 补齐运行时证据。
 *
 * 约定（与全仓一致）：
 *   - 业务权限判定只有唯一出口 `usePermissions().canView(...)`，**不得在本文件复制判定**。
 *     故本文件不 import 权限模块，而是把「权限判定结果」作为入参接收（布尔），保持纯函数。
 *   - 承载数据的链接无权时「保留展示、仅取消跳转」：link 为 undefined 表示渲染为不可点击。
 *
 * 行为等价性：本文件的两个函数与 Dashboard.tsx 中「旧内联逻辑」逐字等价
 * （同一输入 → 同一输出，含文案、字段、顺序、条件分支）。
 */

/** 提醒条计数（与 Dashboard.tsx 原 `alerts` state 结构一致） */
export interface DashboardAlertCounts {
  /** 超期未返款订单数 */
  overdueOrders: number;
  /** 超期未返款金额合计 */
  overdueAmount: number;
  /** 数据异常条数 */
  anomalies: number;
}

/** 提醒条两条链接各自的权限判定结果（由调用方传入 usePermissions().canView 的结果） */
export interface DashboardAlertPermissions {
  /** canView('orders') */
  orders: boolean;
  /** canView('anomalies') */
  anomalies: boolean;
}

/** 提醒条链接项：link 为 undefined 表示「无权 → 不可点击，仅展示」 */
export interface DashboardAlertLinkItem {
  key: 'overdue' | 'anomalies';
  text: string;
  link?: string;
}

/**
 * 从 remindApi.getRefundAlerts() / anomalyApi.getAnomalies() 两个响应派生提醒条计数。
 * 等价于 Dashboard.tsx 原 useEffect 内的内联对象字面量（含 `?? 0` 兜底）。
 */
export function deriveDashboardAlertCounts(
  refundRes: unknown,
  anomalyRes: unknown
): DashboardAlertCounts {
  return {
    overdueOrders: (refundRes as any)?.data?.summary?.totalOrders ?? 0,
    overdueAmount: (refundRes as any)?.data?.summary?.totalAmount ?? 0,
    anomalies: (anomalyRes as any)?.data?.summary?.totalAnomalies ?? 0,
  };
}

/**
 * 把计数 + 权限判定结果派生成提醒条链接项（含权限门控）：
 *   - 计数为 0 的项不产生（与页面 `alerts.x > 0 &&` 条件一致）；
 *   - 有权限 → link 为对应路由；无权限 → link 为 undefined（保留文案、取消跳转）。
 * 顺序固定为「超期未返款 → 数据异常」，与页面 DOM 顺序一致。
 */
export function deriveDashboardAlertLinks(
  counts: DashboardAlertCounts,
  can: DashboardAlertPermissions
): DashboardAlertLinkItem[] {
  const items: DashboardAlertLinkItem[] = [];
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
