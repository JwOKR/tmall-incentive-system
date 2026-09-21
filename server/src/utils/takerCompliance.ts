/**
 * 接单人账号资质合规判定工具
 *
 * 业务规则（现行）：只有三项核心条件参与合格判定
 * 1. 注册时间一年以上
 * 2. 完成实名认证
 * 3. 信誉等级 3 心（含）以上
 *
 * 参考信息（不参与合格判定）：
 * - 每周收货次数 / 每月收货次数：照常登记、照常展示，超限时仅在详情页标红提醒，
 *   既不产生 fails，也不造成「待完善」。详见 WEEKLY_RECEIPT_MAX / MONTHLY_RECEIPT_MAX。
 * - 资质截图（头像 / 账号与安全 / 待评价，共 3 张）：证据类材料，不参与合格判定，
 *   仅用于展示「截图 x/3」。详见 SCREENSHOT_TARGET。
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

/** 每周收货次数参考上限（不参与合格判定，仅用于展示标红提示） */
export const WEEKLY_RECEIPT_MAX = 5;

/** 每月收货次数参考上限（不参与合格判定，仅用于展示标红提示） */
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
  /**
   * 参考项：每周收货次数是否未超出参考上限。
   * 为空 → null；false 表示超出参考上限，仅供展示标红，不参与 status 判定。
   */
  weeklyOk: boolean | null;
  /**
   * 参考项：每月收货次数是否未超出参考上限。
   * 为空 → null；false 表示超出参考上限，仅供展示标红，不参与 status 判定。
   */
  monthlyOk: boolean | null;
  /**
   * 3 张截图是否传齐。仅作展示，不参与合格判定
   * （用户决策：截图是证据材料，Excel 批量导入必然为空，纳入判定会导致批量导入恒为待完善）。
   */
  screenshotsComplete: boolean;
  fails: string[];
}

/** 合规判定输入（结构兼容 Prisma OrderTaker 记录） */
export interface TakerComplianceInput {
  registerDate?: Date | string | null;
  isRealNameVerified?: boolean;
  creditLevel?: string | null;
  /** 参考项：每周收货次数，不参与合格判定 */
  weeklyReceiptCount?: number | null;
  /** 参考项：每月收货次数，不参与合格判定 */
  monthlyReceiptCount?: number | null;
  /** 列表查询只带此计数；若缺省则用三个截图字段回退计算 */
  screenshotCount?: number;
  avatarScreenshot?: string | null;
  securityScreenshot?: string | null;
  reviewScreenshot?: string | null;
  /** 资质信息最近登记时间（仅用于展示，不参与「是否登记过」判定） */
  accountInfoUpdatedAt?: Date | string | null;
}

/** 判断字段是否「已填写」（null / undefined / 空字符串均视为未填写；false 视为已填写） */
function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
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
 * 判定规则（只有三项核心条件参与判定）：
 * - registerDate <= 一年前 → registerOverOneYear = true；晚于 → false；为空 → null
 * - realNameVerified = !!isRealNameVerified；为 false 时计入 fails
 *   （实名是硬性门槛，必须显式确认为「是」）
 * - creditLevelOk：等级无法识别 → null；否则 rank >= 3
 * - weeklyOk：为空 → null；否则 <= 5。**参考项，不进 fails、不影响 status**
 * - monthlyOk：为空 → null；否则 <= 20。**参考项，不进 fails、不影响 status**
 * - screenshotsComplete：screenshotCount 缺省时用三个截图字段回退计算，等于 3 即齐全
 * - fails 仅包含三项核心条件的不通过项：注册未满一年 / 未完成实名认证 / 信誉等级不足3心
 * - missingRequired 仅包含：注册时间未填写、信誉等级未填写
 *   （实名只有「是/否」两态，无法区分「运营选了否」与「没登记」，
 *    故不进 missingRequired；未登记场景由 neverRegistered 保护兜底）
 * - status：
 *   1) 从未登记过任何资质信息 → 'incomplete'（历史数据不会被误判为不合格）
 *   2) 有 fails → 'unqualified'
 *   3) 任一必填项缺失 → 'incomplete'
 *   4) 否则 → 'qualified'
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

  // 实名认证是硬性门槛：未确认为「是」即视为不通过
  const realNameVerified = !!taker.isRealNameVerified;

  const rank = creditLevelRank(taker.creditLevel);
  const creditLevelOk: boolean | null = rank === null ? null : rank >= CREDIT_LEVEL_MIN_RANK;

  // 周/月收货次数降级为参考项：仍然计算并返回，供前端标红提示，但不进 fails
  const weeklyOk: boolean | null =
    taker.weeklyReceiptCount === null || taker.weeklyReceiptCount === undefined
      ? null
      : taker.weeklyReceiptCount <= WEEKLY_RECEIPT_MAX;

  const monthlyOk: boolean | null =
    taker.monthlyReceiptCount === null || taker.monthlyReceiptCount === undefined
      ? null
      : taker.monthlyReceiptCount <= MONTHLY_RECEIPT_MAX;

  // 列表行只带 screenshotCount；详情行带完整记录，缺省时用三个截图字段回退计算
  const screenshotCount = taker.screenshotCount ?? countScreenshots(taker);
  const screenshotsComplete = screenshotCount === SCREENSHOT_TARGET;

  // 只保留三项核心条件，周/月收货次数不再产生不通过项
  const fails: string[] = [];
  if (registerOverOneYear === false) fails.push('注册未满一年');
  if (!realNameVerified) fails.push('未完成实名认证');
  if (creditLevelOk === false) fails.push('信誉等级不足3心');

  // 以实质字段为准判断「是否登记过资质」：accountInfoUpdatedAt 仅用于展示最近登记时间，
  // 不能作为「已登记」的依据（服务端在全空载荷上也会盖时间戳）。
  // 从未登记过任何资质信息（含历史遗留数据）时一律视为「待完善」，
  // 避免资料还没收集就被误判成「不合格」。
  // 登记痕迹只看三项核心条件（注册时间 / 信誉等级）+ 截图：
  // 周/月收货次数已降级为参考信息，不再作为登记痕迹（只填周月不能再算「登记过资质」）。
  const hasAnyRegistration = registerDate !== null || rank !== null || screenshotCount > 0;

  // 截图不参与「合格」判定（用户决策：截图是证据类材料，Excel 批量导入必然为空，
  // 纳入判定会导致批量导入的接单人恒为「待完善」、列表合格数恒为 0）；
  // screenshotsComplete 仅作展示。
  // 必填项只剩三项核心中的两项可判空：注册时间、信誉等级
  // （实名是二态开关，缺失与「选了否」无法区分，交由 neverRegistered 保护处理）。
  const missingRequired = registerDate === null || !hasValue(taker.creditLevel);

  const neverRegistered = !hasAnyRegistration;

  let status: TakerCompliance['status'];
  if (neverRegistered) {
    status = 'incomplete';
  } else if (fails.length > 0) {
    status = 'unqualified';
  } else if (missingRequired) {
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
    // 从未登记过资质时，isRealNameVerified 的 false 只是数据库默认值而非运营的确认结果，
    // 不应作为「不通过项」对外暴露
    fails: neverRegistered ? [] : fails,
  };
}
