/**
 * 通用日期解析函数（支持多种格式）
 * - Excel 日期序列号（数字）
 * - ISO 字符串 / 本地日期字符串
 * - 无效输入返回 null
 */
export function parseExcelDate(dateValue: unknown): Date | null {
  if (dateValue == null || dateValue === '') return null;

  // Excel 日期序列号：从 1900-01-01 开始的天数（注意 Excel 的 1900 闰年 bug）
  if (typeof dateValue === 'number') {
    if (!Number.isFinite(dateValue)) return null;
    // 25569 = 1970-01-01 的 Excel 序列号；先做 UTC 纯算，再取本地日历日，
    // 保证任何时区下「日期部分」都等于 Excel 中的日期（旧实现用本地纪元会早 1 天）
    const utc = new Date(Date.UTC(1970, 0, 1) + (dateValue - 25569) * 24 * 60 * 60 * 1000);
    if (isNaN(utc.getTime())) return null;
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Date 实例直接返回
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }

  return null;
}
