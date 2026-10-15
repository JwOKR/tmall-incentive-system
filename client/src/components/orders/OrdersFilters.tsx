import { Search, Calendar } from 'lucide-react';

// 筛选区（原样提取自 pages/Orders.tsx 的 Filters：搜索框 / 状态下拉 / 日期区间 / 快捷预设）。
// JSX 逐字复制，未改 className / 文案 / 逻辑。

export type OrdersDatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'custom' | 'clear';

export interface OrdersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  refundFilter: string;
  onRefundFilterChange: (value: string) => void;
  reviewFilter: string;
  onReviewFilterChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  applyDatePreset: (preset: OrdersDatePreset) => void;
}

export default function OrdersFilters({
  search,
  onSearchChange,
  refundFilter,
  onRefundFilterChange,
  reviewFilter,
  onReviewFilterChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  applyDatePreset,
}: OrdersFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <textarea
            rows={2}
            placeholder="批量搜索产品编号、商品ID、订单编号（支持换行、逗号、顿号、分号、空格）..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="apple-input w-full resize-y rounded-xl border bg-card pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <select
          value={refundFilter}
          onChange={(e) => onRefundFilterChange(e.target.value)}
          className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
        >
          <option value="">返款状态</option>
          <option value="true">已返款</option>
          <option value="false">未返款</option>
        </select>
        <select
          value={reviewFilter}
          onChange={(e) => onReviewFilterChange(e.target.value)}
          className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
        >
          <option value="">好评状态</option>
          <option value="pending">未好评</option>
          <option value="reviewed">已好评</option>
          <option value="creating">作图中</option>
          <option value="returned">已返图</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => { onStartDateChange(e.target.value); }}
            className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
            placeholder="开始日期"
          />
          <span className="text-muted-foreground text-sm">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { onEndDateChange(e.target.value); }}
            className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
            placeholder="结束日期"
          />
        </div>
      </div>
      {/* Quick date presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {[
          { label: '今天', value: 'today' as const },
          { label: '昨天', value: 'yesterday' as const },
          { label: '近7天', value: '7days' as const },
          { label: '近30天', value: '30days' as const },
          { label: '本月', value: 'thisMonth' as const },
          { label: '上月', value: 'lastMonth' as const },
          { label: '自定义', value: 'custom' as const },
          { label: '全部', value: 'clear' as const },
        ].map(preset => (
          <button
            key={preset.value}
            onClick={() => applyDatePreset(preset.value)}
            className="apple-btn rounded-lg border bg-card px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
