/**
 * 接单人账号资质相关常量与轻量判定工具（前端）。
 *
 * 说明：合规判定的权威实现位于后端 `server/src/utils/takerCompliance.ts`。
 * 前端此处保留一份等价的纯函数实现，仅用于详情页展示判定 badge
 * （详情接口返回的 taker 未附带 compliance 字段）。
 */

/** 信誉等级可选值（与后端保持一致，心 < 钻 < 冠，共 15 级） */
export const CREDIT_LEVELS: string[] = [
  '1心', '2心', '3心', '4心', '5心',
  '1钻', '2钻', '3钻', '4钻', '5钻',
  '1冠', '2冠', '3冠', '4冠', '5冠',
];

/** 最低合格信誉等级排名（3 心） */
export const CREDIT_LEVEL_MIN_RANK = 3;

export type ComplianceStatus = 'qualified' | 'unqualified' | 'incomplete';

interface ComplianceMetaItem {
  label: string;
  className: string;
}

/** 合规状态展示元数据（className 为语义色 class，形状类由组件补充） */
export const COMPLIANCE_META: Record<ComplianceStatus, ComplianceMetaItem> = {
  qualified: { label: '合格', className: 'badge-success' },
  unqualified: { label: '不合格', className: 'badge-danger' },
  incomplete: { label: '待完善', className: 'badge-warning' },
};

/** 将信誉等级转换为数值排名，无法识别或为空返回 null */
export function creditLevelRank(level?: string | null): number | null {
  if (!level) return null;
  const index = CREDIT_LEVELS.indexOf(level);
  return index >= 0 ? index + 1 : null;
}

export interface ClientCompliance {
  status: ComplianceStatus;
  fails: string[];
}

/**
 * 前端轻量合规判定（等价于后端 evaluateTakerCompliance 的 status / fails 部分）。
 */
export function evaluateTakerComplianceClient(taker: {
  registerDate?: string | Date | null;
  isRealNameVerified?: boolean;
  creditLevel?: string | null;
  weeklyReceiptCount?: number | null;
  monthlyReceiptCount?: number | null;
  screenshotCount?: number;
}): ClientCompliance {
  const fails: string[] = [];

  let registerOverOneYear: boolean | null = null;
  if (taker.registerDate) {
    const d = new Date(taker.registerDate);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const oneYearAgo = new Date(now.getTime());
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      registerOverOneYear = d.getTime() <= oneYearAgo.getTime();
    }
  }

  const realNameVerified = !!taker.isRealNameVerified;
  const rank = creditLevelRank(taker.creditLevel);
  const creditLevelOk = rank === null ? null : rank >= CREDIT_LEVEL_MIN_RANK;
  const weeklyOk =
    taker.weeklyReceiptCount === null || taker.weeklyReceiptCount === undefined
      ? null
      : taker.weeklyReceiptCount <= 5;
  const monthlyOk =
    taker.monthlyReceiptCount === null || taker.monthlyReceiptCount === undefined
      ? null
      : taker.monthlyReceiptCount <= 20;

  if (registerOverOneYear === false) fails.push('注册未满一年');
  if (!realNameVerified) fails.push('未完成实名认证');
  if (creditLevelOk === false) fails.push('信誉等级不足3心');
  if (weeklyOk === false) fails.push('每周收货次数超过5单');
  if (monthlyOk === false) fails.push('每月收货次数超过20单');

  let status: ComplianceStatus;
  if (fails.length > 0) {
    status = 'unqualified';
  } else if (
    !taker.registerDate ||
    !taker.creditLevel ||
    taker.weeklyReceiptCount === null ||
    taker.weeklyReceiptCount === undefined ||
    taker.monthlyReceiptCount === null ||
    taker.monthlyReceiptCount === undefined
  ) {
    status = 'incomplete';
  } else {
    status = 'qualified';
  }

  return { status, fails };
}
