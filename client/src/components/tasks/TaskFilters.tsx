import type React from 'react';
import { Search } from 'lucide-react';

interface TaskFiltersProps {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
}

export function TaskFilters({ search, setSearch, statusFilter, setStatusFilter }: TaskFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索商品ID、产品编号..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="apple-input w-full rounded-xl border bg-card pl-10 pr-4 py-2 text-sm"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
      >
        <option value="">全部状态</option>
        <option value="pending">待接单</option>
        <option value="active">进行中</option>
        <option value="refunded">已返款</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
      </select>
    </div>
  );
}

interface TaskPaginationProps {
  page: number;
  total: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

export function TaskPagination({ page, total, setPage }: TaskPaginationProps) {
  return (
    <div className="flex justify-center items-center gap-3">
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
        className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        上一页
      </button>
      <span className="flex items-center px-4 text-sm text-muted-foreground tabular-nums">
        第 {page} 页 / 共 {Math.ceil(total / 20)} 页
      </span>
      <button
        onClick={() => setPage(p => p + 1)}
        disabled={page >= Math.ceil(total / 20)}
        className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        下一页
      </button>
    </div>
  );
}
