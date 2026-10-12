/**
 * 接单人风控判定工具（**单一数据源**）
 *
 * 与 takerCompliance.ts（账号资质）并列但职责不同：
 * - takerCompliance：判定账号「资质」是否合格（注册时间 / 实名 / 信誉等级）。
 * - takerRisk（本文件）：判定账号是否被「风控 / 拉黑」硬拦截（riskFlag / status='suspended'）。
 *
 * 业务规则：
 * - riskFlag === true            → 风控标记，硬拦截
 * - status   === 'suspended'     → 已拉黑 / 暂停，硬拦截
 * 二者任一命中即视为「被拦截」。blacklistReason 仅用于展示原因，不参与布尔判定。
 *
 * 重要：本判定只服务「快速接单」（POST /api/tasks/quick-order）这一个入口，
 * 且拦截点在 $transaction 之前、零副作用。Excel 批量导入订单（历史补录）不受此限制。
 *
 * 本模块为纯函数，不依赖 Prisma，便于复用与单元测试；
 * 前端**不得**复制一份等价判定，一律消费接口返回的 `risk` 字段。
 */

/** 被拉黑/暂停的状态值（与 schema.prisma order_takers.status 注释一致） */
export const TAKER_STATUS_SUSPENDED = 'suspended';

/** 风控判定输入（结构兼容 Prisma OrderTaker 记录，允许字段缺失） */
export interface TakerRiskInput {
  /** 风控标记：true 表示被风控，硬拦截 */
  riskFlag?: boolean | null;
  /** 接单人状态：active / inactive / suspended */
  status?: string | null;
  /** 黑名单/风控原因（仅展示） */
  blacklistReason?: string | null;
}

/** 风控判定结果 */
export interface TakerRisk {
  /** 是否被硬拦截（riskFlag 或 suspended 任一命中） */
  blocked: boolean;
  /** 命中的布尔信号，便于展示与调试 */
  riskFlag: boolean;
  suspended: boolean;
  /** 命中的原因文案（中文，供拼接展示） */
  reasons: string[];
}

/**
 * 综合判定接单人是否被风控硬拦截。
 *
 * @param taker 含 riskFlag / status 的任意对象（允许字段缺失）
 * @returns TakerRisk 判定结果
 */
export function evaluateTakerRisk(taker: TakerRiskInput | null | undefined): TakerRisk {
  const riskFlag = taker?.riskFlag === true;
  const suspended = taker?.status === TAKER_STATUS_SUSPENDED;

  const reasons: string[] = [];
  if (riskFlag) reasons.push('账号已被风控标记');
  if (suspended) reasons.push('账号已被拉黑/暂停');

  return {
    blocked: riskFlag || suspended,
    riskFlag,
    suspended,
    reasons,
  };
}

/**
 * 便捷布尔判定：是否被风控拦截。
 *
 * @param taker 含 riskFlag / status 的任意对象
 * @returns true 表示应被硬拦截
 */
export function isTakerRiskBlocked(taker: TakerRiskInput | null | undefined): boolean {
  return evaluateTakerRisk(taker).blocked;
}

/**
 * 生成「因风控被拦截」时对外展示的原因文案（纯函数，便于单测）。
 *
 * 文案示例：
 * - 命中风控标记：「该接单人已被风控拦截（账号已被风控标记）：<原因>」
 * - 命中拉黑   ：「该接单人已被风控拦截（账号已被拉黑/暂停）：<原因>」
 * - 未命中     ：返回空字符串
 *
 * @param taker 含 riskFlag / status / blacklistReason 的任意对象
 * @returns 可读的拒绝原因；未命中时返回空字符串
 */
export function describeRiskBlock(taker: TakerRiskInput | null | undefined): string {
  const risk = evaluateTakerRisk(taker);
  if (!risk.blocked) return '';

  const detail = risk.reasons.join('、');
  const base = `该接单人已被风控拦截（${detail}）`;
  const reason = typeof taker?.blacklistReason === 'string' && taker.blacklistReason.trim() !== ''
    ? taker.blacklistReason.trim()
    : '';
  return reason ? `${base}：${reason}` : base;
}
