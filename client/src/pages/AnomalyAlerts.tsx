import { useQuery } from '@tanstack/react-query';
import { anomalyApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  AlertTriangle,
  Copy,
  Hash,
  Clock,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { usePermissions, NoPermission } from '@/lib/permissions';

export default function AnomalyAlerts() {
  const { success: toastSuccess } = useToast();
  const { canView } = usePermissions();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => anomalyApi.getAnomalies(),
  });

  const anomalies = (data as any)?.data;

  const handleCopyDuplicates = (type: 'orderNo' | 'orderNo19') => {
    const items = type === 'orderNo' ? anomalies?.duplicateOrderNos : anomalies?.duplicate19Nos;
    if (!items || items.length === 0) return;
    const text = items.map((d: any) => `${d[type]} (${d.count}次)`).join('\n');
    navigator.clipboard.writeText(text);
    toastSuccess('已复制');
  };

  if (!canView('anomalies')) return <NoPermission module="anomalies" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight gradient-text">异常预警</h2>
          <p className="text-muted-foreground mt-1">自动检测重复订单、超长间隔接单人</p>
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
            <div key={i} className="rounded-2xl premium-card p-5">
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
                title: '重复订单号',
                value: anomalies?.summary?.duplicateOrderNos || 0,
                sub: anomalies?.summary?.duplicate19Nos || 0,
                subLabel: '19订单号重复',
                icon: Hash,
                color: anomalies?.summary?.duplicateOrderNos > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.duplicateOrderNos > 0 ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
              {
                title: '超14天未接单',
                value: anomalies?.summary?.staleTakers || 0,
                sub: anomalies?.summary?.autoInactivated || 0,
                subLabel: '本次自动停用',
                icon: Clock,
                color: anomalies?.summary?.staleTakers > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.staleTakers > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
              {
                title: '异常总数',
                value: anomalies?.summary?.totalAnomalies || 0,
                sub: null,
                subLabel: '',
                icon: AlertTriangle,
                color: anomalies?.summary?.totalAnomalies > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400',
                bg: anomalies?.summary?.totalAnomalies > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30',
              },
            ].map(card => (
              <div key={card.title} className="rounded-2xl premium-card p-5 card-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className={`text-2xl font-bold mt-1 tabular-nums ${card.color}`}>{card.value}</p>
                    {card.sub !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {card.subLabel}: {card.sub}
                      </p>
                    )}
                  </div>
                  <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Duplicate Order Numbers */}
          {anomalies?.duplicateOrderNos?.length > 0 && (
            <div className="rounded-2xl premium-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Hash className="h-5 w-5 text-rose-500" />
                  重复订单号 ({anomalies.duplicateOrderNos.length})
                </h3>
                <button onClick={() => handleCopyDuplicates('orderNo')} className="text-sm text-indigo-500 hover:underline flex items-center gap-1">
                  <Copy className="h-3 w-3" /> 复制
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left font-medium">订单号</th>
                      <th className="px-4 py-3 text-right font-medium">重复次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.duplicateOrderNos.map((d: any, i: number) => (
                      <tr key={i} className="table-row-hover table-row-zebra">
                        <td className="px-4 py-3 font-mono">{d.orderNo}</td>
                        <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 font-bold tabular-nums">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Duplicate 19 Order Numbers */}
          {anomalies?.duplicate19Nos?.length > 0 && (
            <div className="rounded-2xl premium-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Hash className="h-5 w-5 text-orange-500" />
                  重复19订单号 ({anomalies.duplicate19Nos.length})
                </h3>
                <button onClick={() => handleCopyDuplicates('orderNo19')} className="text-sm text-indigo-500 hover:underline flex items-center gap-1">
                  <Copy className="h-3 w-3" /> 复制
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left font-medium">19订单号</th>
                      <th className="px-4 py-3 text-right font-medium">重复次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.duplicate19Nos.map((d: any, i: number) => (
                      <tr key={i} className="table-row-hover table-row-zebra">
                        <td className="px-4 py-3 font-mono">{d.orderNo19}</td>
                        <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400 font-bold tabular-nums">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stale Takers */}
          {anomalies?.staleTakers?.length > 0 && (
            <div className="rounded-2xl premium-card p-6">
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
                        <td className="px-4 py-3">{formatDate(t.lastOrderDate)}</td>
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
              {anomalies?.summary?.autoInactivated > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  已自动将 {anomalies.summary.autoInactivated} 名超过30天未接单的接单人标记为停用
                </p>
              )}
            </div>
          )}

          {/* No Anomalies */}
          {anomalies?.summary?.totalAnomalies === 0 && (
            <div className="rounded-2xl premium-card p-12 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-medium">一切正常</p>
              <p className="text-sm text-muted-foreground mt-1">未检测到异常订单或超长间隔接单人</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
