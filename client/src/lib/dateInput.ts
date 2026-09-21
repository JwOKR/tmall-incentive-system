/**
 * 日期手动输入解析工具
 *
 * 把用户手写的常见日期格式解析为标准 'YYYY-MM-DD' 字符串，
 * 供注册时间等日期字段的 text 输入框使用。
 *
 * 支持格式（日缺省时按 1 日处理）：
 *   2024-05-01 / 2024/5/1 / 2024.5.1
 *   2024年5月1日 / 2024年5月
 *   2024-05 / 2024/5
 *   20240501（8 位纯数字，按 YYYYMMDD）
 *   202405（6 位纯数字，按 YYYYMM）
 *
 * 不依赖 new Date() 的隐式解析（不同引擎对 ISO 缺日格式行为不一致），
 * 全部自行拆数字并做月份/天数/闰年校验；不合法或无法解析时返回 null。
 */

export interface FlexibleDateParseResult {
  /** 规范化后的 'YYYY-MM-DD' */
  date: string;
  /** 输入中是否缺少"日"（如 2024-05 / 202405 / 2024年5月），此时日按 1 处理 */
  dayMissing: boolean;
}

/** 每个月的常规天数（下标 0 = 1 月） */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 是否闰年 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 指定年月的实际天数 */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/** 个位数字补零 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 组装并校验年月日，返回 'YYYY-MM-DD'；
 * 月/日/年范围或天数不合法时返回 null。
 */
function buildDate(year: number, month: number, day: number): string | null {
  // 年份必须是 4 位数字（1000-9999），避免 2 位年份等歧义输入
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * 解析手写日期输入。
 *
 * @param input 用户输入的原始字符串（自动 trim）
 * @returns 解析结果（含规范化日期与"日缺省"标记）；无法解析或不合法返回 null
 *
 * @example
 * parseFlexibleDateDetail('2024/5/1')   // { date: '2024-05-01', dayMissing: false }
 * parseFlexibleDateDetail('2024年5月')  // { date: '2024-05-01', dayMissing: true }
 * parseFlexibleDateDetail('2024-13-01') // null
 */
export function parseFlexibleDateDetail(input: string): FlexibleDateParseResult | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  let year: number;
  let month: number;
  let day: number;
  let dayMissing = false;

  // 1) 纯数字：8 位按 YYYYMMDD，6 位按 YYYYMM
  if (/^\d+$/.test(text)) {
    if (text.length === 8) {
      year = Number(text.slice(0, 4));
      month = Number(text.slice(4, 6));
      day = Number(text.slice(6, 8));
    } else if (text.length === 6) {
      year = Number(text.slice(0, 4));
      month = Number(text.slice(4, 6));
      day = 1;
      dayMissing = true;
    } else {
      return null;
    }
  } else {
    // 2) 中文格式：2024年5月1日（"日"可省略）
    const cnMatch = text.match(/^(\d{4})年(\d{1,2})月(?:\d{1,2}日?)?$/);
    if (cnMatch) {
      year = Number(cnMatch[1]);
      month = Number(cnMatch[2]);
      const dayPart = text.match(/^(\d{4})年\d{1,2}月(\d{1,2})日?$/);
      if (dayPart) {
        day = Number(dayPart[2]);
      } else {
        day = 1;
        dayMissing = true;
      }
    } else {
      // 3) 分隔符格式：2024-05-01 / 2024/5/1 / 2024.5.1（可只到月）
      const sepMatch = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/);
      if (sepMatch) {
        year = Number(sepMatch[1]);
        month = Number(sepMatch[2]);
        if (sepMatch[3] !== undefined) {
          day = Number(sepMatch[3]);
        } else {
          day = 1;
          dayMissing = true;
        }
      } else {
        return null;
      }
    }
  }

  const date = buildDate(year, month, day);
  if (!date) return null;
  return { date, dayMissing };
}

/**
 * 解析手写日期输入为 'YYYY-MM-DD'。
 *
 * @param input 用户输入的原始字符串（自动 trim）
 * @returns 规范化后的 'YYYY-MM-DD'；无法解析或不合法返回 null
 *
 * @example
 * parseFlexibleDate('20240501')   // '2024-05-01'
 * parseFlexibleDate('2024-05')    // '2024-05-01'（日缺省按 1 日）
 * parseFlexibleDate('2024.2.30')  // null（2 月无 30 日）
 */
export function parseFlexibleDate(input: string): string | null {
  const result = parseFlexibleDateDetail(input);
  return result ? result.date : null;
}
