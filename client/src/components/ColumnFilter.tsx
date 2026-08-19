import { useId, useMemo, useState } from 'react';

interface ColumnFilterProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'select' | 'date';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

const DATE_PRESETS = [
  { value: '', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: '7days', label: '近7天' },
  { value: '30days', label: '近30天' },
  { value: 'thisMonth', label: '本月' },
  { value: 'lastMonth', label: '上月' },
  { value: 'custom', label: '自定义' },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]['value'];

function localDateString(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateRangeForPreset(preset: Exclude<DatePreset, '' | 'custom'>, now: Date): [string, string] {
  const today = localDateString(now);
  if (preset === 'today') return [today, today];
  if (preset === 'yesterday') {
    const date = new Date(now); date.setDate(date.getDate() - 1);
    const result = localDateString(date); return [result, result];
  }
  if (preset === '7days' || preset === '30days') {
    const date = new Date(now); date.setDate(date.getDate() - (preset === '7days' ? 6 : 29));
    return [localDateString(date), today];
  }
  if (preset === 'thisMonth') return [localDateString(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  return [localDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)), localDateString(new Date(now.getFullYear(), now.getMonth(), 0))];
}

export default function ColumnFilter({
  value,
  onChange,
  type = 'text',
  options,
  placeholder = '筛选',
}: ColumnFilterProps) {
  const datalistId = useId();
  const [customStart, customEnd] = useMemo(() => {
    if (!value.startsWith('range:')) return ['', ''];
    const [start = '', end = ''] = value.slice(6).split(',');
    return [start, end];
  }, [value]);

  if (type === 'date') {
    const selectedPreset: DatePreset = value.startsWith('range:') ? 'custom' : (DATE_PRESETS.some((preset) => preset.value === value) ? value as DatePreset : '');
    const updateCustomRange = (start: string, end: string): void => onChange(start || end ? `range:${start},${end}` : '');
    return (
      <div className="mt-1 min-w-[130px]" onClick={(event) => event.stopPropagation()}>
        <select value={selectedPreset} onChange={(event) => {
          const preset = event.target.value as DatePreset;
          if (preset === 'custom') { onChange(`range:${customStart},${customEnd}`); return; }
          if (!preset) { onChange(''); return; }
          const [start, end] = dateRangeForPreset(preset, new Date());
          onChange(`range:${start},${end}`);
        }} className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs font-normal">
          {DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </select>
        {selectedPreset === 'custom' && (
          <div className="mt-1 flex gap-1">
            <input type="date" value={customStart} onChange={(event) => updateCustomRange(event.target.value, customEnd)} className="w-full min-w-0 rounded border border-input bg-background px-1 py-0.5 text-xs" />
            <input type="date" value={customEnd} onChange={(event) => updateCustomRange(customStart, event.target.value)} className="w-full min-w-0 rounded border border-input bg-background px-1 py-0.5 text-xs" />
          </div>
        )}
      </div>
    );
  }

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
    <>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        list={options && options.length > 0 ? datalistId : undefined}
        className="mt-1 w-full min-w-[70px] rounded border border-input bg-background px-1 py-0.5 text-xs font-normal"
      />
      {options && options.length > 0 && (
        <datalist id={datalistId}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </datalist>
      )}
    </>
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

/**
 * 通用客户端列排序函数
 * @param data 原始数据数组
 * @param config 排序配置 { field, direction } 或 null（无排序）
 * @param getField 获取字段值的函数，处理嵌套字段等
 */
export function sortData<T>(
  data: T[],
  config: { field: string; direction: 'asc' | 'desc' } | null,
  getField: (item: T, key: string) => any
): T[] {
  if (!config) return data;
  const { field, direction } = config;
  const sorted = [...data].sort((a, b) => {
    const aVal = getField(a, field);
    const bVal = getField(b, field);
    // 数字类型按数值比较
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    // 其他类型转字符串比较
    const aStr = String(aVal ?? '').toLowerCase();
    const bStr = String(bVal ?? '').toLowerCase();
    if (aStr < bStr) return direction === 'asc' ? -1 : 1;
    if (aStr > bStr) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}
