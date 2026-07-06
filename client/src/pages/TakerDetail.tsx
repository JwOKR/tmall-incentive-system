import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { takersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  ShoppingCart,
  DollarSign,
  Star,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';

export default function TakerDetail() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['taker-detail', id, page],
    queryFn: () => takersApi.getDetail(id!, { page, pageSize: 20 }),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="space-y-2">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-8 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !(data as any)?.success) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive font-medium">加载失败</p>
        <Link to="/takers" className="text-primary hover:underline text-sm">← 返回接单人列表</Link>
      </div>
    );
  }

  const { taker, orders, summary, monthlyStats } = (data as any).data;

  const statCards = [
    { title: '总订单', value: summary.totalOrders, icon: ShoppingCart, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { title: '佣金合计', value: formatCurrency(summary.totalCommission), icon: DollarSign, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    { title: '待返款', value: summary.pendingRefund, icon: AlertCircle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
    { title: '距上次接单', value: summary.daysSinceLastOrder !== null ? `${summary.daysSinceLastOrder}天` : '-', icon: Clock, color: summary.daysSinceLastOrder && summary.daysSinceLastOrder > 7 ? 'text-red-600 dark:text-red-400' : 'text-purple-600 dark:text-purple-400', bg: summary.daysSinceLastOrder && summary.daysSinceLastOrder > 7 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-purple-100 dark:bg-purple-900/30' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/takers" className="p-2 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{taker.wechatName}</h2>
          <p className="text-muted-foreground">{taker.wechatId} · {taker.status === 'active' ? '活跃' : '停用'}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map(card => (
          <div key={card.title} className="rounded-xl border bg-card p-5 shadow-sm card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
              <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Commission Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">佣金明细</h3>
          <div className="space-y-3">
            {[
              { label: '实付总额', value: formatCurrency(summary.totalActualPayment), color: 'text-foreground' },
              { label: '基础返佣', value: formatCurrency(summary.totalBaseCommission), color: 'text-green-600 dark:text-green-400' },
              { label: '好评返佣', value: formatCurrency(summary.totalReviewCommission), color: 'text-purple-600 dark:text-purple-400' },
              { label: '总返款', value: formatCurrency(summary.totalRefund), color: 'text-blue-600 dark:text-blue-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">状态统计</h3>
          <div className="space-y-3">
            {[
              { label: '已返款', value: summary.refundedCount, total: summary.totalOrders, color: 'bg-green-500' },
              { label: '待返款', value: summary.pendingRefund, total: summary.totalOrders, color: 'bg-yellow-500' },
              { label: '已好评', value: summary.goodReviewCount, total: summary.totalOrders, color: 'bg-blue-500' },
              { label: '待好评', value: summary.pendingReview, total: summary.totalOrders, color: 'bg-gray-400' },
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value} / {item.total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all duration-500`}
                    style={{ width: item.total > 0 ? `${(item.value / item.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      {monthlyStats.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">月度统计</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 text-left font-medium">月份</th>
                  <th className="px-4 py-3 text-right font-medium">订单数</th>
                  <th className="px-4 py-3 text-right font-medium">佣金合计</th>
                </tr>
              </thead>
              <tbody>
                {monthlyStats.map((m: any) => (
                  <tr key={m.month} className="table-row-hover table-row-zebra">
                    <td className="px-4 py-3 font-medium">{m.month}</td>
                    <td className="px-4 py-3 text-right">{m.orders} 单</td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(m.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order History */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">历史订单 ({orders.total})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left font-medium">接单日期</th>
                <th className="px-4 py-3 text-left font-medium">商品ID</th>
                <th className="px-4 py-3 text-left font-medium">19订单号</th>
                <th className="px-4 py-3 text-right font-medium">实付</th>
                <th className="px-4 py-3 text-right font-medium">基础返佣</th>
                <th className="px-4 py-3 text-right font-medium">好评返佣</th>
                <th className="px-4 py-3 text-center font-medium">返款</th>
                <th className="px-4 py-3 text-center font-medium">好评</th>
              </tr>
            </thead>
            <tbody>
              {orders.list.map((order: any) => (
                <tr key={order.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3">{order.task?.productId || order.productId || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{order.orderNo19 || '-'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(order.actualPayment)}</td>
                  <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(order.baseCommission)}</td>
                  <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400">{formatCurrency(order.reviewCommission)}</td>
                  <td className="px-4 py-3 text-center">
                    {order.isRefunded
                      ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      : <AlertCircle className="h-4 w-4 text-yellow-500 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.isGoodReview
                      ? <Star className="h-4 w-4 text-blue-500 mx-auto" />
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              ))}
              {orders.list.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">暂无订单</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {orders.total > 20 && (
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">上一页</button>
            <span className="flex items-center px-3 text-sm">第 {page} 页 / 共 {Math.ceil(orders.total / 20)} 页</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(orders.total / 20)} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
