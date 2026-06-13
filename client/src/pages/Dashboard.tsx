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
      
      // 复制到剪贴板
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
      color: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: '总金额',
      value: formatCurrency(stats?.totalAmount || 0),
      icon: DollarSign,
      color: 'from-green-500 to-green-600',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      title: '总返款',
      value: formatCurrency(stats?.totalRefund || 0),
      icon: TrendingUp,
      color: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
    {
      title: '活跃接单人',
      value: formatNumber(stats?.activeTakers || 0),
      icon: Users,
      color: 'from-orange-500 to-orange-600',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">数据汇总</h2>
          <p className="text-muted-foreground">天猫激励订单数据概览</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={handleCopySummary}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">激励汇总</h3>
              <button
                onClick={() => setShowSummary(false)}
                className="p-1 hover:bg-accent rounded-md"
              >
                ✕
              </button>
            </div>
            <pre className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap font-mono">
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
            className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
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
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold">今日数据</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground">今日接单</span>
              <span className="font-bold text-lg">{stats?.todayOrders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground">今日金额</span>
              <span className="font-bold text-lg">{formatCurrency(stats?.todayAmount || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-muted-foreground">今日返款</span>
              <span className="font-bold text-lg text-green-600">{formatCurrency(stats?.todayReward || 0)}</span>
            </div>
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold">待处理</h3>
          </div>
          <div className="space-y-4">
            <Link
              to="/orders?refund=false"
              className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span>待返款订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-yellow-600">{stats?.pendingRefundCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link
              to="/orders?review=false"
              className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-blue-600" />
                <span>待好评订单</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-600">{stats?.pendingReviewCount || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link
              to="/tasks"
              className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>活跃任务</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-green-600">{stats?.activeTasks || 0}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </div>
        </div>

        {/* Top Takers */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Star className="h-5 w-5 text-purple-600" />
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
          <div className="space-y-3">
            {stats?.topTakers?.slice(0, 5).map((taker: any, index: number) => (
              <div
                key={taker.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : index === 1
                        ? 'bg-gray-100 text-gray-700'
                        : index === 2
                        ? 'bg-orange-100 text-orange-700'
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
            <div className="p-2 bg-orange-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold">当日汇总</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
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
                <tr key={item.date} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3">{item.orderCount}单</td>
                  <td className="px-4 py-3 text-green-600">{formatCurrency(item.totalRefund)}</td>
                  <td className="px-4 py-3 text-green-600">{item.refundedCount}单</td>
                  <td className="px-4 py-3 text-yellow-600">{item.pendingCount}单</td>
                  <td className="px-4 py-3 text-blue-600">{item.goodReviewCount}单</td>
                </tr>
              ))}
              {stats?.dailySummary && stats.dailySummary.length > 0 && (
                <tr className="font-bold bg-muted/30">
                  <td className="px-4 py-3">合计</td>
                  <td className="px-4 py-3">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.orderCount, 0)}单</td>
                  <td className="px-4 py-3 text-green-600">{formatCurrency(stats.dailySummary.reduce((sum: number, item: any) => sum + item.totalRefund, 0))}</td>
                  <td className="px-4 py-3 text-green-600">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.refundedCount, 0)}单</td>
                  <td className="px-4 py-3 text-yellow-600">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.pendingCount, 0)}单</td>
                  <td className="px-4 py-3 text-blue-600">{stats.dailySummary.reduce((sum: number, item: any) => sum + item.goodReviewCount, 0)}单</td>
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