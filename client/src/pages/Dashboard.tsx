import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, remindApi } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { DashboardSkeleton } from '@/components/Skeleton';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Users,
  TrendingUp,
  AlertCircle,
  Star,
  ArrowRight,
  Calendar,
  DollarSign,
  BarChart3,
  CheckCircle,
  Clock,
  Copy,
  X,
  ListTodo,
} from 'lucide-react';

export default function Dashboard() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRemind, setShowRemind] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const summaryModalRef = useRef<HTMLDivElement>(null);
  const remindModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSummary && summaryModalRef.current) summaryModalRef.current.focus();
  }, [showSummary]);
  useEffect(() => {
    if (showRemind && remindModalRef.current) remindModalRef.current.focus();
  }, [showRemind]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.getStats(),
  });

  const handleCopySummary = async () => {
    try {
      const result = await dashboardApi.getIncentiveSummary(selectedDate);
      const text = (result as any)?.data?.text || '';
      setSummaryText(text);
      setShowSummary(true);
      await navigator.clipboard.writeText(text);
      toastSuccess('已复制到剪贴板');
    } catch (error) {
      toastError('获取激励汇总失败');
    }
  };

  const [remindData, setRemindData] = useState<any>(null);
  const handleShowRemind = async () => {
    try {
      const result = await remindApi.getList({ type: 'both' });
      setRemindData((result as any)?.data);
      setShowRemind(true);
    } catch (error) {
      toastError('获取催单列表失败');
    }
  };

  const handleCopyRemind = async () => {
    if (remindData?.copyText) {
      await navigator.clipboard.writeText(remindData.copyText);
      toastSuccess('催单列表已复制到剪贴板');
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
        </div>
        <p className="text-rose-600 dark:text-rose-400 font-medium">数据加载失败</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-press px-5 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/25"
        >
          重试
        </button>
      </div>
    );
  }

  const stats = (data as any)?.data;

  const mainCards = [
    {
      title: '总接单数',
      value: formatNumber(stats?.totalOrders || 0),
      icon: ShoppingCart,
      accent: 'stat-accent-sky',
      iconBg: 'bg-sky-100 dark:bg-sky-950/40',
      iconColor: 'text-sky-600 dark:text-sky-400',
    },
    {
      title: '总金额',
      value: formatCurrency(stats?.totalAmount || 0),
      icon: DollarSign,
      accent: 'stat-accent-emerald',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: '总返款',
      value: formatCurrency(stats?.totalRefund || 0),
      icon: TrendingUp,
      accent: 'stat-accent-violet',
      iconBg: 'bg-violet-100 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: '活跃接单人',
      value: formatNumber(stats?.activeTakers || 0),
      icon: Users,
      accent: 'stat-accent-amber',
      iconBg: 'bg-amber-100 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">数据汇总</h2>
          <p className="text-muted-foreground mt-1">天猫激励订单数据概览</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="premium-input rounded-xl border bg-card px-3 py-2 text-sm"
            />
            <button
              onClick={handleCopySummary}
              className="btn-press magnetic-btn inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20"
            >
              <Copy className="h-4 w-4" />
              复制激励汇总
            </button>
            <button
              onClick={handleShowRemind}
              className="btn-press magnetic-btn inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20"
            >
              <ListTodo className="h-4 w-4" />
              催单列表
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {showSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setShowSummary(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowSummary(false)}
          tabIndex={-1}
          ref={summaryModalRef}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-card p-6 shadow-2xl border border-border/50 animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">激励汇总</h3>
              <button
                onClick={() => setShowSummary(false)}
                className="btn-press p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-sm whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto">
              {summaryText}
            </pre>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(summaryText);
                  toastSuccess('已复制到剪贴板');
                }}
                className="btn-press inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
              >
                <Copy className="h-4 w-4" />
                复制
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="btn-press rounded-xl border px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remind Modal */}
      {showRemind && remindData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setShowRemind(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowRemind(false)}
          tabIndex={-1}
          ref={remindModalRef}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-card p-6 shadow-2xl border border-border/50 animate-modal-in max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                催单列表
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {remindData.totalTakers} 人 · {remindData.totalPendingOrders} 单待处理
                </span>
              </h3>
              <button onClick={() => setShowRemind(false)} className="btn-press p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {remindData.list?.map((taker: any) => (
                <div key={taker.takerId} className="p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{taker.wechatName} ({taker.wechatId})</span>
                    <span className="text-xs text-muted-foreground">{taker.totalPending} 单待处理</span>
                  </div>
                  {taker.unpaidOrders.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      待返款 {taker.unpaidOrders.length} 单
                    </p>
                  )}
                  {taker.unreviewedOrders.length > 0 && (
                    <p className="text-xs text-sky-600 dark:text-sky-400">
                      待好评 {taker.unreviewedOrders.length} 单
                    </p>
                  )}
                </div>
              ))}
              {remindData.list?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">暂无待处理订单</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button onClick={handleCopyRemind} className="btn-press inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600">
                <Copy className="h-4 w-4" /> 复制催单文本
              </button>
              <button onClick={() => setShowRemind(false)} className="btn-press rounded-xl border px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mainCards.map((card, index) => (
          <div
            key={card.title}
            className={`stagger-item relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm card-hover ${card.accent}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p className="text-2xl font-bold mt-1 tabular-nums counter-animate">{card.value}</p>
              </div>
              <div className={`${card.iconBg} ${card.iconColor} p-3 rounded-xl`}>
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today Stats & Pending Tasks */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Today Stats */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm premium-card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2.5 bg-sky-100 dark:bg-sky-950/40 rounded-xl">
              <Calendar className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="text-lg font-semibold">今日数据</h3>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
              <span className="text-muted-foreground text-sm">今日接单</span>
              <span className="font-bold text-lg tabular-nums">{stats?.todayOrders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
              <span className="text-muted-foreground text-sm">今日金额</span>
              <span className="font-bold text-lg tabular-nums">{formatCurrency(stats?.todayAmount || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl">
              <span className="text-muted-foreground text-sm">今日返款</span>
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats?.todayReward || 0)}</span>
            </div>
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm premium-card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2.5 bg-amber-100 dark:bg-amber-950/40 rounded-xl">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold">待处理</h3>
          </div>
          <div className="space-y-2.5">
            <Link
              to="/orders?refund=false"
              className="flex items-center justify-between p-3.5 bg-amber-50 dark:bg-amber-950/20 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium">待返款订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats?.pendingRefundCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
            <Link
              to="/orders?review=false"
              className="flex items-center justify-between p-3.5 bg-sky-50 dark:bg-sky-950/20 rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Star className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span className="text-sm font-medium">待好评订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-600 dark:text-sky-400 tabular-nums">{stats?.pendingReviewCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
            <Link
              to="/tasks"
              className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium">活跃任务</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats?.activeTasks || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>
        </div>

        {/* Top Takers */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm premium-card">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-violet-100 dark:bg-violet-950/40 rounded-xl">
                <Star className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold">接单人排行</h3>
            </div>
            <Link
              to="/takers"
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              查看全部
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {stats?.topTakers?.slice(0, 5).map((taker: any, index: number) => (
              <div
                key={taker.id}
                className="flex items-center justify-between p-2.5 bg-slate-50/60 dark:bg-slate-900/30 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        : index === 1
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        : index === 2
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{taker.wechatName}</p>
                    <p className="text-xs text-muted-foreground">{taker.wechatId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{taker.totalOrders}单</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(taker.totalAmount)}</p>
                </div>
              </div>
            ))}
            {(!stats?.topTakers || stats.topTakers.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily Summary */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm premium-card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-orange-100 dark:bg-orange-950/40 rounded-xl">
              <BarChart3 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold">近7天趋势</h3>
          </div>
        </div>
        {/* SVG Trend Chart */}
        {stats?.dailySummary && stats.dailySummary.length > 0 && (
          <div className="mb-6">
            <TrendChart data={[...stats.dailySummary].reverse()} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left">接单日期</th>
                <th className="px-4 py-3 text-left">订单数量</th>
                <th className="px-4 py-3 text-left">返款总额</th>
                <th className="px-4 py-3 text-left">已返款</th>
                <th className="px-4 py-3 text-left">待返款</th>
                <th className="px-4 py-3 text-left">好评数</th>
              </tr>
            </thead>
            <tbody>
              {stats?.dailySummary?.map((item: any) => (
                <tr key={item.date} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{item.date}</td>
                  <td className="px-4 py-3 tabular-nums">{item.orderCount}单</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(item.totalRefund)}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{item.refundedCount}单</td>
                  <td className="px-4 py-3 text-amber-600 dark:text-amber-400 tabular-nums">{item.pendingCount}单</td>
                  <td className="px-4 py-3 text-sky-600 dark:text-sky-400 tabular-nums">{item.goodReviewCount}单</td>
                </tr>
              ))}
              {stats?.dailySummary && stats.dailySummary.length > 0 && (
                <tr className="font-bold bg-slate-50/80 dark:bg-slate-900/40 border-t-2">
                  <td className="px-4 py-3">合计</td>
                  <td className="px-4 py-3 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.orderCount, 0)}单</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.dailySummary.reduce((sum: number, item: any) => sum + item.totalRefund, 0))}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.refundedCount, 0)}单</td>
                  <td className="px-4 py-3 text-amber-600 dark:text-amber-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.pendingCount, 0)}单</td>
                  <td className="px-4 py-3 text-sky-600 dark:text-sky-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.goodReviewCount, 0)}单</td>
                </tr>
              )}
              {(!stats?.dailySummary || stats.dailySummary.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 迷你趋势图组件
function TrendChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const maxOrders = Math.max(...data.map(d => d.orderCount), 1);
  const chartWidth = 600;
  const chartHeight = 120;
  const barWidth = chartWidth / data.length;
  const gap = barWidth * 0.3;
  const actualBarWidth = barWidth - gap;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`} className="w-full min-w-[400px]" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
          <line
            key={ratio}
            x1={0}
            y1={chartHeight - chartHeight * ratio}
            x2={chartWidth}
            y2={chartHeight - chartHeight * ratio}
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={1}
          />
        ))}
        {/* Bars */}
        {data.map((item, i) => {
          const barHeight = (item.orderCount / maxOrders) * (chartHeight - 20);
          const x = i * barWidth + gap / 2;
          const y = chartHeight - barHeight;
          const dateLabel = item.date.slice(5);
          return (
            <g key={item.date}>
              <rect
                x={x}
                y={y}
                width={actualBarWidth}
                height={barHeight}
                rx={6}
                fill="url(#barGradient)"
                className="transition-opacity hover:opacity-80 cursor-pointer"
              />
              <text
                x={x + actualBarWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="text-xs fill-current opacity-60 font-semibold"
                style={{ fontSize: '10px' }}
              >
                {item.orderCount}
              </text>
              <text
                x={x + actualBarWidth / 2}
                y={chartHeight + 15}
                textAnchor="middle"
                className="fill-current opacity-40"
                style={{ fontSize: '10px' }}
              >
                {dateLabel}
              </text>
            </g>
          );
        })}
        {/* Gradient definition */}
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(243 75% 59%)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(265 85% 65%)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
