import { useQuery } from '@tanstack/react-query';
import { anomalyApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  AlertTriangle,
  Hash,
  Clock,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';

export default function AnomalyAlerts() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => anomalyApi.getAnomalies(),
  });

  const anomalies = (data as any)?.data;
  const missingOrderNoOrders: any[] = anomalies?.missingOrderNoOrders || [];
  const missingOrderNoTotal = anomalies?.summary?.missingOrderNo || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">异常预警</h2>
          <p className="text-muted-foreground mt-1">自动检测无效订单与超长间隔接单人</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl apple-card p-5">
              <div className="space-y-2">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-8 w-12 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: '双单号全空',
                value: anomalies?.summary?.missingOrderNo || 0,
                icon: Hash,
                color: anomalies?.summary?.missingOrderNo > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.missingOrderNo > 0 ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
              {
                title: '超14天未接单',
                value: anomalies?.summary?.staleTakers || 0,
                icon: Clock,
                color: anomalies?.summary?.staleTakers > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.staleTakers > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
              {
                title: '异常总数',
                value: anomalies?.summary?.totalAnomalies || 0,
                icon: AlertTriangle,
                color: anomalies?.summary?.totalAnomalies > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.totalAnomalies > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
            ].map(card => (
              <div key={card.title} className="rounded-2xl apple-card p-5 card-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className={`text-2xl font-bold mt-1 tabular-nums ${card.color}`}>{card.value}</p>
                  </div>
                  <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 双单号全空订单（无法对账的废单） */}
          {missingOrderNoTotal > 0 && (
            <div className="rounded-2xl apple-card p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Hash className="h-5 w-5 text-rose-500" />
                  双单号全空订单 ({missingOrderNoTotal})
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                订单号重复由数据库唯一约束保证，故不做重复检测；此处列出的是双单号全空、无法对账的订单。
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left font-medium">微信昵称</th>
                      <th className="px-4 py-3 text-left font-medium">微信号</th>
                      <th className="px-4 py-3 text-right font-medium">实付</th>
                      <th className="px-4 py-3 text-left font-medium">接单日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingOrderNoOrders.map((o: any) => (
                      <tr key={o.id} className="table-row-hover table-row-zebra">
                        <td className="px-4 py-3 font-medium">{o.wechatName || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{o.wechatId || '-'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(o.actualPayment)}</td>
                        <td className="px-4 py-3">{formatDate(o.orderDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingOrderNoTotal > missingOrderNoOrders.length && (
                <p className="mt-3 text-sm text-muted-foreground">
                  仅显示最近 {missingOrderNoOrders.length} 条，共 {missingOrderNoTotal} 条
                </p>
              )}
            </div>
          )}

          {/* Stale Takers */}
          {anomalies?.staleTakers?.length > 0 && (
            <div className="rounded-2xl apple-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  超14天未接单 ({anomalies.staleTakers.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left font-medium">微信昵称</th>
                      <th className="px-4 py-3 text-left font-medium">微信号</th>
                      <th className="px-4 py-3 text-left font-medium">最后接单日期</th>
                      <th className="px-4 py-3 text-right font-medium">距今天数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.staleTakers.map((t: any) => (
                      <tr key={t.id} className="table-row-hover table-row-zebra">
                        <td className="px-4 py-3 font-medium">{t.wechatName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.wechatId}</td>
                        <td className="px-4 py-3">
                          {t.neverOrdered ? (
                            <span className="text-muted-foreground">从未接单</span>
                          ) : (
                            formatDate(t.lastOrderDate)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold tabular-nums ${t.daysSinceLastOrder >= 30 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {t.daysSinceLastOrder}天
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                ≥30 天无接单记录的活跃接单人将在<strong className="font-medium">服务启动时</strong>被自动停用
              </p>
            </div>
          )}

          {/* No Anomalies */}
          {anomalies?.summary?.totalAnomalies === 0 && (
            <div className="rounded-2xl apple-card p-12 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-medium">一切正常</p>
              <p className="text-sm text-muted-foreground mt-1">未检测到无效订单或超长间隔接单人</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
