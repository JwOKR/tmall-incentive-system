import {
  Calendar, DollarSign, TrendingUp, Package, BarChart3, Loader2, Pencil, Trash2, Sparkles, Cpu,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { calcTotals, fmt, fmtInt } from '@/lib/repeatDiscounts';
import type { FormState, RecordItem } from '@/lib/repeatDiscounts';
import { StatCard } from './StatCard';
import { TrendArrow } from './TrendArrow';
import { EditRecordModal } from './EditRecordModal';

// 总体AI分析状态集合（历史数据页面）
export interface OverallAiState {
  sections: { title: string; content: string }[] | null;
  loading: boolean;
  error: string;
  source: 'ai' | 'local' | null;
  model: string;
  onAnalyze: () => void;
}

// 编辑弹窗状态集合
export interface EditModalState {
  showEditModal: boolean;
  setShowEditModal: (v: boolean) => void;
  editForm: FormState;
  setEditForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSaveEdit: () => void;
  updatePending: boolean;
}

// ─── Tab: History ────────────────────────────────────────────────────────

export function HistoryTab({
  list, total, totalPages, listLoading, summary,
  startDate, setStartDate, endDate, setEndDate, page, setPage,
  onEdit, onDelete, overallAi, edit,
}: {
  list: RecordItem[];
  total: number;
  totalPages: number;
  listLoading: boolean;
  summary: any;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  onEdit: (item: RecordItem) => void;
  onDelete: (id: string, date: string) => void;
  overallAi: OverallAiState;
  edit: EditModalState;
}) {
  const {
    sections: overallAiSections,
    loading: overallAiLoading,
    error: overallAiError,
    source: overallAiSource,
    model: overallAiModel,
    onAnalyze: handleOverallAiAnalysis,
  } = overallAi;
  const {
    showEditModal, setShowEditModal, editForm, setEditForm,
    onSaveEdit: handleSaveEdit, updatePending,
  } = edit;

  const latestDay = list.length > 0 ? list[list.length - 1] : null;
  const prevDay = list.length > 1 ? list[list.length - 2] : null;

  // 快捷日期筛选
  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap animate-fade-up">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">起始日期</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">结束日期</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" />
        </div>
        {/* 快捷筛选按钮 */}
        <div className="flex gap-1.5 ml-1">
          {[
            { label: '近7天', days: 7 },
            { label: '近14天', days: 14 },
            { label: '近30天', days: 30 },
          ].map(q => (
            <button key={q.days} onClick={() => setQuickRange(q.days)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border/60 bg-background/40 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all apple-btn">
              {q.label}
            </button>
          ))}
        </div>
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
            className="text-sm text-muted-foreground hover:text-foreground apple-btn rounded-lg px-2 py-1">清除筛选</button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">共 {total} 条</span>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard icon={Calendar} label="记录天数" value={summary.totalDays} accent="blue" delay={0} />
          <StatCard icon={DollarSign} label="最新合计ROI" value={latestDay ? calcTotals(latestDay).roi.toFixed(2) : '-'} accent="red" delay={60}
            sub={latestDay && prevDay ? <TrendArrow current={calcTotals(latestDay).roi} previous={calcTotals(prevDay).roi} /> : undefined}
          />
          <StatCard icon={TrendingUp} label="平均ROI" value={summary.avgRoi?.toFixed(2) || '-'} accent="orange" delay={120} />
          <StatCard icon={Package} label="累计支付" value={<span className="text-green-600 dark:text-green-400">{fmt(summary.totalPaymentAmount || 0)}</span>} accent="green" delay={180} />
          <StatCard icon={BarChart3} label="单日最高支付" value={<span>{fmt(summary.maxDailyPayment || 0)}</span>} accent="purple" delay={240} />
          <StatCard icon={TrendingUp} label="净收益率" value={(() => {
            const grant = summary.totalGrantAmount || 0;
            const pay = summary.totalPaymentAmount || 0;
            const netRate = grant > 0 ? ((pay - grant) / grant * 100) : 0;
            return <span className={netRate >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{netRate >= 0 ? '+' : ''}{netRate.toFixed(1)}%</span>;
          })()} accent="blue" delay={300} />
        </div>
      )}

      {/* AI 总数据分析 */}
      <div className="animate-fade-up" style={{ animationDelay: '250ms' }}>
        {/* 按钮栏 */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <button onClick={handleOverallAiAnalysis}
            disabled={overallAiLoading || !summary}
            className={`apple-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ${
              overallAiSource === 'ai'
                ? 'bg-gradient-to-r from-green-600 to-emerald-500 shadow-green-500/25 hover:shadow-green-500/40'
                : overallAiSource === 'local'
                ? 'bg-gradient-to-r from-slate-600 to-slate-500 shadow-slate-500/25 hover:shadow-slate-500/40'
                : 'bg-gradient-to-r from-purple-600 to-blue-500 shadow-purple-500/25 hover:shadow-purple-500/40'
            }`}>
            {overallAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : overallAiSource === 'ai' ? <Sparkles className="h-4 w-4" /> : overallAiSource === 'local' ? <Cpu className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {overallAiLoading ? 'AI总分析中...' : overallAiSource === 'ai' ? '重新总分析' : overallAiSource === 'local' ? '重试AI总分析' : 'AI总数据分析'}
          </button>
          <span className="text-sm text-muted-foreground">
            {startDate || endDate
              ? `分析范围：${startDate || '起始'} ~ ${endDate || '至今'}`
              : '分析范围：全部数据'}
          </span>
        </div>

        {/* 降级警告 */}
        {overallAiError && overallAiSource === 'local' && (
          <div className="rounded-xl bg-yellow-500/10 dark:bg-yellow-500/15 border border-yellow-500/30 px-4 py-2.5 text-xs text-yellow-700 dark:text-yellow-400 mb-3">
            ⚠ {overallAiError}
          </div>
        )}

        {/* 分析结果 */}
        {overallAiSections && overallAiSections.length > 0 && (() => {
          const currentSource = overallAiSource || 'local';
          const s = summary;
          const days = s?.totalDays || 1;
          return (
            <div className="glass-card rounded-2xl shadow-sm overflow-hidden">
              {/* 分析报告 Header */}
              <div className="px-6 py-5 border-b border-border/50 bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-500/15 dark:to-blue-500/15">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {currentSource === 'ai' ? (
                    <>
                      <div className="icon-badge bg-purple-500/15 text-purple-600 dark:text-purple-400"><Sparkles className="h-4 w-4" /></div>
                      <h3 className="text-base font-bold text-purple-600 dark:text-purple-400">AI 总数据分析报告</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 dark:bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <Sparkles className="h-3 w-3" /> AI 生成{overallAiModel ? ` · ${overallAiModel}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="icon-badge bg-slate-500/15 text-slate-600 dark:text-slate-400"><Cpu className="h-4 w-4" /></div>
                      <h3 className="text-base font-bold text-slate-600 dark:text-slate-400">本地规则引擎总分析报告</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 dark:bg-slate-500/20 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-500/20">
                        <Cpu className="h-3 w-3" /> 规则引擎
                      </span>
                    </>
                  )}
                  <span className="text-sm text-muted-foreground ml-auto">
                    {days} 天数据 · 累计ROI {s?.totalROI?.toFixed(2) || '-'}
                  </span>
                </div>
              </div>

              {/* 累计汇总 mini-cards */}
              {s && (
                <div className="px-6 py-4 border-b border-border/50 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: '累计发放', value: `${fmt(s.totalGrantAmount || 0)}`, color: 'text-red-600 dark:text-red-400' },
                    { label: '累计支付', value: `${fmt(s.totalPaymentAmount || 0)}`, color: 'text-green-600 dark:text-green-400' },
                    { label: '累计买家', value: `${fmtInt(s.totalPaymentBuyers || 0)} 人`, color: '' },
                    { label: '累计件数', value: `${fmtInt(s.totalPaymentItems || 0)} 件`, color: '' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/30 rounded-xl p-3">
                      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 分析 sections */}
              <div className="px-6 py-5 space-y-4">
                {overallAiSections.map((sec, i) => (
                  <div key={i} className={`rounded-xl p-4 border ${
                    currentSource === 'ai'
                      ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/10'
                      : 'bg-slate-500/5 dark:bg-slate-500/10 border-slate-500/10'
                  }`}>
                    <h4 className={`text-sm font-bold mb-1.5 ${
                      currentSource === 'ai'
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>{i + 1}. {sec.title}</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">{sec.content}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: '300ms' }}>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <th className="text-left px-4 py-3.5 font-semibold text-muted-foreground whitespace-nowrap">日期</th>
                <th className="text-right px-4 py-3.5 font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">已购发放</th>
                <th className="text-right px-4 py-3.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">已购支付</th>
                <th className="text-right px-4 py-3.5 font-semibold text-muted-foreground whitespace-nowrap">已购ROI</th>
                <th className="text-right px-4 py-3.5 font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">沉睡发放</th>
                <th className="text-right px-4 py-3.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">沉睡支付</th>
                <th className="text-right px-4 py-3.5 font-semibold text-muted-foreground whitespace-nowrap">沉睡ROI</th>
                <th className="text-right px-4 py-3.5 font-semibold text-red-700 dark:text-red-300 whitespace-nowrap">合计发放</th>
                <th className="text-right px-4 py-3.5 font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">合计支付</th>
                <th className="text-right px-4 py-3.5 font-semibold text-muted-foreground whitespace-nowrap">合计ROI</th>
                <th className="text-center px-4 py-3.5 font-semibold text-muted-foreground w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={11} className="text-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-red-500" />加载中...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-16 text-muted-foreground">暂无数据</td></tr>
              ) : (
                list.map((item, idx) => {
                  const totals = calcTotals(item);
                  const prevItem = idx < list.length - 1 ? list[idx + 1] : null;
                  const prevTotals = prevItem ? calcTotals(prevItem) : null;
                  return (
                    <tr key={item.id} className={`border-b last:border-b-0 transition-all hover:bg-red-500/5 dark:hover:bg-red-500/10 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                      <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{formatDate(item.recordDate)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-red-600 dark:text-red-400 tabular-nums">{fmt(item.g1.grantAmount)}</td>
                      <td className="px-4 py-3.5 text-right text-green-600 dark:text-green-400 tabular-nums">{fmt(item.g1.paymentAmount)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`font-medium tabular-nums rounded-lg px-1.5 py-0.5 ${item.g1.grantAmount > 0 ? (item.g1.paymentAmount / item.g1.grantAmount) >= 3 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : (item.g1.paymentAmount / item.g1.grantAmount) >= 1 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' : 'bg-red-500/15 text-red-600 dark:text-red-400' : ''}`}>{item.g1.grantAmount > 0 ? (item.g1.paymentAmount / item.g1.grantAmount).toFixed(2) : '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-red-600 dark:text-red-400 tabular-nums">{fmt(item.g2.grantAmount)}</td>
                      <td className="px-4 py-3.5 text-right text-green-600 dark:text-green-400 tabular-nums">{fmt(item.g2.paymentAmount)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`font-medium tabular-nums rounded-lg px-1.5 py-0.5 ${item.g2.grantAmount > 0 ? (item.g2.paymentAmount / item.g2.grantAmount) >= 3 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : (item.g2.paymentAmount / item.g2.grantAmount) >= 1 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' : 'bg-red-500/15 text-red-600 dark:text-red-400' : ''}`}>{item.g2.grantAmount > 0 ? (item.g2.paymentAmount / item.g2.grantAmount).toFixed(2) : '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-red-700 dark:text-red-300 font-semibold tabular-nums">{fmt(totals.grant)}</td>
                      <td className="px-4 py-3.5 text-right text-green-700 dark:text-green-300 font-semibold tabular-nums">{fmt(totals.pay)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                            totals.roi >= 3 ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
                            totals.roi >= 1 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' :
                            'bg-red-500/15 text-red-600 dark:text-red-400'
                          }`}>
                            {totals.grant > 0 ? totals.roi.toFixed(2) : '-'}
                          </span>
                          {prevTotals && prevTotals.grant > 0 && <TrendArrow current={totals.roi} previous={prevTotals.roi} />}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onEdit(item)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground apple-btn" title="编辑">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => onDelete(item.id, item.recordDate)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive apple-btn" title="删除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="apple-btn px-4 py-2 rounded-xl border text-sm disabled:opacity-40 hover:bg-accent">上一页</button>
            <span className="text-sm text-muted-foreground font-medium">第 {page} / {totalPages} 页</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="apple-btn px-4 py-2 rounded-xl border text-sm disabled:opacity-40 hover:bg-accent">下一页</button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditRecordModal
        show={showEditModal}
        onClose={() => setShowEditModal(false)}
        editForm={editForm}
        setEditForm={setEditForm}
        onSave={handleSaveEdit}
        pending={updatePending}
      />
    </div>
  );
}
