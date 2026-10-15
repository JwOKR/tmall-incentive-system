import { formatCurrency } from '@/lib/utils';

// 当前页快速统计条（原样提取自 pages/Orders.tsx 的 Quick Stats Bar）。
// 总额/待返款等仅反映当前页数据，总数由服务端返回。JSX 逐字复制。

export interface OrdersStats {
  refundPending: number;
  reviewPending: number;
  totalAmount: number;
  totalRefund: number;
  count: number;
}

export interface OrdersStatsBarProps {
  stats: OrdersStats;
}

export default function OrdersStatsBar({ stats }: OrdersStatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card">
        <p className="text-xs text-muted-foreground font-medium">当前结果</p>
        <p className="text-xl font-bold mt-0.5 tabular-nums">{stats.count}</p>
      </div>
      <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-amber">
        <p className="text-xs text-muted-foreground font-medium">待返款</p>
        <p className="text-xl font-bold mt-0.5 text-amber-600 dark:text-amber-400 tabular-nums">{stats.refundPending}</p>
      </div>
      <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-sky">
        <p className="text-xs text-muted-foreground font-medium">待好评</p>
        <p className="text-xl font-bold mt-0.5 text-sky-600 dark:text-sky-400 tabular-nums">{stats.reviewPending}</p>
      </div>
      <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-emerald">
        <p className="text-xs text-muted-foreground font-medium">实付总额</p>
        <p className="text-xl font-bold mt-0.5 tabular-nums">{formatCurrency(stats.totalAmount)}</p>
      </div>
      <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-emerald">
        <p className="text-xs text-muted-foreground font-medium">返款总额</p>
        <p className="text-xl font-bold mt-0.5 text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.totalRefund)}</p>
      </div>
    </div>
  );
}
