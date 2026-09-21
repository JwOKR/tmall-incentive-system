/**
 * 接单人账号资质合规判定工具
 *
 * 业务规则（原始诉求）：
 * 1. 注册时间一年以上，且完成实名认证
 * 2. 信誉等级 3 心（含）以上
 * 3. 每周收货次数 <= 5 单，每月收货次数 <= 20 单
 * 另需上传 3 张资质截图（头像 / 账号与安全 / 待评价）。
 *
 * 本模块为纯函数，不依赖 Prisma，便于复用与单元测试。
 */

/** 信誉等级可选值（心 < 钻 < 冠，共 15 级） */
export const CREDIT_LEVELS: readonly string[] = [
  '1心', '2心', '3心', '4心', '5心',
  '1钻', '2钻', '3钻', '4钻', '5钻',
  '1冠', '2冠', '3冠', '4冠', '5冠',
];

/** 最低合格信誉等级排名（3 心 = 第 3 级） */
export const CREDIT_LEVEL_MIN_RANK = 3;

/** 每周收货次数上限 */
export const WEEKLY_RECEIPT_MAX = 5;

/** 每月收货次数上限 */
export const MONTHLY_RECEIPT_MAX = 20;

/** 合规截图总张数 */
export const SCREENSHOT_TARGET = 3;

/**
 * 将信誉等级转换为数值排名。
 *
 * @param level 信誉等级字符串，如 '1心'、'3钻'
 * @returns 排名 1-15；无法识别或为空时返回 null
 */
export function creditLevelRank(level?: string | null): number | null {
  if (!level) return null;
  const index = CREDIT_LEVELS.indexOf(level);
  return index >= 0 ? index + 1 : null;
}

/**
 * 统计截图上传统计（0-3）。
 *
 * @param t 含三个截图字段的任意对象（允许字段缺失）
 * @returns 非空截图字段的数量
 */
export function countScreenshots(t: {
  avatarScreenshot?: string | null;
  securityScreenshot?: string | null;
  reviewScreenshot?: string | null;
}): number {
  let count = 0;
  if (t.avatarScreenshot) count++;
  if (t.securityScreenshot) count++;
  if (t.reviewScreenshot) count++;
  return count;
}

/** 合规判定结果 */
export interface TakerCompliance {
  status: 'qualified' | 'unqualified' | 'incomplete';
  registerOverOneYear: boolean | null;
  realNameVerified: boolean;
  creditLevelOk: boolean | null;
  weeklyOk: boolean | null;
  monthlyOk: boolean | null;
  screenshotsComplete: boolean;
  fails: string[];
}

/** 合规判定输入（结构兼容 Prisma OrderTaker 记录） */
export interface TakerComplianceInput {
  registerDate?: Date | string | null;
  isRealNameVerified?: boolean;
  creditLevel?: string | null;
  weeklyReceiptCount?: number | null;
  monthlyReceiptCount?: number | null;
  screenshotCount?: number;
}

/**
 * 归一化注册时间：空值返回 null，非法日期返回 null。
 */
function normalizeRegisterDate(registerDate?: Date | string | null): Date | null {
  if (registerDate === null || registerDate === undefined || registerDate === '') return null;
  const d = registerDate instanceof Date ? registerDate : new Date(registerDate);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 计算「一年前的今天」：以当前时间为基础，年份减 1。
 */
function oneYearAgoFrom(now: Date): Date {
  const oneYearAgo = new Date(now.getTime());
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return oneYearAgo;
}

/**
 * 综合判定接单人账号资质合规情况。
 *
 * 判定规则：
 * - registerDate <= 一年前 → registerOverOneYear = true；晚于 → false；为空 → null
 * - realNameVerified = !!isRealNameVerified（为 false 时计入 fails）
 * - creditLevelOk：等级无法识别 → null；否则 rank >= 3
 * - weeklyOk：为空 → null；否则 <= 5
 * - monthlyOk：为空 → null；否则 <= 20
 * - screenshotsComplete：screenshotCount === 3
 * - status：有 fails → 'unqualified'；否则任一必填项缺失 → 'incomplete'；否则 'qualified'
 */
export function evaluateTakerCompliance(taker: TakerComplianceInput): TakerCompliance {
  const registerDate = normalizeRegisterDate(taker.registerDate);
  const oneYearAgo = oneYearAgoFrom(new Date());

  let registerOverOneYear: boolean | null;
  if (registerDate === null) {
    registerOverOneYear = null;
  } else {
    registerOverOneYear = registerDate.getTime() <= oneYearAgo.getTime();
  }

  const realNameVerified = !!taker.isRealNameVerified;

  const rank = creditLevelRank(taker.creditLevel);
  const creditLevelOk: boolean | null = rank === null ? null : rank >= CREDIT_LEVEL_MIN_RANK;

  const weeklyOk: boolean | null =
    taker.weeklyReceiptCount === null || taker.weeklyReceiptCount === undefined
      ? null
      : taker.weeklyReceiptCount <= WEEKLY_RECEIPT_MAX;

  const monthlyOk: boolean | null =
    taker.monthlyReceiptCount === null || taker.monthlyReceiptCount === undefined
      ? null
      : taker.monthlyReceiptCount <= MONTHLY_RECEIPT_MAX;

  const screenshotsComplete = (taker.screenshotCount ?? 0) === SCREENSHOT_TARGET;

  const fails: string[] = [];
  if (registerOverOneYear === false) fails.push('注册未满一年');
  if (!realNameVerified) fails.push('未完成实名认证');
  if (creditLevelOk === false) fails.push('信誉等级不足3心');
  if (weeklyOk === false) fails.push('每周收货次数超过5单');
  if (monthlyOk === false) fails.push('每月收货次数超过20单');

  let status: TakerCompliance['status'];
  if (fails.length > 0) {
    status = 'unqualified';
  } else if (
    registerDate === null ||
    taker.creditLevel === null ||
    taker.creditLevel === undefined ||
    taker.creditLevel === '' ||
    taker.weeklyReceiptCount === null ||
    taker.weeklyReceiptCount === undefined ||
    taker.monthlyReceiptCount === null ||
    taker.monthlyReceiptCount === undefined
  ) {
    status = 'incomplete';
  } else {
    status = 'qualified';
  }

  return {
    status,
    registerOverOneYear,
    realNameVerified,
    creditLevelOk,
    weeklyOk,
    monthlyOk,
    screenshotsComplete,
    fails,
  };
}
