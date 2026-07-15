import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commissionApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  DollarSign,
  TrendingUp,
  Users,
  Package,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { usePermissions, NoPermission } from '@/lib/permissions';

type TabKey = 'taker' | 'product' | 'month';

export default function CommissionStats() {
  const { canView } = usePermissions();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('taker');

  const { data, isLoading } = useQuery({
    queryKey: ['commissions', startDate, endDate],
    queryFn: () => commissionApi.getStats({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const stats = (data as any)?.data;

  // 日期预设
  const applyPreset = (preset: 'all' | 'month' | 'quarter' | 'year') => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (preset === 'all') { setStartDate(''); setEndDate(''); return; }
    if (preset === 'month') {
      setStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setEndDate(fmt(now));
    } else if (preset === 'quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      setStartDate(`${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`);
      setEndDate(fmt(now));
    } else if (preset === 'year') {
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(fmt(now));
    }
  };

  const summary = stats?.summary;
  const tabs = [
    { key: 'taker' as const, label: '按接单人', icon: Users },
    { key: 'product' as const, label: '按商品', icon: Package },
    { key: 'month' as const, label: '按月份', icon: Calendar },
  ];

  if (!canView('commissions')) return <NoPermission module="commissions" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">佣金成本分析</h2>
        <p className="text-muted-foreground">多维度查看佣金支出，优化成本结构</p>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <span className="text-muted-foreground text-sm">至</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        {[
          { label: '全部', v: 'all' as const },
          { label: '本月', v: 'month' as const },
          { label: '本季度', v: 'quarter' as const },
          { label: '本年', v: 'year' as const },
        ].map(p => (
          <button key={p.v} onClick={() => applyPreset(p.v)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: '订单总数', value: summary?.totalOrders || 0, icon: BarChart3, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
              { title: '基础返佣合计', value: formatCurrency(summary?.totalBaseCommission || 0), icon: DollarSign, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
              { title: '好评返佣合计', value: formatCurrency(summary?.totalReviewCommission || 0), icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
              { title: '单均佣金', value: formatCurrency(summary?.avgCommissionPerOrder || 0), icon: DollarSign, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
            ].map(card => (
              <div key={card.title} className="rounded-xl border bg-card p-5 shadow-sm card-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{typeof card.value === 'number' ? card.value : card.value}</p>
                  </div>
                  <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
            {activeTab === 'taker' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left font-medium">排名</th>
                    <th className="px-4 py-3 text-left font-medium">微信昵称</th>
                    <th className="px-4 py-3 text-left font-medium">微信号</th>
                    <th className="px-4 py-3 text-right font-medium">订单数</th>
                    <th className="px-4 py-3 text-right font-medium">实付总额</th>
                    <th className="px-4 py-3 text-right font-medium">基础返佣</th>
                    <th className="px-4 py-3 text-right font-medium">好评返佣</th>
                    <th className="px-4 py-3 text-right font-medium">佣金合计</th>
                    <th className="px-4 py-3 text-right font-medium">单均佣金</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byTaker?.map((row: any, i: number) => (
                    <tr key={row.id} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : i === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.wechatId}</td>
                      <td className="px-4 py-3 text-right">{row.orders}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.baseCommission + row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.avgCommission)}</td>
                    </tr>
                  ))}
                  {(!stats?.byTaker || stats.byTaker.length === 0) && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {activeTab === 'product' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left font-medium">产品编号</th>
                    <th className="px-4 py-3 text-right font-medium">订单数</th>
                    <th className="px-4 py-3 text-right font-medium">实付总额</th>
                    <th className="px-4 py-3 text-right font-medium">基础返佣</th>
                    <th className="px-4 py-3 text-right font-medium">好评返佣</th>
                    <th className="px-4 py-3 text-right font-medium">佣金合计</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byProduct?.map((row: any) => (
                    <tr key={row.id} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3 font-medium">{row.code || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.orders}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.baseCommission + row.reviewCommission)}</td>
                    </tr>
                  ))}
                  {(!stats?.byProduct || stats.byProduct.length === 0) && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {activeTab === 'month' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left font-medium">月份</th>
                    <th className="px-4 py-3 text-right font-medium">订单数</th>
                    <th className="px-4 py-3 text-right font-medium">实付总额</th>
                    <th className="px-4 py-3 text-right font-medium">基础返佣</th>
                    <th className="px-4 py-3 text-right font-medium">好评返佣</th>
                    <th className="px-4 py-3 text-right font-medium">佣金合计</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byMonth?.map((row: any) => (
                    <tr key={row.month} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3 font-medium">{row.month}</td>
                      <td className="px-4 py-3 text-right">{row.orders}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.totalCommission)}</td>
                    </tr>
                  ))}
                  {(!stats?.byMonth || stats.byMonth.length === 0) && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
