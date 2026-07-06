import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/utils';
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
} from 'lucide-react';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [summaryText, setSummaryText] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  
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
      alert('已复制到剪贴板');
    } catch (error) {
      alert('获取激励汇总失败');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive font-medium">数据加载失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
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
      gradient: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: '总金额',
      value: formatCurrency(stats?.totalAmount || 0),
      icon: DollarSign,
      gradient: 'from-green-500 to-green-600',
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: '总返款',
      value: formatCurrency(stats?.totalRefund || 0),
      icon: TrendingUp,
      gradient: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: '活跃接单人',
      value: formatNumber(stats?.activeTakers || 0),
      icon: Users,
      gradient: 'from-orange-500 to-orange-600',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
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
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={handleCopySummary}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-md"
            >
              <Copy className="h-4 w-4" />
              复制激励汇总
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl border border-border/50 animate-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">激励汇总</h3>
              <button
                onClick={() => setShowSummary(false)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto">
              {summaryText}
            </pre>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(summaryText);
                  alert('已复制到剪贴板');
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Copy className="h-4 w-4" />
                复制
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mainCards.map((card) => (
          <div
            key={card.title}
            className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm card-hover"
          >
            {/* Gradient accent */}
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-5 dark:opacity-10 blur-2xl -mr-8 -mt-8`} />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
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
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold">今日数据</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground text-sm">今日接单</span>
              <span className="font-bold text-lg">{stats?.todayOrders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground text-sm">今日金额</span>
              <span className="font-bold text-lg">{formatCurrency(stats?.todayAmount || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground text-sm">今日返款</span>
              <span className="font-bold text-lg text-green-600 dark:text-green-400">{formatCurrency(stats?.todayReward || 0)}</span>
            </div>
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-semibold">待处理</h3>
          </div>
          <div className="space-y-3">
            <Link
              to="/orders?refund=false"
              className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm">待返款订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-yellow-600 dark:text-yellow-400">{stats?.pendingRefundCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link
              to="/orders?review=false"
              className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm">待好评订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">{stats?.pendingReviewCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link
              to="/tasks"
              className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm">活跃任务</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-green-600 dark:text-green-400">{stats?.activeTasks || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </div>
        </div>

        {/* Top Takers */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold">接单人排行</h3>
            </div>
            <Link
              to="/takers"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              查看全部
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {stats?.topTakers?.slice(0, 5).map((taker: any, index: number) => (
              <div
                key={taker.id}
                className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : index === 1
                        ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        : index === 2
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-muted text-muted-foreground'
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
                  <p className="text-sm font-medium">{taker.totalOrders}单</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(taker.totalAmount)}</p>
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
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <BarChart3 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold">当日汇总</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left font-medium">接单日期</th>
                <th className="px-4 py-3 text-left font-medium">订单数量</th>
                <th className="px-4 py-3 text-left font-medium">返款总额</th>
                <th className="px-4 py-3 text-left font-medium">已返款</th>
                <th className="px-4 py-3 text-left font-medium">待返款</th>
                <th className="px-4 py-3 text-left font-medium">好评数</th>
              </tr>
            </thead>
            <tbody>
              {stats?.dailySummary?.map((item: any) => (
                <tr key={item.date} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3">{item.orderCount}单</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">{formatCurrency(item.totalRefund)}</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">{item.refundedCount}单</td>
                  <td className="px-4 py-3 text-yellow-600 dark:text-yellow-400">{item.pendingCount}单</td>
                  <td className="px-4 py-3 text-blue-600 dark:text-blue-400">{item.goodReviewCount}单</td>
                </tr>
              ))}
              {stats?.dailySummary && stats.dailySummary.length > 0 && (
                <tr className="font-bold bg-muted/30 border-t-2">
                  <td className="px-4 py-3">合计</td>
                  <td className="px-4 py-3">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.orderCount, 0)}单</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">{formatCurrency(stats.dailySummary.reduce((sum: number, item: any) => sum + item.totalRefund, 0))}</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.refundedCount, 0)}单</td>
                  <td className="px-4 py-3 text-yellow-600 dark:text-yellow-400">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.pendingCount, 0)}单</td>
                  <td className="px-4 py-3 text-blue-600 dark:text-blue-400">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.goodReviewCount, 0)}单</td>
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
