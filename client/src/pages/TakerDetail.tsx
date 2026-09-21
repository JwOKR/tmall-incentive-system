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
  ShieldCheck,
  ImageOff,
} from 'lucide-react';
import { usePermissions, NoPermission } from '@/lib/permissions';
import { COMPLIANCE_META, evaluateTakerComplianceClient } from '@/lib/takerConstants';
import ImageZoom from '@/components/ImageZoom';

export default function TakerDetail() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const { canView } = usePermissions();

  if (!canView('takers')) {
    return <NoPermission />;
  }

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
            <div key={i} className="rounded-2xl apple-card p-5">
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
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <p className="text-rose-500 font-medium">加载失败</p>
        <Link to="/takers" className="text-indigo-500 hover:underline text-sm">← 返回接单人列表</Link>
      </div>
    );
  }

  const { taker, orders, summary, monthlyStats } = (data as any).data;

  const statCards = [
    { title: '总订单', value: summary.totalOrders, icon: ShoppingCart, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/30' },
    { title: '佣金合计', value: formatCurrency(summary.totalCommission), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { title: '待返款', value: summary.pendingRefund, icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    { title: '距上次接单', value: summary.daysSinceLastOrder !== null ? `${summary.daysSinceLastOrder}天` : '-', icon: Clock, color: summary.daysSinceLastOrder && summary.daysSinceLastOrder > 7 ? 'text-rose-600 dark:text-rose-400' : 'text-violet-600 dark:text-violet-400', bg: summary.daysSinceLastOrder && summary.daysSinceLastOrder > 7 ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-violet-100 dark:bg-violet-900/30' },
  ];

  // 账号资质判定（前端轻量计算，与后端规则一致）
  const compliance = evaluateTakerComplianceClient(taker);
  const complianceMeta = COMPLIANCE_META[compliance.status];

  const accountItems = [
    { label: '注册时间', value: taker.registerDate ? formatDate(taker.registerDate) : '未登记' },
    { label: '实名认证', value: taker.isRealNameVerified ? '是' : '否' },
    { label: '信誉等级', value: taker.creditLevel || '未登记' },
    { label: '每周收货次数', value: taker.weeklyReceiptCount === null || taker.weeklyReceiptCount === undefined ? '未登记' : `${taker.weeklyReceiptCount} 单` },
    { label: '每月收货次数', value: taker.monthlyReceiptCount === null || taker.monthlyReceiptCount === undefined ? '未登记' : `${taker.monthlyReceiptCount} 单` },
  ];

  const screenshots = [
    { label: '头像截图', src: taker.avatarScreenshot as string | null },
    { label: '账号与安全截图', src: taker.securityScreenshot as string | null },
    { label: '待评价截图', src: taker.reviewScreenshot as string | null },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/takers" className="p-2 rounded-xl hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">{taker.wechatName}</h2>
          <p className="text-muted-foreground mt-1">{taker.wechatId} · {taker.status === 'active' ? '活跃' : '停用'}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map(card => (
          <div key={card.title} className="rounded-2xl apple-card p-5 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{card.value}</p>
              </div>
              <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Account Qualification */}
      <div className="rounded-2xl apple-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
            账号资质
          </h3>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${complianceMeta.className}`}>
            {complianceMeta.label}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accountItems.map(item => (
            <div key={item.label} className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
        {compliance.status === 'unqualified' && compliance.fails.length > 0 && (
          <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
            <p className="mb-1 text-sm font-medium text-rose-600 dark:text-rose-400">未通过项</p>
            <ul className="list-inside list-disc text-sm text-rose-600/90 dark:text-rose-400/90">
              {compliance.fails.map(fail => <li key={fail}>{fail}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Qualification Screenshots */}
      <div className="rounded-2xl apple-card p-6">
        <h3 className="mb-4 text-lg font-semibold">资质截图（{taker.screenshotCount ?? 0}/3）</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {screenshots.map(item => (
            <div key={item.label}>
              <p className="mb-2 text-sm text-muted-foreground">{item.label}</p>
              {item.src ? (
                <button
                  type="button"
                  onClick={() => setZoomSrc(item.src)}
                  className="block h-40 w-full overflow-hidden rounded-xl border border-border/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  title="点击查看大图"
                >
                  <img src={item.src} alt={item.label} className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                  <span className="text-xs">未上传</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Commission Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl apple-card p-6">
          <h3 className="text-lg font-semibold mb-4">佣金明细</h3>
          <div className="space-y-3">
            {[
              { label: '实付总额', value: formatCurrency(summary.totalActualPayment), color: 'text-foreground' },
              { label: '基础返佣', value: formatCurrency(summary.totalBaseCommission), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: '好评返佣', value: formatCurrency(summary.totalReviewCommission), color: 'text-violet-600 dark:text-violet-400' },
              { label: '总返款', value: formatCurrency(summary.totalRefund), color: 'text-sky-600 dark:text-sky-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`font-bold tabular-nums ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl apple-card p-6">
          <h3 className="text-lg font-semibold mb-4">状态统计</h3>
          <div className="space-y-3">
            {[
              { label: '已返款', value: summary.refundedCount, total: summary.totalOrders, color: 'bg-emerald-500' },
              { label: '待返款', value: summary.pendingRefund, total: summary.totalOrders, color: 'bg-amber-500' },
              { label: '已好评', value: summary.goodReviewCount, total: summary.totalOrders, color: 'bg-sky-500' },
              { label: '待好评', value: summary.pendingReview, total: summary.totalOrders, color: 'bg-slate-400' },
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium tabular-nums">{item.value} / {item.total}</span>
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
        <div className="rounded-2xl apple-card p-6">
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
                    <td className="px-4 py-3 text-right tabular-nums">{m.orders} 单</td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(m.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order History */}
      <div className="rounded-2xl apple-card p-6">
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
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3">{order.task?.productId || order.productId || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{order.orderNo19 || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(order.actualPayment)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(order.baseCommission)}</td>
                  <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(order.reviewCommission)}</td>
                  <td className="px-4 py-3 text-center">
                    {order.isRefunded
                      ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                      : <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.isGoodReview === 'reviewed' ? (
                      <Star className="h-4 w-4 text-sky-500 mx-auto" />
                    ) : order.isGoodReview === 'creating' ? (
                      <span className="text-amber-500 text-xs">作图中</span>
                    ) : order.isGoodReview === 'returned' ? (
                      <span className="text-emerald-500 text-xs">已返图</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors">上一页</button>
            <span className="flex items-center px-3 text-sm tabular-nums">第 {page} 页 / 共 {Math.ceil(orders.total / 20)} 页</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(orders.total / 20)} className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors">下一页</button>
          </div>
        )}
      </div>

      {zoomSrc && <ImageZoom src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  );
}
