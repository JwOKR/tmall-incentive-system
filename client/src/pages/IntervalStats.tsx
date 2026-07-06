import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { intervalApi } from '@/lib/api';
import {
  TrendingUp,
  Calendar,
  Users,
  Timer,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Search,
} from 'lucide-react';

interface IntervalEntry {
  fromDate: string;
  toDate: string;
  intervalDays: number;
}

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
  intervals: IntervalEntry[];
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

function getIntervalBadge(days: number): string {
  if (days <= 1) return 'badge-success';
  if (days <= 3) return 'badge-info';
  if (days <= 7) return 'badge-warning';
  if (days <= 14) return 'badge-orange';
  return 'badge-danger';
}

function getIntervalLabel(days: number): string {
  if (days === 0) return '当天';
  if (days === 1) return '1天';
  return `${days}天`;
}

export default function IntervalStats() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // 前端搜索过滤
  const filteredTakers = allTakers.filter(
    (t) =>
      t.wechatName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.wechatId.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">接单间隔分析</h1>
          <p className="text-sm text-muted-foreground mt-1">
            分析每个接单人的接单频率和间隔天数
          </p>
        </div>
        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <span className="text-muted-foreground text-sm">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
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
            className="card-hover rounded-xl border bg-card p-5 relative overflow-hidden"
          >
            {/* Decorative gradient */}
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
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          共 {filteredTakers.length} 位接单人
        </span>
      </div>

      {/* Taker intervals table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 text-left font-medium">接单人</th>
                <th className="px-4 py-3 text-center font-medium">接单数</th>
                <th className="px-4 py-3 text-left font-medium">首次接单</th>
                <th className="px-4 py-3 text-left font-medium">最近接单</th>
                <th className="px-4 py-3 text-center font-medium">平均间隔</th>
                <th className="px-4 py-3 text-center font-medium">最短</th>
                <th className="px-4 py-3 text-center font-medium">最长</th>
              </tr>
            </thead>
            <tbody>
              {filteredTakers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    {searchTerm ? '未找到匹配的接单人' : '暂无接单数据'}
                  </td>
                </tr>
              ) : (
                filteredTakers.map((taker) => {
                  const isExpanded = expandedId === taker.takerId;
                  return (
                    <Fragment key={taker.takerId}>
                      <tr
                        className="table-row-hover table-row-zebra cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : taker.takerId)}
                      >
                        <td className="px-4 py-3 text-center">
                          {taker.intervals.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground mx-auto" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground mx-auto" />
                            )
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/60 shrink-0">
                              <span className="text-xs font-medium text-primary-foreground">
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
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(taker.firstOrderDate)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(taker.lastOrderDate)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {taker.avgInterval !== null ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getIntervalBadge(
                                taker.avgInterval
                              )}`}
                            >
                              {getIntervalLabel(taker.avgInterval)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">仅1单</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {taker.minInterval !== null ? (
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">
                              {getIntervalLabel(taker.minInterval)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {taker.maxInterval !== null ? (
                            <span
                              className={`text-xs font-medium ${
                                taker.maxInterval > 14
                                  ? 'text-red-600 dark:text-red-400'
                                  : taker.maxInterval > 7
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-yellow-600 dark:text-yellow-400'
                              }`}
                            >
                              {getIntervalLabel(taker.maxInterval)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded detail rows */}
                      {isExpanded && taker.intervals.length > 0 && (
                        <tr>                          <td colSpan={8} className="px-4 pb-4 bg-muted/20">
                            <div className="rounded-lg border bg-card overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                      序号
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                      上次接单日期
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                      本次接单日期
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                                      间隔天数
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {taker.intervals.map((interval, idx) => (
                                    <tr
                                      key={idx}
                                      className="border-b last:border-0 hover:bg-muted/20"
                                    >
                                      <td className="px-3 py-2 text-muted-foreground">
                                        #{idx + 1}
                                      </td>
                                      <td className="px-3 py-2">
                                        {formatDate(interval.fromDate)}
                                      </td>
                                      <td className="px-3 py-2">
                                        {formatDate(interval.toDate)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getIntervalBadge(
                                            interval.intervalDays
                                          )}`}
                                        >
                                          {getIntervalLabel(interval.intervalDays)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>间隔图例：</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-200 dark:bg-green-800" />
          0-1天（高频）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-200 dark:bg-blue-800" />
          2-3天（活跃）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-200 dark:bg-yellow-800" />
          4-7天（正常）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-200 dark:bg-orange-800" />
          8-14天（低频）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-200 dark:bg-red-800" />
          14天+（不活跃）
        </span>
      </div>
    </div>
  );
}
