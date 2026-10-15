/**
 * 权限模块名唯一真源（后端）。
 *
 * 与前端 `client/src/pages/Settings.tsx` 的 `PERMISSION_MODULES` **逐字一致**（10 个）。
 * 刻意**不含 `settings`**：`/api/settings` 与 `/api/admin` 已改为真正的 admin-only
 * 硬拒（middleware/auth 的 `requireAdmin`，不看 permissions），前端勾选列表也不提供该键。
 *
 * 前后端模块名对应关系（后端 requireViewPermission('x') ↔ 前端 moduleMap）：
 *   dashboard     ↔ dashboard   （数据汇总）
 *   orders        ↔ orders      （订单明细）
 *   takers        ↔ takers      （接单人）
 *   tasks         ↔ tasks       （任务）
 *   intervals     ↔ intervals   （接单间隔）
 *   commissions   ↔ commissions （佣金分析）
 *   logs          ↔ logs        （操作日志）
 *   anomalies     ↔ anomalies   （异常预警）
 *   export        ↔ export      （数据导出）
 *   repeatDiscounts ↔ repeatDiscounts（回头客立减）
 *   （settings ↔ settings 仅存在于前端 moduleMap 的文案映射；其路由由 requireAdmin 硬拒，非模块权限）
 */
export const PERMISSION_MODULES: readonly string[] = [
  'dashboard',
  'orders',
  'takers',
  'tasks',
  'intervals',
  'commissions',
  'logs',
  'anomalies',
  'export',
  'repeatDiscounts',
];

const PERMISSION_MODULE_SET = new Set(PERMISSION_MODULES);

/** 单个模块权限的允许内层键（与前端 ModulePermission = { view, edit } 对齐） */
const ALLOWED_VALUE_KEYS = ['view', 'edit'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 校验前端提交的 permissions 结构，写入库前调用。
 *
 * 形状（与前端 `Settings.tsx` 勾选后 POST 的体一致）：
 *   { [module]: { view: boolean, edit: boolean } }
 *
 * 返回 `null` 表示通过；返回字符串表示校验失败，字符串即应回传给前端的错误信息。
 *
 * 规则：
 *   - 顶层必须是对象（数组/null 视为形状错误）；
 *   - 键名必须属于 PERMISSION_MODULES，未知模块名 → 报错并回显非法键名；
 *   - 每个值必须是对象，且内层键只能是 view/edit，二者都必须是布尔；
 *   - 值类型错误（如 view 传字符串）→ 报错。
 *   注意：本函数**不做裁剪**，形状不符一律拒绝。
 */
export function validatePermissions(permissions: unknown): string | null {
  if (!isPlainObject(permissions)) {
    return 'permissions 格式错误：应为 { 模块: { view: boolean, edit: boolean } } 对象';
  }

  for (const [moduleName, value] of Object.entries(permissions)) {
    if (!PERMISSION_MODULE_SET.has(moduleName)) {
      return `包含未知权限模块: ${moduleName}`;
    }
    if (!isPlainObject(value)) {
      return `权限模块 ${moduleName} 的值格式错误：应为 { view: boolean, edit: boolean }`;
    }
    for (const key of Object.keys(value)) {
      if (!ALLOWED_VALUE_KEYS.includes(key)) {
        return `权限模块 ${moduleName} 含未知字段: ${key}`;
      }
    }
    if (typeof value.view !== 'boolean') {
      return `权限模块 ${moduleName} 的 view 必须为布尔值`;
    }
    if (typeof value.edit !== 'boolean') {
      return `权限模块 ${moduleName} 的 edit 必须为布尔值`;
    }
  }

  return null;
}
