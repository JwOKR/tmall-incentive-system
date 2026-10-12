import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commissionApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  TrendingUp,
  Users,
  Package,
  Calendar,
  BarChart3,
  Download,
  Percent,
  Wallet,
  AlertTriangle,
} from 'lucide-react';

type TabKey = 'taker' | 'product' | 'month';

/** 比率展示：null / 非有限数 → '—'（后端分母为 0 时返回 null，表示「不可计算」） */
function formatRatio(ratio?: number | null): string {
  if (ratio === null || ratio === undefined) return '—';
  const n = Number(ratio);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function CommissionStats() {
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

  // 导出：使用前端既有 xlsx 用法（直接在本文件内实现，不改动 lib/export.ts）
  const handleExport = () => {
    if (!stats) return;
    const dateTag = (startDate || endDate)
      ? `${startDate || '起始'}_${endDate || '至今'}`
      : '全部';
    const wb = XLSX.utils.book_new();

    // Sheet 1：汇总（含 ROI 指标）
    const summaryRows = [
      { 指标: '订单总数', 数值: summary?.totalOrders ?? 0 },
      { 指标: '实付总额（元）', 数值: summary?.totalPayment ?? 0 },
      { 指标: '基础返佣合计（元）', 数值: summary?.totalBaseCommission ?? 0 },
      { 指标: '好评返佣合计（元）', 数值: summary?.totalReviewCommission ?? 0 },
      { 指标: '已好评返佣（元）', 数值: summary?.reviewedReviewCommission ?? 0 },
      { 指标: '佣金合计（元）', 数值: summary?.totalCommission ?? 0 },
      { 指标: '应返款总额（元）', 数值: summary?.totalRefundAmount ?? 0 },
      { 指标: '单均佣金（元）', 数值: summary?.avgCommissionPerOrder ?? 0 },
      { 指标: '返款/实付比', 数值: formatRatio(summary?.commissionToPaymentRatio) },
      { 指标: '未返款单数', 数值: summary?.unpaidOrders ?? 0 },
      { 指标: '未返款金额（元）', 数值: summary?.unpaidRefundAmount ?? 0 },
      { 指标: '未返款率', 数值: formatRatio(summary?.unpaidRate) },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '汇总');

    // Sheet 2：按接单人
    const takerRows = (stats.byTaker || []).map((row: any, i: number) => ({
      排名: i + 1,
      微信昵称: row.name,
      微信号: row.wechatId,
      订单数: row.orders,
      '实付总额（元）': row.totalPayment,
      '基础返佣（元）': row.baseCommission,
      '好评返佣（元）': row.reviewCommission,
      '佣金合计（元）': row.baseCommission + row.reviewCommission,
      '单均佣金（元）': row.avgCommission,
      返款实付比: formatRatio(row.commissionToPaymentRatio),
      未返款单数: row.unpaidOrders ?? 0,
      未返款率: formatRatio(row.unpaidRate),
    }));
    const wsTaker = XLSX.utils.json_to_sheet(takerRows);
    wsTaker['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsTaker, '按接单人');

    // Sheet 3：按商品
    const productRows = (stats.byProduct || []).map((row: any) => ({
      产品编号: row.code || '-',
      订单数: row.orders,
      '实付总额（元）': row.totalPayment,
      '基础返佣（元）': row.baseCommission,
      '好评返佣（元）': row.reviewCommission,
      '佣金合计（元）': row.baseCommission + row.reviewCommission,
      返款实付比: formatRatio(row.commissionToPaymentRatio),
    }));
    const wsProduct = XLSX.utils.json_to_sheet(productRows);
    wsProduct['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsProduct, '按商品');

    // Sheet 4：按月份
    const monthRows = (stats.byMonth || []).map((row: any) => ({
      月份: row.month,
      订单数: row.orders,
      '实付总额（元）': row.totalPayment,
      '基础返佣（元）': row.baseCommission,
      '好评返佣（元）': row.reviewCommission,
      '佣金合计（元）': row.totalCommission,
      返款实付比: formatRatio(row.commissionToPaymentRatio),
    }));
    const wsMonth = XLSX.utils.json_to_sheet(monthRows);
    wsMonth['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsMonth, '按月份');

    XLSX.writeFile(wb, `佣金ROI分析_${dateTag}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">佣金成本分析</h2>
          <p className="text-muted-foreground mt-1">多维度查看佣金支出与投放效率（ROI）</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!stats}
          className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          导出 Excel
        </button>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="apple-input rounded-lg" />
        <span className="text-muted-foreground text-sm">至</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="apple-input rounded-lg" />
        {[
          { label: '全部', v: 'all' as const },
          { label: '本月', v: 'month' as const },
          { label: '本季度', v: 'quarter' as const },
          { label: '本年', v: 'year' as const },
        ].map(p => (
          <button key={p.v} onClick={() => applyPreset(p.v)} className="rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl apple-card p-5">
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
          {/* Summary Cards（含 ROI 指标；比率由后端计算，前端仅渲染） */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: '订单总数', value: summary?.totalOrders ?? 0, icon: BarChart3, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/30' },
              { title: '实付总额', value: formatCurrency(summary?.totalPayment ?? 0), icon: Wallet, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/30' },
              { title: '基础返佣合计', value: formatCurrency(summary?.totalBaseCommission ?? 0), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
              { title: '好评返佣合计', value: formatCurrency(summary?.totalReviewCommission ?? 0), icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
              { title: '已好评返佣', value: formatCurrency(summary?.reviewedReviewCommission ?? 0), icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
              { title: '佣金合计', value: formatCurrency(summary?.totalCommission ?? 0), icon: DollarSign, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
              { title: '返款 / 实付比', value: formatRatio(summary?.commissionToPaymentRatio), icon: Percent, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30' },
              { title: '未返款率', value: formatRatio(summary?.unpaidRate), icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              { title: '未返款单数', value: summary?.unpaidOrders ?? 0, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              { title: '未返款金额', value: formatCurrency(summary?.unpaidRefundAmount ?? 0), icon: Wallet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              { title: '应返款总额', value: formatCurrency(summary?.totalRefundAmount ?? 0), icon: Wallet, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40' },
              { title: '单均佣金', value: formatCurrency(summary?.avgCommissionPerOrder ?? 0), icon: DollarSign, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
            ].map(card => (
              <div key={card.title} className="rounded-2xl apple-card p-5 card-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{typeof card.value === 'number' ? card.value : card.value}</p>
                  </div>
                  <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key ? 'bg-card shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-2xl apple-card overflow-x-auto">
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
                    <th className="px-4 py-3 text-right font-medium">返款/实付比</th>
                    <th className="px-4 py-3 text-right font-medium">未返款率</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byTaker?.map((row: any, i: number) => (
                    <tr key={row.id} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.wechatId}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatCurrency(row.baseCommission + row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.avgCommission)}</td>
                      <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 tabular-nums">{formatRatio(row.commissionToPaymentRatio)}</td>
                      <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 tabular-nums">{formatRatio(row.unpaidRate)}</td>
                    </tr>
                  ))}
                  {(!stats?.byTaker || stats.byTaker.length === 0) && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
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
                    <th className="px-4 py-3 text-right font-medium">返款/实付比</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byProduct?.map((row: any) => (
                    <tr key={row.id} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3 font-medium">{row.code || '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatCurrency(row.baseCommission + row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 tabular-nums">{formatRatio(row.commissionToPaymentRatio)}</td>
                    </tr>
                  ))}
                  {(!stats?.byProduct || stats.byProduct.length === 0) && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
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
                    <th className="px-4 py-3 text-right font-medium">返款/实付比</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.byMonth?.map((row: any) => (
                    <tr key={row.month} className="table-row-hover table-row-zebra">
                      <td className="px-4 py-3 font-medium">{row.month}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.totalPayment)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.baseCommission)}</td>
                      <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(row.reviewCommission)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatCurrency(row.totalCommission)}</td>
                      <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 tabular-nums">{formatRatio(row.commissionToPaymentRatio)}</td>
                    </tr>
                  ))}
                  {(!stats?.byMonth || stats.byMonth.length === 0) && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
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
