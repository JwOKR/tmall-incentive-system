/**
 * 通用日期解析函数（支持多种格式）
 * - Excel 日期序列号（数字）
 * - ISO 字符串 / 本地日期字符串
 * - 无效输入返回 null
 */
export function parseExcelDate(dateValue: unknown): Date | null {
  if (dateValue == null || dateValue === '') return null;

  // Excel 日期序列号：从 1900-01-01 开始的天数（注意 Excel 的 1900 闰年 bug，需 -2）
  if (typeof dateValue === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const d = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
    return isNaN(d.getTime()) ? null : d;
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
