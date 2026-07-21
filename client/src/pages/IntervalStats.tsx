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
  Clock,
  Zap,
  Hourglass,
  CheckCircle,
} from 'lucide-react';
import { usePermissions, NoPermission } from '@/lib/permissions';

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
  daysSinceLastOrder: number | null;
  expectedNextDate: string | null;
  daysUntilNext: number | null;
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

// 距下次接单的状态判定
function getCountdownState(days: number | null): {
  label: string;
  badgeClass: string;
  icon: typeof Clock;
  pulse?: boolean;
} {
  if (days === null) return { label: '待计算', badgeClass: 'badge-neutral', icon: Clock };
  if (days < 0) return { label: `逾期${Math.abs(days)}天`, badgeClass: 'badge-danger', icon: AlertCircle, pulse: true };
  if (days === 0) return { label: '今天', badgeClass: 'badge-danger', icon: Zap, pulse: true };
  if (days === 1) return { label: '明天', badgeClass: 'badge-orange', icon: Zap };
  if (days <= 3) return { label: `${days}天`, badgeClass: 'badge-warning', icon: Hourglass };
  if (days <= 7) return { label: `${days}天`, badgeClass: 'badge-info', icon: Clock };
  return { label: `${days}天`, badgeClass: 'badge-success', icon: CheckCircle };
}

// 计算倒计时进度条百分比（基于平均间隔）
function getProgressPercent(daysSinceLast: number | null, avgInterval: number | null): number {
  if (daysSinceLast === null || avgInterval === null || avgInterval === 0) return 0;
  const percent = (daysSinceLast / avgInterval) * 100;
  return Math.min(100, Math.max(0, percent));
}

export default function IntervalStats() {
  const { canView } = usePermissions();
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

  const filteredTakers = allTakers.filter(
    (t) =>
      t.wechatName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.wechatId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 统计待接单和逾期人数
  const overdueCount = allTakers.filter((t) => t.daysUntilNext !== null && t.daysUntilNext < 0).length;
  const dueTodayCount = allTakers.filter((t) => t.daysUntilNext === 0).length;
  const dueSoonCount = allTakers.filter((t) => t.daysUntilNext !== null && t.daysUntilNext > 0 && t.daysUntilNext <= 3).length;

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

      {/* Countdown alert banner */}
      {(overdueCount > 0 || dueTodayCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
          <span className="text-sm font-medium text-rose-500">接单提醒</span>
          {overdueCount > 0 && (
            <span className="badge-danger px-2.5 py-0.5 rounded-full text-xs font-medium">
              {overdueCount}人已逾期
            </span>
          )}
          {dueTodayCount > 0 && (
            <span className="badge-orange px-2.5 py-0.5 rounded-full text-xs font-medium">
              {dueTodayCount}人今天该接单
            </span>
          )}
          {dueSoonCount > 0 && (
            <span className="badge-warning px-2.5 py-0.5 rounded-full text-xs font-medium">
              {dueSoonCount}人3天内待接单
            </span>
          )}
        </div>
      )}

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
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 text-left font-medium">接单人</th>
                <th className="px-4 py-3 text-center font-medium">接单数</th>
                <th className="px-4 py-3 text-left font-medium">最近接单</th>
                <th className="px-4 py-3 text-center font-medium min-w-[140px]">距下次接单</th>
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
                  const countdown = getCountdownState(taker.daysUntilNext);
                  const progress = getProgressPercent(taker.daysSinceLastOrder, taker.avgInterval);
                  const isOverdue = taker.daysUntilNext !== null && taker.daysUntilNext < 0;
                  const CountdownIcon = countdown.icon;

                  return (
                    <Fragment key={taker.takerId}>
                      <tr
                        className={`table-row-hover table-row-zebra cursor-pointer ${isOverdue ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}`}
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
                        {/* Countdown cell - the star of the show */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${countdown.badgeClass} ${countdown.pulse ? 'animate-pulse' : ''}`}
                            >
                              <CountdownIcon className="h-3 w-3" />
                              {countdown.label}
                            </span>
                            {/* Progress bar */}
                            {taker.avgInterval !== null && taker.avgInterval > 0 && (
                              <div className="w-full max-w-[100px] h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isOverdue
                                      ? 'bg-rose-500'
                                      : progress > 80
                                      ? 'bg-orange-500'
                                      : progress > 50
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            )}
                          </div>
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
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
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
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : taker.maxInterval > 7
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-amber-600 dark:text-amber-400'
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
                        <tr>
                          <td colSpan={9} className="px-4 pb-4 bg-muted/20">
                            <div className="rounded-xl border bg-card overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">序号</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">上次接单日期</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">本次接单日期</th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">间隔天数</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {taker.intervals.map((interval, idx) => (
                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                      <td className="px-3 py-2 text-muted-foreground">#{idx + 1}</td>
                                      <td className="px-3 py-2">{formatDate(interval.fromDate)}</td>
                                      <td className="px-3 py-2">{formatDate(interval.toDate)}</td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getIntervalBadge(interval.intervalDays)}`}>
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
        <span>距下次接单：</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500" />
          逾期/今天
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-400" />
          1-3天
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-sky-400" />
          4-7天
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-400" />
          7天+
        </span>
      </div>
    </div>
  );
}
