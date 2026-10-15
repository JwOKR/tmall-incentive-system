import { PAGE_SIZE_OPTIONS } from '@/lib/orderListConfig';

// 分页条（原样提取自 pages/Orders.tsx 的 Pagination）。JSX 逐字复制。

export interface OrdersPaginationProps {
  /** 结果总数（由服务端返回） */
  total: number;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export default function OrdersPagination({ total, page, setPage, totalPages, pageSize, onPageSizeChange }: OrdersPaginationProps) {
  return (
    <div className="flex justify-center items-center gap-3 flex-wrap">
      <span className="text-sm text-muted-foreground tabular-nums">共 {total} 条</span>
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
        className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        上一页
      </button>
      <span className="flex items-center px-4 text-sm text-muted-foreground tabular-nums">
        第 {page} 页 / 共 {totalPages} 页
      </span>
      <button
        onClick={() => setPage(p => p + 1)}
        disabled={page >= totalPages}
        className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        下一页
      </button>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="apple-btn rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {PAGE_SIZE_OPTIONS.map(n => (
          <option key={n} value={n}>{n} 条/页</option>
        ))}
      </select>
    </div>
  );
}
