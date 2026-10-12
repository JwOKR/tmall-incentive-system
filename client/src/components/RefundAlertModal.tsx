import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { remindApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Loader2, X, Copy, CheckCircle, Users, ChevronDown, ChevronRight } from 'lucide-react';

interface RefundAlertModalProps {
  open: boolean;
  onClose: () => void;
}

/** 快捷天数选项 */
const DAY_PRESETS = [7, 15, 30, 60];

/** 金额格式化：保留两位小数，结尾 .00 去掉（与后端 formatAmount 口径一致，不加千分号） */
function fmtAmount(n: number): string {
  const fixed = Number(n || 0).toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}

/**
 * 超期未返款看板弹窗。
 *
 * 视觉与 Dashboard 的「催单列表」Modal 保持一致（modal-overlay / modal-content modal-lg）。
 * 权限守卫在路由层，本组件内**不得**写权限条件 return，避免 Hook 顺序违规。
 */
export default function RefundAlertModal({ open, onClose }: RefundAlertModalProps) {
  const { success: toastSuccess } = useToast();
  // undefined = 首次加载不传 days，由后端读取系统设置 refund_alert_days
  const [days, setDays] = useState<number | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 详情/看板类查询：显式关掉全局 staleTime 并强制挂载时重取（该 queryKey 不会被 invalidate）
  const { data, isLoading } = useQuery({
    queryKey: ['refund-alerts', days],
    queryFn: () => remindApi.getRefundAlerts(days),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
    // 首次加载 days=undefined → 服务端返回配置值后会把 days 同步进 state，导致 queryKey 变化并触发
    // 第二次请求；用 placeholderData 保留上一份数据，避免切换 key 时闪一下 loading。
    placeholderData: (prev: any) => prev,
  });

  const payload: any = (data as any)?.data;
  const summary: any = payload?.summary;
  const list: any[] = Array.isArray(payload?.list) ? payload.list : [];

  // 首次加载未传 days → 用后端配置值，并把返回的 summary.days 同步到选择器
  useEffect(() => {
    if (open && summary?.days && days === undefined) {
      setDays(summary.days);
    }
  }, [open, summary?.days, days]);

  // 所有 Hook 均在其后，早退不会改变 Hook 调用顺序
  if (!open) return null;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    if (payload?.copyText) {
      await navigator.clipboard.writeText(payload.copyText);
      toastSuccess('已复制到剪贴板');
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      <div className="modal-content modal-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center">
              <Copy className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">超期未返款</h3>
              <p className="text-xs text-muted-foreground">
                {summary
                  ? `${summary.totalTakers} 人 · ${summary.totalOrders} 单 · 合计 ¥${fmtAmount(summary.totalAmount)}`
                  : '加载中…'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 超期天数选择 */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-muted-foreground">超期天数</span>
          {DAY_PRESETS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d
                  ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-transparent shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80'
              }`}
            >
              {d} 天
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={365}
            value={days ?? ''}
            onChange={e => {
              const v = e.target.value;
              setDays(v === '' ? undefined : Number(v));
            }}
            placeholder="自定义"
            className="apple-input rounded-lg w-24 text-sm"
          />
          {summary?.skippedNoTaker > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
              另有 {summary.skippedNoTaker} 单未关联接单人，未纳入分组
            </span>
          )}
        </div>

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[60vh] pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              加载中…
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <p className="apple-text-headline text-muted-foreground">没有超期未返款的订单</p>
              <p className="apple-text-body text-muted-foreground">当前天数范围内无需处理</p>
            </div>
          ) : (
            list.map((g: any) => (
              <div
                key={g.takerId}
                className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-md transition-all duration-200"
              >
                <button
                  onClick={() => toggle(g.takerId)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{g.wechatName}</p>
                      <p className="text-xs text-muted-foreground">{g.wechatId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                      {g.overdueOrders.length} 单
                    </span>
                    <span className="text-sm font-semibold tabular-nums">¥{fmtAmount(g.totalAmount)}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">最长 {g.maxOverdueDays} 天</span>
                    {expanded.has(g.takerId) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {expanded.has(g.takerId) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 max-h-[40vh] overflow-auto space-y-1.5">
                    {g.overdueOrders.map((o: any) => (
                      <div key={o.orderId} className="flex items-center justify-between text-xs gap-3">
                        <span className="font-mono truncate">{o.orderNo19 || '未填写'}</span>
                        <span className="tabular-nums whitespace-nowrap">¥{fmtAmount(o.actualPayment)}</span>
                        <span className="text-rose-600 dark:text-rose-400 whitespace-nowrap">已超期 {o.overdueDays} 天</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-muted-foreground">
            {summary ? `共 ${summary.totalTakers} 人 · ${summary.totalOrders} 单 · ¥${fmtAmount(summary.totalAmount)}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!payload?.copyText}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-medium shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/30 hover:from-rose-600 hover:to-red-700 transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> 复制对账文本
            </button>
            <button onClick={onClose} className="inline-flex items-center px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95">关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
}
