/**
 * 好评返佣默认金额：取值解析（纯函数，不依赖 Prisma，便于复用与单元测试）
 *
 * 业务口径（用户已确认）：
 * - 系统设置项 `review_commission_amount` 保存「好评返佣默认金额」；
 * - 订单被标记为「已好评」时，好评返佣一律覆盖为该值（默认 3 元）；
 * - 该值缺省 / 非法时回退到 DEFAULT_REVIEW_COMMISSION（3）；
 * - `0` 是合法值（管理员显式设 0 表示「不返好评返佣」），不得回退。
 *
 * 规则只此一处，orderService / systemSettingService 均引用本模块，避免口径分叉。
 */

/** 好评返佣默认金额（元） */
export const DEFAULT_REVIEW_COMMISSION = 3;

/** 保存「好评返佣默认金额」的系统设置键 */
export const REVIEW_COMMISSION_SETTING_KEY = 'review_commission_amount';

/**
 * 把系统设置里保存的「好评返佣默认金额」原始字符串解析为数字。
 *
 * 回退规则：null / undefined / 空串（含纯空白）/ 非数字 / NaN / Infinity / 负数
 * 一律回退到 DEFAULT_REVIEW_COMMISSION（3）。
 * `0` 视为合法值（管理员显式设 0 表示不返好评返佣），不得回退。
 *
 * @param raw 系统设置原始值（字符串或 null/undefined）
 * @returns 解析后的金额（元）
 */
export function parseReviewCommissionSetting(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_REVIEW_COMMISSION;

  const trimmed = String(raw).trim();
  if (trimmed === '') return DEFAULT_REVIEW_COMMISSION;

  const value = Number(trimmed);
  // Number('') 已在上面拦截；这里 !Number.isFinite 同时覆盖 NaN / Infinity / -Infinity
  if (!Number.isFinite(value)) return DEFAULT_REVIEW_COMMISSION;
  if (value < 0) return DEFAULT_REVIEW_COMMISSION;

  return value;
}
