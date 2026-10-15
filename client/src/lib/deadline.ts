/** 把任意日期值转成 <input type="date"> 需要的 YYYY-MM-DD（空/非法 → ''） */
export const toDateInputValue = (value: any): string => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * 截止日期的紧急程度（按「日历日」比较，不受时刻影响）：
 *   overdue = 已超期（红）；soon = 临期（≤3 天，琥珀）；无 deadline → null。
 *
 * 这是全站超期判定的单一数据源，后端 anomalyController 与之一致。
 */
export const getDeadlineTone = (deadline: any): 'overdue' | 'soon' | null => {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return null;
};
