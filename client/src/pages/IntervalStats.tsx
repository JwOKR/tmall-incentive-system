import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { intervalApi } from '@/lib/api';
import {
  TrendingUp,
  Calendar,
  Users,
  Timer,
  ShoppingCart,
  AlertCircle,
  Search,
} from 'lucide-react';
import { usePermissions, NoPermission } from '@/lib/permissions';

interface TakerInterval {
  takerId: string;
  wechatName: string;
  wechatId: string;
  status: string;
  totalOrders: number;
  orderCount: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  avgInterval: number | null;
  minInterval: number | null;
  maxInterval: number | null;
  daysSinceLastOrder: number | null;
  expectedNextDate: string | null;
  daysUntilNext: number | null;
  intervals: any[];
}

interface GlobalStats {
  totalTakers: number;
  totalOrders: number;
  totalIntervals: number;
  globalAvgInterval: number;
  globalMinInterval: number;
  globalMaxInterval: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getIntervalColor(days: number | null): string {
  if (days === null) return 'text-muted-foreground';
  if (days <= 1) return 'text-emerald-600 dark:text-emerald-400';
  if (days <= 3) return 'text-sky-600 dark:text-sky-400';
  if (days <= 7) return 'text-amber-600 dark:text-amber-400';
  if (days <= 14) return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getIntervalLabel(days: number | null): string {
  if (days === null) return '-';
  if (days === 0) return '当天';
  if (days === 1) return '1天';
  return `${days}天`;
}

export default function IntervalStats() {
  const { canView } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params: any = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['intervals', params],
    queryFn: () => intervalApi.getStats(params),
  });

  const stats: GlobalStats = (data as any)?.data?.stats || {
    totalTakers: 0,
    totalOrders: 0,
    totalIntervals: 0,
    globalAvgInterval: 0,
    globalMinInterval: 0,
    globalMaxInterval: 0,
  };

  const allTakers: TakerInterval[] = (data as any)?.data?.takers || [];

  const filteredTakers = allTakers.filter(
    (t) =>
      t.wechatName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.wechatId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <p className="text-rose-500 font-medium">数据加载失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  const statCards = [
    {
      title: '接单人数',
      value: stats.totalTakers,
      icon: Users,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: '总订单数',
      value: stats.totalOrders,
      icon: ShoppingCart,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: '平均间隔',
      value: stats.globalAvgInterval ? `${stats.globalAvgInterval}天` : '-',
      icon: Timer,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      title: '最短 / 最长',
      value:
        stats.totalIntervals > 0
          ? `${stats.globalMinInterval} / ${stats.globalMaxInterval}天`
          : '-',
      icon: TrendingUp,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  if (!canView('intervals')) return <NoPermission module="intervals" />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight apple-text-title-1">接单间隔分析</h1>
          <p className="text-sm text-muted-foreground mt-1">
            分析每个接单人的接单频率、间隔天数
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="apple-input rounded-lg"
          />
          <span className="text-muted-foreground text-sm">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="apple-input rounded-lg"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground px-2"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="card-hover rounded-2xl apple-card p-5 relative overflow-hidden"
          >
            <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-gradient-to-br from-primary/5 to-transparent" />
            <div className="flex items-start justify-between relative">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold mt-2">{card.value}</p>
              </div>
              <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${card.iconBg}`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索微信昵称或微信号..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="apple-input rounded-lg pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          共 {filteredTakers.length} 位接单人
        </span>
      </div>

      {/* Taker intervals table */}
      <div className="rounded-2xl apple-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left font-medium">接单人</th>
                <th className="px-4 py-3 text-center font-medium">接单数</th>
                <th className="px-4 py-3 text-left font-medium">最近接单</th>
                <th className="px-4 py-3 text-center font-medium">平均间隔</th>
                <th className="px-4 py-3 text-center font-medium">最短间隔</th>
                <th className="px-4 py-3 text-center font-medium">最长间隔</th>
              </tr>
            </thead>
            <tbody>
              {filteredTakers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {searchTerm ? '未找到匹配的接单人' : '暂无接单数据'}
                  </td>
                </tr>
              ) : (
                filteredTakers.map((taker) => (
                  <tr key={taker.takerId} className="table-row-hover table-row-zebra">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 shrink-0">
                          <span className="text-xs font-medium text-white">
                            {taker.wechatName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{taker.wechatName}</p>
                          <p className="text-xs text-muted-foreground">{taker.wechatId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                        {taker.orderCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-muted-foreground">{formatDate(taker.lastOrderDate)}</div>
                      {taker.daysSinceLastOrder !== null && (
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {taker.daysSinceLastOrder === 0 ? '今天' : `${taker.daysSinceLastOrder}天前`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${getIntervalColor(taker.avgInterval)}`}>
                        {getIntervalLabel(taker.avgInterval)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {getIntervalLabel(taker.minInterval)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${getIntervalColor(taker.maxInterval)}`}>
                        {getIntervalLabel(taker.maxInterval)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
