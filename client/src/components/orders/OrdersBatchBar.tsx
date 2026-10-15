import { CheckCircle, Star, Trash2 } from 'lucide-react';

// 批量操作条（原样提取自 pages/Orders.tsx 的 Batch Actions）。
// 选中行 >0 时由页面条件渲染。JSX 逐字复制，未改 className / 文案 / 逻辑。

export type OrdersBatchStatusField = 'isRefunded' | 'isGoodReview' | 'isBaseCommissionRefunded';

export interface OrdersBatchBarProps {
  selectedCount: number;
  onBatchStatus: (field: OrdersBatchStatusField, value: boolean | string) => void;
  batchStatusPending: boolean;
  onBatchDelete: () => void;
  batchDeletePending: boolean;
  onClearSelection: () => void;
}

export default function OrdersBatchBar({
  selectedCount,
  onBatchStatus,
  batchStatusPending,
  onBatchDelete,
  batchDeletePending,
  onClearSelection,
}: OrdersBatchBarProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-indigo-50/80 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex-wrap animate-fade-up">
      <span className="text-sm text-muted-foreground">
        已选择 <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedCount}</span> 项
      </span>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => onBatchStatus('isRefunded', true)}
        disabled={batchStatusPending}
        className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm"
      >
        <CheckCircle className="h-4 w-4" />
        批量已返款
      </button>
      <button
        onClick={() => onBatchStatus('isBaseCommissionRefunded', true)}
        disabled={batchStatusPending}
        className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50 transition-colors shadow-sm"
      >
        <CheckCircle className="h-4 w-4" />
        批量基础返佣已返款
      </button>
      <button
        onClick={() => onBatchStatus('isGoodReview', 'reviewed')}
        disabled={batchStatusPending}
        className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50 transition-colors shadow-sm"
      >
        <Star className="h-4 w-4" />
        批量已好评
      </button>
      <button
        onClick={onBatchDelete}
        disabled={batchDeletePending}
        className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors shadow-sm"
      >
        <Trash2 className="h-4 w-4" />
        {batchDeletePending ? '删除中...' : '批量删除'}
      </button>
      <button
        onClick={() => onClearSelection()}
        className="apple-btn text-sm text-muted-foreground hover:text-foreground ml-auto transition-colors"
      >
        取消选择
      </button>
    </div>
  );
}
