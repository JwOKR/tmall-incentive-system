import type { ComponentType, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { anomalyApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  AlertTriangle,
  AlarmClock,
  Banknote,
  CalendarClock,
  CheckCircle,
  Clock,
  Flame,
  Hash,
  Layers,
  RefreshCw,
  Scale,
  ShieldAlert,
} from 'lucide-react';

/** 通用表格外壳：卡片 + 标题 + 说明 + 表体 + 底部统计 */
function AnomalyTable({
  icon: Icon,
  iconClass,
  title,
  count,
  note,
  columns,
  children,
  footer,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  count: number;
  note?: string;
  columns: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl apple-card p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Icon className={`h-5 w-5 ${iconClass}`} />
          {title} ({count})
        </h3>
      </div>
      {note && <p className="text-xs text-muted-foreground mb-4">{note}</p>}
      <div className={`overflow-x-auto ${note ? '' : 'mt-2'}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={`px-4 py-3 font-medium ${i === columns.length - 1 ? 'text-right' : 'text-left'}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/** 单价/金额单元格 */
function Amount({ value }: { value: number | null | undefined }) {
  return <span className="tabular-nums">{formatCurrency(value ?? 0)}</span>;
}

export default function AnomalyAlerts() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => anomalyApi.getAnomalies(),
  });

  const anomalies = (data as any)?.data;
  const summary = anomalies?.summary || {};
  const scanNotes = anomalies?.scanNotes || {};
  const scanErrors: any[] = anomalies?.scanErrors || [];

  const missingOrderNoOrders: any[] = anomalies?.missingOrderNoOrders || [];
  const staleTakers: any[] = anomalies?.staleTakers || [];
  const negativePaymentOrders: any[] = anomalies?.negativePaymentOrders || [];
  const refundMismatchOrders: any[] = anomalies?.refundMismatchOrders || [];
  const highFrequencyGroups: any[] = anomalies?.highFrequencyGroups || [];
  const intervalBypassPairs: any[] = anomalies?.intervalBypassPairs || [];
  const overLimitTasks: any[] = anomalies?.overLimitTasks || [];
  const overdueTasks: any[] = anomalies?.overdueTasks || [];

  const cards = [
    { title: '双单号全空', value: summary.missingOrderNo || 0, icon: Hash, tone: 'rose' as const },
    { title: '超14天未接单', value: summary.staleTakers || 0, icon: Clock, tone: 'amber' as const },
    { title: '实付≤0', value: summary.negativePayment || 0, icon: Banknote, tone: 'rose' as const },
    { title: '返款金额漂移', value: summary.refundMismatch || 0, icon: Scale, tone: 'rose' as const },
    { title: '同人同商品高频', value: summary.highFrequency || 0, icon: Flame, tone: 'amber' as const },
    { title: '7天间隔绕过', value: summary.intervalBypass || 0, icon: CalendarClock, tone: 'amber' as const },
    { title: '任务超限接单', value: summary.taskOverLimit || 0, icon: Layers, tone: 'rose' as const },
    { title: '超期任务', value: summary.overdueTask || 0, icon: AlarmClock, tone: 'rose' as const },
    { title: '异常总数', value: summary.totalAnomalies || 0, icon: AlertTriangle, tone: 'orange' as const },
  ];

  const toneClasses: Record<string, { text: string; bg: string }> = {
    emerald: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    rose: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30' },
    amber: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    orange: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">异常预警</h2>
          <p className="text-muted-foreground mt-1">自动检测无效订单、金额异常与超长间隔接单人</p>
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
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl apple-card p-5">
              <div className="space-y-2">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-8 w-12 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* 可见降级警告横幅：任一检测失败都必须显式暴露，绝不能显示成「全绿」 */}
          {scanErrors.length > 0 && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-rose-700 dark:text-rose-300">
                    部分检测未能完成，结果可能不完整
                  </p>
                  <ul className="mt-1 list-disc list-inside text-sm text-rose-700/90 dark:text-rose-300/90">
                    {scanErrors.map((e: any, i: number) => (
                      <li key={`${e?.type}-${i}`}>
                        <span className="font-medium">{e?.type}</span>：{e?.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards（覆盖全部类型） */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {cards.map(card => {
              const hasIssue = card.value > 0;
              const tone = toneClasses[hasIssue ? card.tone : 'emerald'];
              return (
                <div key={card.title} className="rounded-2xl apple-card p-5 card-hover">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className={`text-2xl font-bold mt-1 tabular-nums ${tone.text}`}>{card.value}</p>
                    </div>
                    <div className={`${tone.bg} ${tone.text} p-3 rounded-xl`}>
                      <card.icon className="h-6 w-6" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 1. 双单号全空订单（无法对账的废单） */}
          {(summary.missingOrderNo || 0) > 0 && (
            <AnomalyTable
              icon={Hash}
              iconClass="text-rose-500"
              title="双单号全空订单"
              count={summary.missingOrderNo || 0}
              note="订单号重复由数据库唯一约束保证，故不做重复检测；此处列出的是双单号全空、无法对账的订单。"
              columns={['微信昵称', '微信号', '实付', '接单日期']}
              footer={
                (summary.missingOrderNo || 0) > missingOrderNoOrders.length && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    仅显示最近 {missingOrderNoOrders.length} 条，共 {summary.missingOrderNo} 条
                  </p>
                )
              }
            >
              {missingOrderNoOrders.map((o: any) => (
                <tr key={o.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{o.wechatName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.wechatId || '-'}</td>
                  <td className="px-4 py-3 text-right"><Amount value={o.actualPayment} /></td>
                  <td className="px-4 py-3 text-right">{formatDate(o.orderDate)}</td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 2. 超14天未接单 */}
          {staleTakers.length > 0 && (
            <AnomalyTable
              icon={Clock}
              iconClass="text-amber-500"
              title="超14天未接单"
              count={staleTakers.length}
              columns={['微信昵称', '微信号', '最后接单日期', '距今天数']}
              footer={
                <p className="mt-3 text-sm text-muted-foreground">
                  ≥30 天无接单记录的活跃接单人将在<strong className="font-medium">服务启动时</strong>被自动停用
                </p>
              }
            >
              {staleTakers.map((t: any) => (
                <tr key={t.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{t.wechatName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.wechatId}</td>
                  <td className="px-4 py-3">
                    {t.neverOrdered ? (
                      <span className="text-muted-foreground">从未接单</span>
                    ) : (
                      formatDate(t.lastOrderDate)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold tabular-nums ${t.daysSinceLastOrder >= 30 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {t.daysSinceLastOrder}天
                    </span>
                  </td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 3. 实付 ≤ 0 */}
          {negativePaymentOrders.length > 0 && (
            <AnomalyTable
              icon={Banknote}
              iconClass="text-rose-500"
              title="实付 ≤ 0 订单"
              count={negativePaymentOrders.length}
              note={scanNotes.negativePayment}
              columns={['微信昵称', '微信号', '实付', '接单日期']}
            >
              {negativePaymentOrders.map((o: any) => (
                <tr key={o.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{o.wechatName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.wechatId || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {formatCurrency(o.actualPayment)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{formatDate(o.orderDate)}</td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 4. totalRefund 漂移 */}
          {refundMismatchOrders.length > 0 && (
            <AnomalyTable
              icon={Scale}
              iconClass="text-rose-500"
              title="返款金额漂移"
              count={refundMismatchOrders.length}
              note={`库里的总返款 ≠（实付 + 基础返佣 + 好评返佣）。${scanNotes.refundMismatch || ''}`}
              columns={['微信昵称', '实付', '基础返佣', '好评返佣', '库值', '应有值', '差额', '接单日期']}
            >
              {refundMismatchOrders.map((o: any) => (
                <tr key={o.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{o.wechatName || '-'}</td>
                  <td className="px-4 py-3 text-right"><Amount value={o.actualPayment} /></td>
                  <td className="px-4 py-3 text-right"><Amount value={o.baseCommission} /></td>
                  <td className="px-4 py-3 text-right"><Amount value={o.reviewCommission} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(o.totalRefund)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(o.expectedRefund)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(o.diff)}</td>
                  <td className="px-4 py-3 text-right">{formatDate(o.orderDate)}</td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 5. 同人同商品 30 天高频 */}
          {highFrequencyGroups.length > 0 && (
            <AnomalyTable
              icon={Flame}
              iconClass="text-amber-500"
              title="同人同商品高频接单"
              count={highFrequencyGroups.length}
              note={scanNotes.highFrequency}
              columns={['微信昵称', '微信号', '商品编号', '商品ID', '近30天次数']}
            >
              {highFrequencyGroups.map((g: any, idx: number) => (
                <tr key={`${g.takerId}-${g.productId}-${idx}`} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{g.wechatName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{g.wechatId || '-'}</td>
                  <td className="px-4 py-3">{g.productCode || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{g.productId || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">{g.count}次</span>
                  </td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 6. 7 天间隔绕过 */}
          {intervalBypassPairs.length > 0 && (
            <AnomalyTable
              icon={CalendarClock}
              iconClass="text-amber-500"
              title="7天间隔绕过"
              count={intervalBypassPairs.length}
              note={scanNotes.intervalBypass}
              columns={['微信昵称', '微信号', '前一单', '后一单', '间隔天数']}
            >
              {intervalBypassPairs.map((x: any, idx: number) => (
                <tr key={`${x.prevOrderId}-${x.nextOrderId}-${idx}`} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{x.wechatName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{x.wechatId || '-'}</td>
                  <td className="px-4 py-3">{formatDate(x.prevOrderDate)}</td>
                  <td className="px-4 py-3">{formatDate(x.nextOrderDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">{x.gapDays}天</span>
                  </td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 7. 任务超限接单 */}
          {overLimitTasks.length > 0 && (
            <AnomalyTable
              icon={Layers}
              iconClass="text-rose-500"
              title="任务超限接单"
              count={overLimitTasks.length}
              note={scanNotes.taskOverLimit}
              columns={['任务ID', '商品编号', '商品ID', '限接人数', '已接人数', '状态']}
            >
              {overLimitTasks.map((t: any) => (
                <tr key={t.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.id}</td>
                  <td className="px-4 py-3 font-medium">{t.productCode || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.productId || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.maxOrders}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">{t.currentOrders}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{t.status}</td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* 8. 超期任务（有截止日、已过截止日且未完成/未取消） */}
          {overdueTasks.length > 0 && (
            <AnomalyTable
              icon={AlarmClock}
              iconClass="text-rose-500"
              title="超期任务"
              count={summary.overdueTask || 0}
              note={scanNotes.overdueTask}
              columns={['商品编号', '商品ID', '截止日期', '超期天数', '已接/限接', '状态']}
              footer={
                (summary.overdueTask || 0) > overdueTasks.length && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    仅显示最早超期的 {overdueTasks.length} 条，共 {summary.overdueTask} 条
                  </p>
                )
              }
            >
              {overdueTasks.map((t: any) => (
                <tr key={t.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 font-medium">{t.productCode || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.productId || '-'}</td>
                  <td className="px-4 py-3">{t.deadline ? formatDate(t.deadline) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">{t.daysOverdue}天</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.currentOrders}/{t.maxOrders}</td>
                  <td className="px-4 py-3 text-right">{t.status}</td>
                </tr>
              ))}
            </AnomalyTable>
          )}

          {/* No Anomalies（仅当确无异常且无检测降级时才显示「一切正常」） */}
          {summary.totalAnomalies === 0 && scanErrors.length === 0 && (
            <div className="rounded-2xl apple-card p-12 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-medium">一切正常</p>
              <p className="text-sm text-muted-foreground mt-1">
                未检测到无效订单、金额异常、超长间隔接单人、高频接单、任务超限或超期任务
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
