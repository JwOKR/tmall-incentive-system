interface ColumnFilterProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export default function ColumnFilter({
  value,
  onChange,
  type = 'text',
  options,
  placeholder = '筛选',
}: ColumnFilterProps) {
  if (type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-w-[70px] rounded border border-input bg-background px-1 py-0.5 text-xs font-normal"
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">全部</option>
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 w-full min-w-[70px] rounded border border-input bg-background px-1 py-0.5 text-xs font-normal"
    />
  );
}

/**
 * 通用客户端列筛选函数
 * @param data 原始数据数组
 * @param filters 列筛选值 { field: value }
 * @param getField 获取字段值的函数，处理嵌套字段等
 */
export function filterData<T>(
  data: T[],
  filters: Record<string, string>,
  getField: (item: T, key: string) => string
): T[] {
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  if (activeFilters.length === 0) return data;

  return data.filter((item) => {
    return activeFilters.every(([key, value]) => {
      const cellValue = getField(item, key).toLowerCase();
      return cellValue.includes(value.toLowerCase());
    });
  });
}
