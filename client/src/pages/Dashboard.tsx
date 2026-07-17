import { useState, useRef, useEffect } from 'react';
import DatePicker from "@/components/DatePicker";
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
  Sparkles,
} from 'lucide-react';

export default function AppleDashboard() {
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
      <div className="flex flex-col items-center justify-center h-64 gap-6">
        <div className="w-20 h-20 rounded-3xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-rose-500" />
        </div>
        <div className="text-center">
          <h3 className="apple-text-title-3 text-rose-600 dark:text-rose-400 mb-2">数据加载失败</h3>
          <p className="apple-text-body text-muted-foreground">请检查网络连接后重试</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="apple-btn apple-btn-primary px-8 py-3"
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
      description: '累计订单数量',
    },
    {
      title: '总金额',
      value: formatCurrency(stats?.totalAmount || 0),
      icon: DollarSign,
      accent: 'stat-accent-emerald',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      description: '累计订单金额',
    },
    {
      title: '总返款',
      value: formatCurrency(stats?.totalRefund || 0),
      icon: TrendingUp,
      accent: 'stat-accent-violet',
      iconBg: 'bg-violet-100 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
      description: '累计返款金额',
    },
    {
      title: '活跃接单人',
      value: formatNumber(stats?.activeTakers || 0),
      icon: Users,
      accent: 'stat-accent-amber',
      iconBg: 'bg-amber-100 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      description: '本月活跃人数',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Apple-style Header */}
      <div className="flex items-center justify-between flex-wrap gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="apple-text-title-1">数据汇总</h1>
              <p className="apple-text-body text-muted-foreground">天猫激励订单数据概览</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              className="apple-search"
            />
            <button
              onClick={handleCopySummary}
              className="apple-btn apple-btn-primary px-5 py-2.5"
            >
              <Copy className="h-4 w-4" />
              复制激励汇总
            </button>
            <button
              onClick={handleShowRemind}
              className="apple-btn apple-btn-secondary px-5 py-2.5"
            >
              <ListTodo className="h-4 w-4" />
              催单列表
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground apple-text-footnote">
            <Calendar className="h-4 w-4" />
            <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span>
          </div>
        </div>
      </div>

      {/* Apple-style Summary Modal */}
      {showSummary && (
        <div
          className="apple-modal-overlay"
          onClick={() => setShowSummary(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowSummary(false)}
          tabIndex={-1}
          ref={summaryModalRef}
        >
          <div
            className="apple-modal-content max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="apple-text-title-2">激励汇总</h3>
              <button
                onClick={() => setShowSummary(false)}
                className="apple-btn apple-btn-ghost p-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <pre className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl text-sm whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto apple-text-body">
              {summaryText}
            </pre>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(summaryText);
                  toastSuccess('已复制到剪贴板');
                }}
                className="apple-btn apple-btn-primary px-6 py-2.5"
              >
                <Copy className="h-4 w-4" />
                复制
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="apple-btn apple-btn-ghost px-6 py-2.5"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apple-style Remind Modal */}
      {showRemind && remindData && (
        <div
          className="apple-modal-overlay"
          onClick={() => setShowRemind(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowRemind(false)}
          tabIndex={-1}
          ref={remindModalRef}
        >
          <div
            className="apple-modal-content max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="apple-text-title-2">催单列表</h3>
                <p className="apple-text-footnote text-muted-foreground mt-1">
                  {remindData.totalTakers} 人 · {remindData.totalPendingOrders} 单待处理
                </p>
              </div>
              <button onClick={() => setShowRemind(false)} className="apple-btn apple-btn-ghost p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              {remindData.list?.map((taker: any) => (
                <div key={taker.takerId} className="apple-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 flex items-center justify-center">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="apple-text-headline">{taker.wechatName}</p>
                        <p className="apple-text-footnote text-muted-foreground">{taker.wechatId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="apple-text-headline text-indigo-600 dark:text-indigo-400">{taker.totalPending} 单</p>
                      <p className="apple-text-footnote text-muted-foreground">待处理</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {taker.unpaidOrders.length > 0 && (
                      <span className="apple-badge apple-badge-warning">
                        待返款 {taker.unpaidOrders.length} 单
                      </span>
                    )}
                    {taker.unreviewedOrders.length > 0 && (
                      <span className="apple-badge apple-badge-info">
                        待好评 {taker.unreviewedOrders.length} 单
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {remindData.list?.length === 0 && (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                  <p className="apple-text-headline text-muted-foreground">暂无待处理订单</p>
                  <p className="apple-text-body text-muted-foreground">所有订单均已处理完成</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-separator">
              <button onClick={handleCopyRemind} className="apple-btn apple-btn-primary px-6 py-2.5">
                <Copy className="h-4 w-4" /> 复制催单文本
              </button>
              <button onClick={() => setShowRemind(false)} className="apple-btn apple-btn-ghost px-6 py-2.5">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Apple-style Main Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {mainCards.map((card, index) => (
          <div
            key={card.title}
            className={`stagger-item apple-card p-6 ${card.accent}`}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.iconBg} ${card.iconColor} p-3 rounded-2xl`}>
                <card.icon className="h-6 w-6" />
              </div>
              <span className="apple-text-caption-1 text-muted-foreground">{card.description}</span>
            </div>
            <div>
              <p className="apple-text-caption-1 text-muted-foreground mb-1">{card.title}</p>
              <p className="apple-text-title-1 tabular-nums counter-animate">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Apple-style Today Stats & Pending Tasks */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Today Stats */}
        <div className="apple-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-sky-100 dark:bg-sky-950/40 rounded-2xl">
              <Calendar className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h3 className="apple-text-title-3">今日数据</h3>
              <p className="apple-text-footnote text-muted-foreground">今日订单统计</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950/40 flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <span className="apple-text-body">今日接单</span>
              </div>
              <span className="apple-text-title-3 tabular-nums">{stats?.todayOrders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="apple-text-body">今日金额</span>
              </div>
              <span className="apple-text-title-3 tabular-nums">{formatCurrency(stats?.todayAmount || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="apple-text-body">今日返款</span>
              </div>
              <span className="apple-text-title-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats?.todayReward || 0)}</span>
            </div>
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="apple-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-amber-100 dark:bg-amber-950/40 rounded-2xl">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="apple-text-title-3">待处理</h3>
              <p className="apple-text-footnote text-muted-foreground">需要关注的任务</p>
            </div>
          </div>
          <div className="space-y-4">
            <Link
              to="/orders?refund=false"
              className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors group apple-card"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="apple-text-headline">待返款订单</p>
                  <p className="apple-text-footnote text-muted-foreground">需要立即处理</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="apple-text-title-3 text-amber-600 dark:text-amber-400 tabular-nums">{stats?.pendingRefundCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
            <Link
              to="/orders?review=false"
              className="flex items-center justify-between p-4 bg-sky-50 dark:bg-sky-950/20 rounded-2xl hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors group apple-card"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950/40 flex items-center justify-center">
                  <Star className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="apple-text-headline">待好评订单</p>
                  <p className="apple-text-footnote text-muted-foreground">等待用户评价</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="apple-text-title-3 text-sky-600 dark:text-sky-400 tabular-nums">{stats?.pendingReviewCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
            <Link
              to="/tasks"
              className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors group apple-card"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="apple-text-headline">活跃任务</p>
                  <p className="apple-text-footnote text-muted-foreground">进行中的任务</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="apple-text-title-3 text-emerald-600 dark:text-emerald-400 tabular-nums">{stats?.activeTasks || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </div>

        {/* Top Takers */}
        <div className="apple-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-violet-100 dark:bg-violet-950/40 rounded-2xl">
                <Star className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="apple-text-title-3">接单人排行</h3>
                <p className="apple-text-footnote text-muted-foreground">本月表现最佳</p>
              </div>
            </div>
            <Link
              to="/takers"
              className="apple-text-footnote text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              查看全部
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.topTakers?.slice(0, 5).map((taker: any, index: number) => (
              <div
                key={taker.id}
                className="flex items-center justify-between p-3 bg-slate-50/60 dark:bg-slate-900/30 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors apple-card"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
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
                    <p className="apple-text-headline">{taker.wechatName}</p>
                    <p className="apple-text-footnote text-muted-foreground">{taker.wechatId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="apple-text-headline tabular-nums">{taker.totalOrders}单</p>
                  <p className="apple-text-footnote text-muted-foreground tabular-nums">{formatCurrency(taker.totalAmount)}</p>
                </div>
              </div>
            ))}
            {(!stats?.topTakers || stats.topTakers.length === 0) && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="apple-text-headline text-muted-foreground">暂无数据</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Apple-style Daily Summary */}
      <div className="apple-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 dark:bg-orange-950/40 rounded-2xl">
              <BarChart3 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="apple-text-title-3">近7天趋势</h3>
              <p className="apple-text-footnote text-muted-foreground">订单数量趋势图</p>
            </div>
          </div>
        </div>
        {/* SVG Trend Chart */}
        {stats?.dailySummary && stats.dailySummary.length > 0 && (
          <div className="mb-6 p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl">
            <TrendChart data={[...stats.dailySummary].reverse()} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">接单日期</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">订单数量</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">返款总额</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">已返款</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">待返款</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40">好评数</th>
              </tr>
            </thead>
            <tbody>
              {stats?.dailySummary?.map((item: any) => (
                <tr key={item.date} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">{item.date}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{item.orderCount}单</td>
                  <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(item.totalRefund)}</td>
                  <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{item.refundedCount}单</td>
                  <td className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400 tabular-nums">{item.pendingCount}单</td>
                  <td className="px-4 py-3 text-sm text-sky-600 dark:text-sky-400 tabular-nums">{item.goodReviewCount}单</td>
                </tr>
              ))}
              {stats?.dailySummary && stats.dailySummary.length > 0 && (
                <tr className="font-semibold bg-slate-100/80 dark:bg-slate-900/60 border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 text-sm">合计</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.orderCount, 0)}单</td>
                  <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.dailySummary.reduce((sum: number, item: any) => sum + item.totalRefund, 0))}</td>
                  <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.refundedCount, 0)}单</td>
                  <td className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.pendingCount, 0)}单</td>
                  <td className="px-4 py-3 text-sm text-sky-600 dark:text-sky-400 tabular-nums">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.goodReviewCount, 0)}单</td>
                </tr>
              )}
              {(!stats?.dailySummary || stats.dailySummary.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                    <p className="apple-text-headline">暂无数据</p>
                    <p className="apple-text-body">暂无近7天的订单数据</p>
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

// Apple-style Trend Chart Component
function TrendChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const maxOrders = Math.max(...data.map(d => d.orderCount), 1);
  const chartWidth = 600;
  const chartHeight = 140;
  const barWidth = chartWidth / data.length;
  const gap = barWidth * 0.3;
  const actualBarWidth = barWidth - gap;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="w-full min-w-[400px]" preserveAspectRatio="xMidYMid meet">
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
          const barHeight = (item.orderCount / maxOrders) * (chartHeight - 30);
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
                rx={8}
                fill="url(#appleBarGradient)"
                className="transition-opacity hover:opacity-80 cursor-pointer"
              />
              <text
                x={x + actualBarWidth / 2}
                y={y - 8}
                textAnchor="middle"
                className="text-xs fill-current opacity-60 font-semibold"
                style={{ fontSize: '11px' }}
              >
                {item.orderCount}
              </text>
              <text
                x={x + actualBarWidth / 2}
                y={chartHeight + 20}
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
          <linearGradient id="appleBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5856D6" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}