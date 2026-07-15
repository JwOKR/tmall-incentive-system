import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repeatDiscountApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Pencil, Trash2, TrendingUp, DollarSign, Package,
  Calendar, Loader2, Save, X, Clipboard, ArrowUp, ArrowDown, Minus,
  BarChart3, FileText, Download, ChevronDown, Sparkles, Cpu,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { usePermissions, NoPermission } from '@/lib/permissions';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip as ChartTooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ChartTooltip, Legend, Filler);

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupData {
  grantAmount: string;
  paymentAmount: string;
  paymentBuyers: string;
  paymentItems: string;
}

interface FormState {
  recordDate: string;
  g1: GroupData;
  g2: GroupData;
}

interface RecordItem {
  id: string;
  recordDate: string;
  g1: { grantAmount: number; paymentAmount: number; paymentBuyers: number; paymentItems: number };
  g2: { grantAmount: number; paymentAmount: number; paymentBuyers: number; paymentItems: number };
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const emptyGroup: GroupData = { grantAmount: '', paymentAmount: '', paymentBuyers: '', paymentItems: '' };

const emptyForm: FormState = { recordDate: '', g1: { ...emptyGroup }, g2: { ...emptyGroup } };

const calcRoi = (grant: number, pay: number) => (grant > 0 ? (pay / grant) : 0);

const calcTotals = (r: RecordItem) => ({
  grant: r.g1.grantAmount + r.g2.grantAmount,
  pay: r.g1.paymentAmount + r.g2.paymentAmount,
  roi: calcRoi(r.g1.grantAmount + r.g2.grantAmount, r.g1.paymentAmount + r.g2.paymentAmount),
});

const fmt = (v: number) => Number(v.toFixed(2)) % 1 === 0 ? Math.round(v).toString() : v.toFixed(2);
const fmtInt = (v: number) => Math.round(v).toString();

const TABS = [
  { key: 'entry', label: '登记数据', icon: Clipboard },
  { key: 'history', label: '历史数据', icon: BarChart3 },
  { key: 'chart', label: '趋势图表', icon: TrendingUp },
  { key: 'preview', label: '日报预览', icon: FileText },
] as const;

type TabKey = typeof TABS[number]['key'];

// Smart paste: parse 生意参谋 pasted text
function parsePastedText(text: string): Partial<GroupData> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: Partial<GroupData> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('发放金额') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9.\-]/g, '');
      if (val) result.grantAmount = val;
    } else if (line.includes('支付金额') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9.\-]/g, '');
      if (val) result.paymentAmount = val;
    } else if (line.includes('支付买家数') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9]/g, '');
      if (val) result.paymentBuyers = val;
    } else if (line.includes('支付件数') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9]/g, '');
      if (val) result.paymentItems = val;
    }
  }
  return result;
}

// Trend arrow component
function TrendArrow({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === null || previous === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (pct > 0) return <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5 text-xs font-medium"><ArrowUp className="h-3 w-3" />{pct.toFixed(1)}%</span>;
  if (pct < 0) return <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5 text-xs font-medium"><ArrowDown className="h-3 w-3" />{Math.abs(pct).toFixed(1)}%</span>;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ─── Stat Card Component ─────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent, delay,
}: {
  icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode;
  accent: 'red' | 'green' | 'blue' | 'orange' | 'purple'; delay: number;
}) {
  const accentMap = {
    red: { bg: 'stat-accent-red', icon: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    green: { bg: 'stat-accent-green', icon: 'bg-green-500/15 text-green-600 dark:text-green-400' },
    blue: { bg: 'stat-accent-blue', icon: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    orange: { bg: 'stat-accent-orange', icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
    purple: { bg: 'stat-accent-purple', icon: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  };
  const a = accentMap[accent];
  return (
    <div
      className={`glass-card rounded-2xl p-5 animate-fade-up card-hover ${a.bg}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`icon-badge ${a.icon}`}>
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
        {sub}
      </div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RepeatDiscounts() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { canView, canEdit } = usePermissions();

  const [activeTab, setActiveTab] = useState<TabKey>('entry');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pasteText1, setPasteText1] = useState('');
  const [pasteText2, setPasteText2] = useState('');
  const [previewDate, setPreviewDate] = useState('');
  const [aiSections, setAiSections] = useState<{ title: string; content: string }[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSource, setAiSource] = useState<'ai' | 'local' | null>(null);
  const [aiModel, setAiModel] = useState('');

  // 总体AI分析状态（历史数据页面）
  const [overallAiSections, setOverallAiSections] = useState<{ title: string; content: string }[] | null>(null);
  const [overallAiLoading, setOverallAiLoading] = useState(false);
  const [overallAiError, setOverallAiError] = useState('');
  const [overallAiSource, setOverallAiSource] = useState<'ai' | 'local' | null>(null);
  const [overallAiModel, setOverallAiModel] = useState('');

  // 筛选日期变化时从后端加载已保存的总体分析
  useEffect(() => {
    let cancelled = false;
    setOverallAiError('');
    console.log('[OverallAI] Loading saved analysis for:', { startDate, endDate });
    repeatDiscountApi.getSavedOverallAnalysis(startDate || undefined, endDate || undefined).then((res: any) => {
      if (cancelled) return;
      console.log('[OverallAI] Raw response:', res);
      // axios 拦截器已解包一层
      const data = res?.data ?? res;
      console.log('[OverallAI] Parsed data:', data);
      if (data && data.sections) {
        console.log('[OverallAI] Found saved analysis, sections count:', data.sections.length);
        setOverallAiSections(data.sections);
        setOverallAiSource(data.source);
        setOverallAiModel(data.model || '');
      } else {
        console.log('[OverallAI] No saved analysis found');
        setOverallAiSections(null);
        setOverallAiSource(null);
        setOverallAiModel('');
      }
    }).catch((err) => {
      console.error('[OverallAI] Error loading:', err);
      if (!cancelled) {
        setOverallAiSections(null);
        setOverallAiSource(null);
        setOverallAiModel('');
      }
    });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['repeatDiscounts', page, startDate, endDate],
    queryFn: () => repeatDiscountApi.getAll({
      page, pageSize: 20,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['repeatDiscountSummary', startDate, endDate],
    queryFn: () => repeatDiscountApi.getSummary({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const { data: allData } = useQuery({
    queryKey: ['repeatDiscountsAll'],
    queryFn: () => repeatDiscountApi.getAll({ page: 1, pageSize: 999 }),
  });

  // ─── Mutations ───────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: repeatDiscountApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountsAll'] });
      toastSuccess('登记成功');
      setForm(emptyForm);
      setPasteText1('');
      setPasteText2('');
    },
    onError: (e: any) => toastError(e?.response?.data?.message || '登记失败'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => repeatDiscountApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountsAll'] });
      toastSuccess('更新成功');
      setShowEditModal(false);
      setEditingId(null);
    },
    onError: (e: any) => toastError(e?.response?.data?.message || '更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: repeatDiscountApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountsAll'] });
      toastSuccess('删除成功');
    },
    onError: (e: any) => toastError(e?.response?.data?.message || '删除失败'),
  });

  // ─── Derived Data ────────────────────────────────────────────────────────

  const mapRecord = (r: any): RecordItem => ({
    id: r.id,
    recordDate: r.recordDate,
    g1: {
      grantAmount: r.g1?.grantAmount ?? r.g1GrantAmount ?? 0,
      paymentAmount: r.g1?.paymentAmount ?? r.g1PaymentAmount ?? 0,
      paymentBuyers: r.g1?.paymentBuyers ?? r.g1PaymentBuyers ?? 0,
      paymentItems: r.g1?.paymentItems ?? r.g1PaymentItems ?? 0,
    },
    g2: {
      grantAmount: r.g2?.grantAmount ?? r.g2GrantAmount ?? 0,
      paymentAmount: r.g2?.paymentAmount ?? r.g2PaymentAmount ?? 0,
      paymentBuyers: r.g2?.paymentBuyers ?? r.g2PaymentBuyers ?? 0,
      paymentItems: r.g2?.paymentItems ?? r.g2PaymentItems ?? 0,
    },
  });

  const summary = (summaryData as any)?.data;
  const list: RecordItem[] = ((listData as any)?.data?.list || []).map(mapRecord);
  const total = (listData as any)?.data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const allRecords: RecordItem[] = useMemo(() => {
    const d = ((allData as any)?.data?.list || []).map(mapRecord);
    return d.sort((a: RecordItem, b: RecordItem) => a.recordDate.localeCompare(b.recordDate));
  }, [allData]);

  const previewRecord = useMemo(() => {
    if (!previewDate) return allRecords.length > 0 ? allRecords[allRecords.length - 1] : null;
    return allRecords.find(r => r.recordDate.startsWith(previewDate)) || null;
  }, [previewDate, allRecords]);

  const prevPreviewRecord = useMemo(() => {
    if (!previewRecord) return null;
    const idx = allRecords.findIndex(r => r.id === previewRecord.id);
    return idx > 0 ? allRecords[idx - 1] : null;
  }, [previewRecord, allRecords]);

  // 切换日期时从后端加载已保存的AI分析
  useEffect(() => {
    if (!previewRecord?.id) {
      setAiSections(null);
      setAiSource(null);
      setAiModel('');
      setAiError('');
      return;
    }
    let cancelled = false;
    setAiError('');
    console.log('[AI] Loading saved analysis for recordId:', previewRecord.id);
    repeatDiscountApi.getSavedAnalysis(previewRecord.id).then((res: any) => {
      if (cancelled) return;
      console.log('[AI] Raw response:', res);
      // axios 拦截器已解包一层，res 就是 { success, data }
      const data = res?.data ?? res;
      console.log('[AI] Parsed data:', data);
      if (data && data.sections) {
        console.log('[AI] Found saved analysis, sections count:', data.sections.length);
        setAiSections(data.sections);
        setAiSource(data.source);
        setAiModel(data.model || '');
      } else {
        console.log('[AI] No saved analysis found');
        setAiSections(null);
        setAiSource(null);
        setAiModel('');
      }
    }).catch((err) => {
      console.error('[AI] Error loading saved analysis:', err);
      if (!cancelled) {
        setAiSections(null);
        setAiSource(null);
        setAiModel('');
      }
    });
    return () => { cancelled = true; };
  }, [previewRecord?.id]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handlePaste = (target: 'g1' | 'g2', text: string) => {
    const parsed = parsePastedText(text);
    setForm(f => ({
      ...f,
      [target]: { ...f[target], ...parsed },
    }));
  };

  const handleSave = () => {
    if (!form.recordDate) return toastError('请选择日期');
    const payload = {
      recordDate: form.recordDate,
      g1: {
        grantAmount: parseFloat(form.g1.grantAmount) || 0,
        paymentAmount: parseFloat(form.g1.paymentAmount) || 0,
        paymentBuyers: parseInt(form.g1.paymentBuyers) || 0,
        paymentItems: parseInt(form.g1.paymentItems) || 0,
      },
      g2: {
        grantAmount: parseFloat(form.g2.grantAmount) || 0,
        paymentAmount: parseFloat(form.g2.paymentAmount) || 0,
        paymentBuyers: parseInt(form.g2.paymentBuyers) || 0,
        paymentItems: parseInt(form.g2.paymentItems) || 0,
      },
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: RecordItem) => {
    setEditingId(item.id);
    setEditForm({
      recordDate: item.recordDate.split('T')[0],
      g1: {
        grantAmount: String(item.g1.grantAmount),
        paymentAmount: String(item.g1.paymentAmount),
        paymentBuyers: String(item.g1.paymentBuyers),
        paymentItems: String(item.g1.paymentItems),
      },
      g2: {
        grantAmount: String(item.g2.grantAmount),
        paymentAmount: String(item.g2.paymentAmount),
        paymentBuyers: String(item.g2.paymentBuyers),
        paymentItems: String(item.g2.paymentItems),
      },
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editForm.recordDate) return toastError('请选择日期');
    const payload = {
      recordDate: editForm.recordDate,
      g1: {
        grantAmount: parseFloat(editForm.g1.grantAmount) || 0,
        paymentAmount: parseFloat(editForm.g1.paymentAmount) || 0,
        paymentBuyers: parseInt(editForm.g1.paymentBuyers) || 0,
        paymentItems: parseInt(editForm.g1.paymentItems) || 0,
      },
      g2: {
        grantAmount: parseFloat(editForm.g2.grantAmount) || 0,
        paymentAmount: parseFloat(editForm.g2.paymentAmount) || 0,
        paymentBuyers: parseInt(editForm.g2.paymentBuyers) || 0,
        paymentItems: parseInt(editForm.g2.paymentItems) || 0,
      },
    };
    updateMutation.mutate({ id: editingId!, data: payload });
  };

  const handleDelete = async (id: string, date: string) => {
    const ok = await confirm({ title: '确认删除', message: `确定删除 ${formatDate(date)} 的记录吗？` });
    if (ok) deleteMutation.mutate(id);
  };

  // ─── 总体AI分析（历史数据页面） ─────────────────────────────────────────

  const genOverallLocalAnalysis = (): { title: string; content: string }[] => {
    if (!summary || !allRecords.length) return [];
    const days = summary.totalDays || 1;
    const fmtR = (v: number) => v.toFixed(2);
    const avgDailyGrant = summary.totalGrantAmount / days;
    const avgDailyPay = summary.totalPaymentAmount / days;
    const avgBuyers = summary.totalPaymentBuyers / days;
    const perBuyerCost = summary.totalPaymentBuyers > 0 ? summary.totalGrantAmount / summary.totalPaymentBuyers : 0;
    const perItemPay = summary.totalPaymentItems > 0 ? summary.totalPaymentAmount / summary.totalPaymentItems : 0;

    // 趋势分析
    const firstR = allRecords[0];
    const lastR = allRecords[allRecords.length - 1];
    const firstROI = calcTotals(firstR).roi;
    const lastROI = calcTotals(lastR).roi;
    const roiTrend = firstROI > 0 ? ((lastROI - firstROI) / firstROI * 100).toFixed(1) : 'N/A';

    // 找最高/最低ROI日
    let maxROI = -Infinity, minROI = Infinity, maxDay = '', minDay = '';
    for (const r of allRecords) {
      const t = calcTotals(r);
      if (t.grant <= 0) continue;
      if (t.roi > maxROI) { maxROI = t.roi; maxDay = r.recordDate.slice(0, 10); }
      if (t.roi < minROI) { minROI = t.roi; minDay = r.recordDate.slice(0, 10); }
    }

    return [
      {
        title: '整体概况',
        content: `统计周期内共 ${days} 天数据，累计发放 ${fmt(summary.totalGrantAmount)}，累计支付 ${fmt(summary.totalPaymentAmount)}，综合 ROI ${fmtR(summary.totalROI)}。日均发放 ${fmt(avgDailyGrant)}，日均支付 ${fmt(avgDailyPay)}，日均买家 ${fmtInt(Math.round(avgBuyers))} 人。${summary.totalROI >= 3 ? '整体投放效率优秀，投入产出比高。' : summary.totalROI >= 1 ? '整体投放效率尚可，仍有优化空间。' : 'ROI 偏低，需调整投放策略。'}`
      },
      {
        title: '趋势分析',
        content: `首日 ROI ${fmtR(firstROI)} → 末日 ROI ${fmtR(lastROI)}，整体变化 ${roiTrend === 'N/A' ? '无法计算' : (parseFloat(roiTrend) >= 0 ? `提升 ${roiTrend}%` : `下降 ${Math.abs(parseFloat(roiTrend))}%`)}。最高 ROI 日为 ${maxDay}（${fmtR(maxROI)}），最低 ROI 日为 ${minDay}（${fmtR(minROI)}），日间波动幅度 ${fmtR(maxROI - minROI)}，${(maxROI - minROI) > 2 ? '波动较大，投放稳定性有待提升。' : '波动较小，投放较为稳定。'}`
      },
      {
        title: '人群效率对比',
        content: `近2年已购用户人群：累计发放 ${fmt(summary.g1GrantAmount)}，累计支付 ${fmt(summary.g1PaymentAmount)}，ROI ${fmtR(summary.g1ROI)}，买家 ${fmtInt(summary.g1PaymentBuyers)} 人。365天内有购买且60天无购买人群：累计发放 ${fmt(summary.g2GrantAmount)}，累计支付 ${fmt(summary.g2PaymentAmount)}，ROI ${fmtR(summary.g2ROI)}，买家 ${fmtInt(summary.g2PaymentBuyers)} 人。${summary.g1ROI > summary.g2ROI ? '近2年已购用户人群转化效率更高，建议加大该人群投放预算。' : summary.g2ROI > summary.g1ROI ? '沉睡用户唤醒效果更佳，值得深入挖掘该人群潜力。' : '两个人群效率接近，建议A/B测试寻找更优策略。'}`
      },
      {
        title: '成本效率分析',
        content: `人均获取成本 ${fmt(perBuyerCost)}，件均支付金额 ${fmt(perItemPay)}。${perBuyerCost < 10 ? '单客获取成本较低，效率可观。' : perBuyerCost < 30 ? '单客成本处于中等水平。' : '单客成本偏高，建议优化优惠策略。'}日均支付买家 ${fmtInt(Math.round(avgBuyers))} 人，${avgBuyers > 30 ? '人群覆盖面广。' : '人群覆盖面有限，可考虑扩展人群范围。'}`
      },
      {
        title: '策略优化建议',
        content: summary.totalROI < 2
          ? `建议：1) 缩小发放范围至高价值用户，集中预算；2) 降低优惠力度或设置满减门槛；3) 重点投入 ROI 更高的人群（${summary.g1ROI > summary.g2ROI ? '近2年已购用户人群' : '365天内有购买且60天无购买人群'}）；4) 关注最低 ROI 日 ${minDay} 的数据异常原因。`
          : `建议：1) 维持当前投放策略，ROI 表现良好；2) 可适当扩展人群覆盖以获取更多用户；3) 持续监控 ROI 趋势，防止下滑；4) 在最高 ROI 日 ${maxDay} 的基础上总结成功经验并复制。`
      },
      {
        title: '风险预警',
        content: `${summary.totalROI < 1 ? '⚠ 累计 ROI 低于 1，存在亏损风险，需立即调整策略。' : ''}${summary.g2ROI < 1 && summary.g2GrantAmount > 0 ? '⚠ 365天内有购买且60天无购买人群 ROI 偏低，该人群可能已流失，建议降低投放。' : ''}${(maxROI - minROI) > 3 ? '⚠ 日间 ROI 波动较大，投放稳定性不足。' : ''}关注竞品动态及平台规则变化对活动效果的持续影响，建议建立日报监控机制。`
      },
    ];
  };

  const handleOverallAiAnalysis = async () => {
    setOverallAiLoading(true);
    setOverallAiError('');
    try {
      const result = await repeatDiscountApi.aiAnalysisOverall(
        startDate || undefined,
        endDate || undefined,
      ) as any;
      if (result.success) {
        setOverallAiSections(result.data.sections);
        setOverallAiSource('ai');
        setOverallAiModel(result.data.model || '');
      } else {
        setOverallAiError(result.message || 'AI总分析失败，使用本地规则引擎生成');
        setOverallAiSections(genOverallLocalAnalysis());
        setOverallAiSource('local');
        setOverallAiModel('');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'AI总分析请求失败';
      setOverallAiError(msg + '（已降级为本地规则引擎）');
      setOverallAiSections(genOverallLocalAnalysis());
      setOverallAiSource('local');
      setOverallAiModel('');
    } finally {
      setOverallAiLoading(false);
    }
  };

  // ─── Chart Data ──────────────────────────────────────────────────────────

  const chartLabels = useMemo(() => allRecords.map(r => r.recordDate.slice(5)), [allRecords]);

  const barChartData: any = useMemo(() => ({
    labels: chartLabels,
    datasets: [
      {
        label: '合计发放',
        data: allRecords.map(r => calcTotals(r).grant),
        backgroundColor: 'rgba(239,68,68,0.7)',
        borderColor: 'rgba(239,68,68,1)',
        borderRadius: 6,
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      } as any,
      {
        label: '合计支付',
        data: allRecords.map(r => calcTotals(r).pay),
        backgroundColor: 'rgba(34,197,94,0.7)',
        borderColor: 'rgba(34,197,94,1)',
        borderRadius: 6,
        borderWidth: 1,
        yAxisID: 'y',
        order: 3,
      } as any,
      {
        label: '合计ROI',
        data: allRecords.map(r => calcTotals(r).roi),
        type: 'line' as const,
        borderColor: 'rgba(249,115,22,1)',
        backgroundColor: 'rgba(249,115,22,0.1)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: 'rgba(249,115,22,1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        tension: 0.35,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  }), [chartLabels, allRecords]);

  const barChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { usePointStyle: true, pointStyle: 'circle' as const, padding: 16, font: { size: 12 } },
      },
      tooltip: {
        mode: 'index' as const,
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, weight: 600 as const },
        bodyFont: { size: 12 },
      },
    },
    scales: {
      y: { type: 'linear' as const, position: 'left' as const, title: { display: true, text: '金额（元）', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
      y1: { type: 'linear' as const, position: 'right' as const, title: { display: true, text: 'ROI', font: { size: 11 } }, grid: { drawOnChartArea: false } },
    },
  }), []);

  const lineChartData = useMemo(() => ({
    labels: chartLabels,
    datasets: [
      { label: '已购用户ROI', data: allRecords.map(r => r.g1.grantAmount > 0 ? r.g1.paymentAmount / r.g1.grantAmount : 0), borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: 'rgba(59,130,246,1)', pointBorderColor: '#fff', pointBorderWidth: 1.5, tension: 0.35 },
      { label: '沉睡用户ROI', data: allRecords.map(r => r.g2.grantAmount > 0 ? r.g2.paymentAmount / r.g2.grantAmount : 0), borderColor: 'rgba(249,115,22,1)', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: 'rgba(249,115,22,1)', pointBorderColor: '#fff', pointBorderWidth: 1.5, tension: 0.35 },
      { label: '合计ROI', data: allRecords.map(r => calcTotals(r).roi), borderColor: 'rgba(239,68,68,1)', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2.5, borderDash: [6, 3], pointRadius: 4, pointBackgroundColor: 'rgba(239,68,68,1)', pointBorderColor: '#fff', pointBorderWidth: 1.5, tension: 0.35 },
    ],
  }), [chartLabels, allRecords]);

  const lineChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, pointStyle: 'circle' as const, padding: 16, font: { size: 12 } } },
      tooltip: { mode: 'index' as const, backgroundColor: 'rgba(0,0,0,0.8)', padding: 12, cornerRadius: 8, titleFont: { size: 13, weight: 600 as const }, bodyFont: { size: 12 } },
    },
    scales: { y: { title: { display: true, text: 'ROI', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } } },
  }), []);

  // ─── Group Input Card (reusable) ─────────────────────────────────────────

  const GroupInputCard = ({
    label, sublabel, data, onChange, pasteText, onPasteText, onPaste, accent, target,
  }: {
    label: string; sublabel: string; data: GroupData;
    onChange: (field: keyof GroupData, val: string) => void;
    pasteText: string; onPasteText: (t: string) => void; onPaste: () => void;
    accent: 'blue' | 'orange'; target: 'g1' | 'g2';
  }) => {
    const roi = calcRoi(parseFloat(data.grantAmount) || 0, parseFloat(data.paymentAmount) || 0);
    const accentRing = accent === 'blue' ? 'from-blue-500/20 to-blue-500/5' : 'from-orange-500/20 to-orange-500/5';
    const accentText = accent === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400';
    const accentDot = accent === 'blue' ? 'bg-blue-500' : 'bg-orange-500';
    return (
      <div className={`glass-card rounded-2xl p-6 flex-1 min-w-[300px] animate-fade-up bg-gradient-to-br ${accentRing} card-hover`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${accentDot} ring-2 ring-offset-2 ring-offset-transparent`} style={{ '--tw-ring-color': accent === 'blue' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)' } as React.CSSProperties} />
          <div>
            <h4 className="text-base font-bold text-foreground">{label}</h4>
            <p className="text-xs text-muted-foreground">{sublabel}</p>
          </div>
        </div>
        {/* Paste area */}
        <div className="mb-5">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
            <Clipboard className="h-3 w-3" /> 粘贴生意参谋数据
          </label>
          <textarea
            value={pasteText}
            onChange={e => onPasteText(e.target.value)}
            onBlur={onPaste}
            onPaste={e => {
              // 粘贴后立即解析，直接使用剪贴板数据
              const text = e.clipboardData?.getData('text') || '';
              if (text) {
                onPasteText(text);
                const parsed = parsePastedText(text);
                if (Object.keys(parsed).length > 0) {
                  // 直接更新表单，不等 state
                  setForm(f => ({
                    ...f,
                    [target]: { ...f[target], ...parsed },
                  }));
                }
              }
            }}
            placeholder="粘贴数据后自动解析..."
            className="w-full h-20 rounded-xl border border-dashed border-input bg-muted/20 px-3 py-2.5 text-xs resize-none premium-input placeholder:text-muted-foreground/60"
          />
        </div>
        {/* Input fields */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { field: 'grantAmount', label: '发放金额（元）', step: '0.01', ph: '0.00' },
            { field: 'paymentAmount', label: '支付金额（元）', step: '0.01', ph: '0.00' },
            { field: 'paymentBuyers', label: '支付买家数（人）', step: '1', ph: '0' },
            { field: 'paymentItems', label: '支付件数（件）', step: '1', ph: '0' },
          ] as const).map(({ field, label: lbl, step, ph }) => (
            <div key={field}>
              <label className="text-xs font-medium text-muted-foreground">{lbl}</label>
              <input type="number" step={step} value={data[field]} onChange={e => onChange(field, e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" placeholder={ph} />
            </div>
          ))}
        </div>
        {/* ROI display */}
        <div className="mt-5 rounded-xl bg-muted/40 px-4 py-3 flex items-center justify-between border border-border/50">
          <span className="text-xs font-medium text-muted-foreground">实时 ROI</span>
          <span className={`text-xl font-bold tabular-nums ${roi >= 3 ? 'text-green-600 dark:text-green-400' : roi >= 1 ? accentText : 'text-red-600 dark:text-red-400'}`}>
            {roi > 0 ? roi.toFixed(2) : '-'}
          </span>
        </div>
      </div>
    );
  };

  // ─── Tab: Entry ──────────────────────────────────────────────────────────

  const renderEntryTab = () => (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center gap-3 animate-fade-up">
        <div className="flex items-center gap-2.5">
          <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400">
            <Calendar className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          </div>
          <label className="text-sm font-semibold">登记日期</label>
        </div>
        <input type="date" value={form.recordDate}
          onChange={e => setForm(f => ({ ...f, recordDate: e.target.value }))}
          className="rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm premium-input" />
      </div>

      {/* Two group cards */}
      <div className="flex flex-col lg:flex-row gap-5">
        <GroupInputCard
          label="近2年已购用户人群"
          sublabel="近2年内有过购买行为的用户人群"
          data={form.g1}
          accent="blue"
          target="g1"
          onChange={(field, val) => setForm(f => ({ ...f, g1: { ...f.g1, [field]: val } }))}
          pasteText={pasteText1}
          onPasteText={setPasteText1}
          onPaste={() => handlePaste('g1', pasteText1)}
        />
        <GroupInputCard
          label="365天内有购买且60天无购买人群"
          sublabel="365天内有购买且60天无购买的用户人群"
          data={form.g2}
          accent="orange"
          target="g2"
          onChange={(field, val) => setForm(f => ({ ...f, g2: { ...f.g2, [field]: val } }))}
          pasteText={pasteText2}
          onPasteText={setPasteText2}
          onPaste={() => handlePaste('g2', pasteText2)}
        />
      </div>

      {/* Summary row */}
      <div className="glass-card rounded-2xl p-5 animate-fade-up flex items-center gap-8 flex-wrap" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计发放</div>
          <span className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{fmt((parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0))}</span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计支付</div>
          <span className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt((parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0))}</span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计ROI</div>
          {(() => {
            const tg = (parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0);
            const tp = (parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0);
            const roi = tg > 0 ? tp / tg : 0;
            return <span className={`text-lg font-bold tabular-nums ${roi >= 3 ? 'text-green-600 dark:text-green-400' : roi >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{tg > 0 ? roi.toFixed(2) : '-'}</span>;
          })()}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: '150ms' }}>
        <button onClick={handleSave}
          disabled={createMutation.isPending || updateMutation.isPending}
          className="magnetic-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed">
          {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editingId ? '保存修改' : '保存登记'}
        </button>
        <button onClick={() => { setForm(emptyForm); setPasteText1(''); setPasteText2(''); setEditingId(null); }}
          className="magnetic-btn inline-flex items-center gap-2 rounded-xl border border-border bg-background/50 px-5 py-3 text-sm font-medium hover:bg-accent">
          <X className="h-4 w-4" /> 清空
        </button>
      </div>
    </div>
  );

  // ─── Tab: History ────────────────────────────────────────────────────────

  const renderHistoryTab = () => {
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
              className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">结束日期</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" />
          </div>
          {/* 快捷筛选按钮 */}
          <div className="flex gap-1.5 ml-1">
            {[
              { label: '近7天', days: 7 },
              { label: '近14天', days: 14 },
              { label: '近30天', days: 30 },
            ].map(q => (
              <button key={q.days} onClick={() => setQuickRange(q.days)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border/60 bg-background/40 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all magnetic-btn">
                {q.label}
              </button>
            ))}
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
              className="text-sm text-muted-foreground hover:text-foreground magnetic-btn rounded-lg px-2 py-1">清除筛选</button>
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
              className={`magnetic-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ${
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
                            <button onClick={() => handleEdit(item)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground magnetic-btn" title="编辑">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item.id, item.recordDate)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive magnetic-btn" title="删除">
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
                className="magnetic-btn px-4 py-2 rounded-xl border text-sm disabled:opacity-40 hover:bg-accent">上一页</button>
              <span className="text-sm text-muted-foreground font-medium">第 {page} / {totalPages} 页</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="magnetic-btn px-4 py-2 rounded-xl border text-sm disabled:opacity-40 hover:bg-accent">下一页</button>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-up" onClick={() => setShowEditModal(false)}>
            <div className="glass-card rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400"><Pencil className="h-4 w-4" /></div>
                  <h3 className="text-lg font-bold">编辑记录</h3>
                </div>
                <button onClick={() => setShowEditModal(false)} className="p-2 rounded-lg hover:bg-accent magnetic-btn"><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-5">
                <label className="text-sm font-medium">日期</label>
                <input type="date" value={editForm.recordDate}
                  onChange={e => setEditForm(f => ({ ...f, recordDate: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm premium-input" />
              </div>
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />近2年已购用户人群</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g1.grantAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g1.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g1.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g1.paymentItems} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" />365天内有购买且60天无购买人群</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g2.grantAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g2.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g2.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                    <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g2.paymentItems} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" /></div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={handleSaveEdit} disabled={updateMutation.isPending}
                  className="magnetic-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/25 disabled:opacity-50">
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存修改
                </button>
                <button onClick={() => setShowEditModal(false)} className="magnetic-btn inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-accent">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab: Chart ──────────────────────────────────────────────────────────

  // 图表日期筛选
  const [chartStartDate, setChartStartDate] = useState('');
  const [chartEndDate, setChartEndDate] = useState('');

  const filteredChartRecords = useMemo(() => {
    return allRecords.filter(r => {
      const d = r.recordDate.slice(0, 10);
      if (chartStartDate && d < chartStartDate) return false;
      if (chartEndDate && d > chartEndDate) return false;
      return true;
    });
  }, [allRecords, chartStartDate, chartEndDate]);

  const renderChartTab = () => (
    <div className="space-y-6">
      {allRecords.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground glass-card rounded-2xl">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无数据，请先在「登记数据」页面录入</p>
        </div>
      ) : (
        <>
          {/* 图表日期筛选 */}
          <div className="flex items-center gap-3 flex-wrap animate-fade-up">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">起始</label>
              <input type="date" value={chartStartDate} onChange={e => setChartStartDate(e.target.value)}
                className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">结束</label>
              <input type="date" value={chartEndDate} onChange={e => setChartEndDate(e.target.value)}
                className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm premium-input" />
            </div>
            <div className="flex gap-1.5 ml-1">
              {[
                { label: '近7天', days: 7 },
                { label: '近14天', days: 14 },
                { label: '近30天', days: 30 },
                { label: '全部', days: 0 },
              ].map(q => (
                <button key={q.label} onClick={() => {
                  if (q.days === 0) { setChartStartDate(''); setChartEndDate(''); }
                  else {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - q.days + 1);
                    setChartStartDate(start.toISOString().slice(0, 10));
                    setChartEndDate(end.toISOString().slice(0, 10));
                  }
                }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border/60 bg-background/40 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all magnetic-btn">
                  {q.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredChartRecords.length} 条数据</span>
          </div>

          <div className="glass-card rounded-2xl p-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400"><BarChart3 className="h-4 w-4" /></div>
              <h3 className="text-base font-bold">发放/支付金额 & 合计ROI趋势</h3>
            </div>
            <div style={{ height: 400 }}>
              <Bar data={{
                labels: filteredChartRecords.map(r => r.recordDate.slice(5)),
                datasets: [
                  { ...barChartData.datasets[0], data: filteredChartRecords.map(r => calcTotals(r).grant) },
                  { ...barChartData.datasets[1], data: filteredChartRecords.map(r => calcTotals(r).pay) },
                  { ...barChartData.datasets[2], data: filteredChartRecords.map(r => calcTotals(r).roi) },
                ],
              }} options={barChartOptions} />
            </div>
          </div>
          <div className="glass-card rounded-2xl p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-badge bg-orange-500/15 text-orange-600 dark:text-orange-400"><TrendingUp className="h-4 w-4" /></div>
              <h3 className="text-base font-bold">分人群ROI趋势对比</h3>
            </div>
            <div style={{ height: 400 }}>
              <Line data={{
                labels: filteredChartRecords.map(r => r.recordDate.slice(5)),
                datasets: [
                  { ...lineChartData.datasets[0], data: filteredChartRecords.map(r => r.g1.grantAmount > 0 ? r.g1.paymentAmount / r.g1.grantAmount : 0) },
                  { ...lineChartData.datasets[1], data: filteredChartRecords.map(r => r.g2.grantAmount > 0 ? r.g2.paymentAmount / r.g2.grantAmount : 0) },
                  { ...lineChartData.datasets[2], data: filteredChartRecords.map(r => calcTotals(r).roi) },
                ],
              }} options={lineChartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ─── Tab: Preview ────────────────────────────────────────────────────────────

  const renderPreviewTab = () => {
    const rec = previewRecord;
    const prev = prevPreviewRecord;
    const shopName = '店铺名';

    const fmtR = (v: number) => v.toFixed(2);

    const genInsights = () => {
      if (!rec) return ['暂无数据，无法生成洞察'];
      const insights: string[] = [];
      const t = calcTotals(rec);
      const g1R = rec.g1.grantAmount > 0 ? rec.g1.paymentAmount / rec.g1.grantAmount : 0;
      const g2R = rec.g2.grantAmount > 0 ? rec.g2.paymentAmount / rec.g2.grantAmount : 0;
      const totalBuyers = rec.g1.paymentBuyers + rec.g2.paymentBuyers;
      const perBuyerCost = totalBuyers > 0 ? t.grant / totalBuyers : 0;

      // ROI 洞察
      if (t.roi >= 5) insights.push(`综合ROI ${fmtR(t.roi)} 表现优秀，每投入1元可带来${fmtR(t.roi)}元回报`);
      else if (t.roi >= 2) insights.push(`综合ROI ${fmtR(t.roi)} 处于良好水平，投放效率健康`);
      else if (t.roi >= 1) insights.push(`综合ROI ${fmtR(t.roi)} 接近盈亏线，利润空间有限需关注`);
      else if (t.roi > 0) insights.push(`⚠️ 综合ROI ${fmtR(t.roi)} 已低于盈亏平衡点，当日投放亏损`);

      // 人群对比洞察
      const roiDiff = Math.abs(g1R - g2R);
      if (roiDiff > 1) {
        const winner = g1R > g2R ? '已购人群' : '沉睡人群';
        const loser = g1R > g2R ? '沉睡人群' : '已购人群';
        insights.push(`${winner}ROI（${fmtR(Math.max(g1R, g2R))}）远超${loser}（${fmtR(Math.min(g1R, g2R))}），差距达${roiDiff.toFixed(2)}，建议调整预算分配`);
      } else if (roiDiff > 0.3) {
        const winner = g1R > g2R ? '已购人群' : '沉睡人群';
        insights.push(`${winner}效率略优（${fmtR(Math.max(g1R, g2R))} vs ${fmtR(Math.min(g1R, g2R))}），但差距不大，可继续观察`);
      }

      // 成本洞察
      if (perBuyerCost > 0 && perBuyerCost < 5) insights.push(`单客获取成本仅${fmt(perBuyerCost)}元，获客效率极高`);
      else if (perBuyerCost > 20) insights.push(`单客获取成本${fmt(perBuyerCost)}元偏高，建议优化优惠策略控制成本`);

      // 规模洞察
      if (totalBuyers >= 50) insights.push(`${totalBuyers}位买家参与，人群覆盖面广，数据可信度高`);
      else if (totalBuyers < 10) insights.push(`仅${totalBuyers}位买家，样本量较小，建议连续观察多日再做决策`);

      return insights.length > 0 ? insights : ['数据表现平稳，建议持续观察趋势变化'];
    };

    const genAiAnalysis = () => {
      if (!rec) return null;
      const t = calcTotals(rec);
      const g1R = rec.g1.grantAmount > 0 ? rec.g1.paymentAmount / rec.g1.grantAmount : 0;
      const g2R = rec.g2.grantAmount > 0 ? rec.g2.paymentAmount / rec.g2.grantAmount : 0;
      const totalBuyers = rec.g1.paymentBuyers + rec.g2.paymentBuyers;
      const totalItems = rec.g1.paymentItems + rec.g2.paymentItems;
      const perBuyerCost = totalBuyers > 0 ? t.grant / totalBuyers : 0;
      const perItemPay = totalItems > 0 ? t.pay / totalItems : 0;
      const grantPayRatio = t.grant > 0 ? t.pay / t.grant : 0;

      // 综合评估 - 多维度判断
      let overall = '';
      if (t.roi >= 5 && totalBuyers >= 20) {
        overall = `当日投放效果出色：综合ROI ${fmtR(t.roi)}，投入${fmt(t.grant)}撬动${fmt(t.pay)}支付，且${totalBuyers}位买家的转化规模也相当可观。建议维持当前策略并考虑小幅扩量。`;
      } else if (t.roi >= 3 && totalBuyers < 10) {
        overall = `ROI ${fmtR(t.roi)}看似不错，但仅有${totalBuyers}位买家，样本量过小可能导致ROI虚高。建议观察2-3天确认数据稳定性后再做决策。`;
      } else if (t.roi >= 2) {
        overall = `综合ROI ${fmtR(t.roi)}处于良好区间，投入产出比健康。发放${fmt(t.grant)}带来${fmt(t.pay)}支付，${totalBuyers}位买家参与，整体运转正常。`;
      } else if (t.roi >= 1) {
        overall = `综合ROI ${fmtR(t.roi)}刚刚跨过盈亏线，虽未亏损但利润空间极薄。当前发放力度${fmt(t.grant)}对应的回报效率需要警惕。`;
      } else if (t.roi > 0) {
        overall = `⚠️ 综合ROI仅${fmtR(t.roi)}，已低于盈亏平衡点，当日投放处于亏损状态。需要立即审视优惠券策略。`;
      } else {
        overall = `当日无有效投放数据。`;
      }

      // 人群效率 - 深度对比
      let crowd = '';
      const roiDiff = Math.abs(g1R - g2R);
      const buyerDiff = rec.g1.paymentBuyers - rec.g2.paymentBuyers;
      if (g1R > g2R && roiDiff > 0.5) {
        crowd = `已购人群ROI（${fmtR(g1R)}）显著高于沉睡人群（${fmtR(g2R)}），差距${roiDiff.toFixed(2)}。已购人群带来${rec.g1.paymentBuyers}位买家，沉睡人群${rec.g2.paymentBuyers}位。老客复购意愿更强，建议将预算向已购人群倾斜。`;
      } else if (g2R > g1R && roiDiff > 0.5) {
        crowd = `沉睡人群ROI（${fmtR(g2R)}）反超已购人群（${fmtR(g1R)}），差距${roiDiff.toFixed(2)}。沉睡人群带来${rec.g2.paymentBuyers}位买家，说明召回策略有效。建议适当增加沉睡人群的优惠券发放量。`;
      } else if (roiDiff <= 0.5 && roiDiff > 0) {
        crowd = `两个人群ROI接近（${fmtR(g1R)} vs ${fmtR(g2R)}），效率差异不大。已购人群${rec.g1.paymentBuyers}位买家，沉睡人群${rec.g2.paymentBuyers}位，可考虑A/B测试不同面额优惠券寻找更优解。`;
      } else {
        crowd = `两个人群ROI均为${fmtR(g1R)}，表现一致。已购人群${rec.g1.paymentBuyers}位买家，沉睡人群${rec.g2.paymentBuyers}位。`;
      }

      // 趋势分析 - 有逻辑判断
      let trend = '';
      if (prev) {
        const pt = calcTotals(prev);
        const roiDelta = t.roi - pt.roi;
        const payDelta = t.pay - pt.pay;
        const buyerDelta = totalBuyers - (prev.g1.paymentBuyers + prev.g2.paymentBuyers);
        const roiPct = pt.roi > 0 ? (roiDelta / pt.roi * 100) : 0;
        const payPct = pt.pay > 0 ? (payDelta / pt.pay * 100) : 0;

        if (Math.abs(roiPct) < 5 && Math.abs(payPct) < 10) {
          trend = `与前日相比变化不大（ROI ${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(1)}%，支付 ${payPct >= 0 ? '+' : ''}${payPct.toFixed(1)}%），数据平稳，属于正常波动范围。`;
        } else if (roiDelta > 0 && payDelta > 0) {
          trend = `多项指标同步向好：ROI ${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(1)}%，支付金额 ${payPct >= 0 ? '+' : ''}${payPct.toFixed(1)}%，买家数${buyerDelta >= 0 ? '+' : ''}${buyerDelta}人。投放效率在提升，建议保持当前节奏。`;
        } else if (roiDelta < 0 && payDelta > 0) {
          trend = `支付金额增长${payPct.toFixed(1)}%但ROI下降${Math.abs(roiPct).toFixed(1)}%，说明发放增速快于支付增速。需关注是否优惠券发放过于激进。`;
        } else if (roiDelta > 0 && payDelta < 0) {
          trend = `支付金额下降${Math.abs(payPct).toFixed(1)}%但ROI反而提升${roiPct.toFixed(1)}%，说明发放收缩幅度更大。效率改善但规模在缩小，需权衡。`;
        } else {
          trend = `⚠️ 多项指标同步下滑：ROI ${roiPct.toFixed(1)}%，支付 ${payPct.toFixed(1)}%，买家数${buyerDelta}人。活动效果明显衰减，需要关注。`;
        }
      } else {
        trend = '首次记录，暂无历史数据可比。建议连续记录3天以上再做趋势判断。';
      }

      // 成本效率 - 有行业基准
      let cost = '';
      if (perBuyerCost > 0) {
        if (perBuyerCost < 5) {
          cost = `单客获取成本仅${fmt(perBuyerCost)}元，远低于行业常见水平（5-15元），获客效率极高。件均支付${fmt(perItemPay)}元，性价比突出。`;
        } else if (perBuyerCost < 15) {
          cost = `单客获取成本${fmt(perBuyerCost)}元，处于行业正常区间（5-15元）。件均支付${fmt(perItemPay)}元，整体成本可控。`;
        } else if (perBuyerCost < 30) {
          cost = `单客获取成本${fmt(perBuyerCost)}元，偏高于行业水平。件均支付${fmt(perItemPay)}元，需要评估是否值得为这些用户付出更高成本。`;
        } else {
          cost = `⚠️ 单客获取成本高达${fmt(perBuyerCost)}元，远超行业基准。件均支付${fmt(perItemPay)}元，获客成本压力较大，建议收紧优惠力度。`;
        }
      } else {
        cost = '无有效买家数据，无法计算成本指标。';
      }

      // 策略建议 - 具体可执行
      let strategy = '';
      if (t.roi < 1) {
        strategy = `当前处于亏损，建议：① 立即将优惠券面额降低20-30%；② 收窄人群范围，仅投放近90天内有购买的高活跃用户；③ 设置满减门槛（如满50减5）提升客单价。`;
      } else if (t.roi < 2) {
        strategy = `ROI偏低，建议：① 将沉睡人群的预算占比从当前的${t.grant > 0 ? ((rec.g2.grantAmount / t.grant) * 100).toFixed(0) : 50}%降低到30%以下；② 重点维护ROI更高的已购人群；③ 观察3天趋势后再决定是否调整优惠力度。`;
      } else if (t.roi < 5) {
        strategy = `投放效率良好，建议：① 维持当前策略不变；② 可尝试小幅扩展人群覆盖（+10-15%）；③ 测试不同优惠券面额找到效率与规模的最优平衡点。`;
      } else {
        strategy = `效率优秀，建议：① 适当放量，将日发放预算提升20-30%；② 同步监控ROI变化，确保放量后效率不会大幅下滑；③ 总结当前成功经验，形成标准投放SOP。`;
      }

      // 风险提示 - 有预警级别
      let risk = '';
      const risks: string[] = [];
      if (t.roi < 1) risks.push(`🔴 ROI ${fmtR(t.roi)} 低于盈亏线，当日亏损`);
      if (g2R < 0.5) risks.push(`🟡 沉睡人群ROI仅${fmtR(g2R)}，该人群可能已深度流失`);
      if (totalBuyers < 5) risks.push(`🟡 买家数仅${totalBuyers}人，样本过小，数据可信度低`);
      if (prev) {
        const pt = calcTotals(prev);
        const roiDrop = pt.roi > 0 ? ((t.roi - pt.roi) / pt.roi * 100) : 0;
        if (roiDrop < -30) risks.push(`🔴 ROI单日暴跌${Math.abs(roiDrop).toFixed(0)}%，需紧急排查原因`);
      }
      risk = risks.length > 0 ? risks.join('；') + '。' : '当前数据未发现明显风险信号，各项指标运转正常。';

      return [
        { title: '综合评估', content: overall },
        { title: '人群效率分析', content: crowd },
        { title: '趋势分析', content: trend },
        { title: '成本效率', content: cost },
        { title: '策略建议', content: strategy },
        { title: '风险提示', content: risk },
      ];
    };

    const handleAiAnalysis = async () => {
      if (!rec) return;
      setAiLoading(true);
      setAiError('');
      try {
        const result = await repeatDiscountApi.aiAnalysis(rec.id) as any;
        if (result.success) {
          setAiSections(result.data.sections);
          setAiSource('ai');
          setAiModel(result.data.model || '');
        } else {
          setAiError(result.message || 'AI分析失败，使用本地规则引擎生成');
          // 降级：使用本地规则引擎
          setAiSections(genAiAnalysis());
          setAiSource('local');
          setAiModel('');
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err.message || 'AI分析请求失败';
        setAiError(msg + '（已降级为本地规则引擎）');
        // 降级：使用本地规则引擎
        setAiSections(genAiAnalysis());
        setAiSource('local');
        setAiModel('');
      } finally {
        setAiLoading(false);
      }
    };

    const downloadHtml = () => {
      const el = document.getElementById('preview-report');
      if (!el) return;
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>日报 - ${rec?.recordDate || ''}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#333}.report{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}.header{background:linear-gradient(135deg,#dc2626,#ea580c,#f59e0b);color:#fff;padding:36px}.header h1{margin:0;font-size:26px;font-weight:800}.header p{margin:6px 0 0;opacity:.9;font-size:14px}.section{padding:24px;border-bottom:1px solid #eee}.section h2{font-size:17px;color:#dc2626;margin:0 0 14px;font-weight:700}.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.kpi{background:#f9fafb;border-radius:10px;padding:14px}.kpi .label{font-size:12px;color:#666}.kpi .value{font-size:22px;font-weight:700;margin-top:4px}.kpi .value.red{color:#dc2626}.kpi .value.green{color:#16a34a}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{padding:10px 14px;border:1px solid #e5e7eb;text-align:right}.table th{background:#f9fafb;font-weight:600;text-align:center}.insight{background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;font-size:13px}.ai-section{margin:14px 0}.ai-section h3{font-size:15px;color:#1e40af;margin:0 0 8px;font-weight:600}.ai-section p{font-size:13px;color:#555;margin:0;line-height:1.7}</style></head><body><div class="report">${el.innerHTML}</div></body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `回头客立减日报_${rec?.recordDate?.slice(0, 10) || '未知'}.html`;
      a.click(); URL.revokeObjectURL(url);
    };

    return (
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap animate-fade-up">
          <div className="flex items-center gap-2.5">
            <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400"><FileText className="h-4 w-4" /></div>
            <label className="text-sm font-semibold">选择日期</label>
          </div>
          <div className="relative">
            <select value={previewDate} onChange={e => setPreviewDate(e.target.value)}
              className="rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm pr-10 appearance-none premium-input cursor-pointer">
              {allRecords.length === 0 && <option value="">暂无数据</option>}
              {allRecords.slice().reverse().map(r => (
                <option key={r.id} value={r.recordDate.slice(0, 10)}>{r.recordDate.slice(0, 10)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
          </div>
          <button onClick={downloadHtml} disabled={!rec}
            className="magnetic-btn inline-flex items-center gap-2 rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
            <Download className="h-4 w-4" />下载HTML
          </button>
          <button onClick={handleAiAnalysis} disabled={!rec || aiLoading}
            className={`magnetic-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ${
              aiSource === 'ai'
                ? 'bg-gradient-to-r from-green-600 to-emerald-500 shadow-green-500/25 hover:shadow-green-500/40'
                : aiSource === 'local'
                ? 'bg-gradient-to-r from-slate-600 to-slate-500 shadow-slate-500/25 hover:shadow-slate-500/40'
                : 'bg-gradient-to-r from-purple-600 to-blue-500 shadow-purple-500/25 hover:shadow-purple-500/40'
            }`}>
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : aiSource === 'ai' ? <Sparkles className="h-4 w-4" /> : aiSource === 'local' ? <Cpu className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? 'AI分析中...' : aiSource === 'ai' ? '重新分析' : aiSource === 'local' ? '重试AI分析' : 'AI智能分析'}
          </button>
          {aiError && <span className="text-sm text-destructive">{aiError}</span>}
        </div>

        {!rec ? (
          <div className="text-center py-24 text-muted-foreground glass-card rounded-2xl">暂无数据</div>
        ) : (() => {
          const t = calcTotals(rec);
          const pt = prev ? calcTotals(prev) : { grant: 0, pay: 0, roi: 0 };
          const sections = aiSections || genAiAnalysis();
          const currentSource = aiSource || (aiSections ? 'ai' : 'local');
          return (
            <div id="preview-report" className="glass-card rounded-2xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: '100ms' }}>
              {/* Header */}
              <div className="report-gradient text-white px-8 py-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
                <div className="relative">
                  <h1 className="text-2xl font-extrabold tracking-tight">{shopName} · 回头客立减日报</h1>
                  <p className="text-sm opacity-90 mt-1.5">{rec.recordDate.slice(0, 10)}</p>
                </div>
              </div>

              {/* 活动信息 */}
              <div className="px-8 py-6 border-b border-border/50">
                <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-4">活动信息</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  {[
                    { label: '活动类型', value: '回头客立减' },
                    { label: '记录日期', value: rec.recordDate.slice(0, 10) },
                    { label: '覆盖人群', value: '2组' },
                    { label: '数据来源', value: '生意参谋' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/30 rounded-xl p-3.5">
                      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                      <div className="font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 分人群效果 */}
              <div className="px-8 py-6 border-b border-border/50">
                <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-4">分人群效果</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { label: '近2年已购用户人群', g: rec.g1, pg: prev?.g1, color: 'blue' },
                    { label: '365天内有购买且60天无购买人群', g: rec.g2, pg: prev?.g2, color: 'orange' },
                  ].map(({ label, g, pg, color }) => {
                    const r = g.grantAmount > 0 ? g.paymentAmount / g.grantAmount : 0;
                    const pr = pg && pg.grantAmount > 0 ? pg.paymentAmount / pg.grantAmount : undefined;
                    return (
                      <div key={label} className="bg-muted/20 rounded-2xl p-5 border border-border/40">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${color === 'blue' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          <h3 className="text-sm font-bold">{label}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="kpi bg-red-500/5 dark:bg-red-500/10 rounded-xl p-3">
                            <div className="label text-xs text-muted-foreground">发放金额</div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="value text-lg font-bold text-red-600 dark:text-red-400">{fmt(g.grantAmount)}元</div>
                              {pg && <TrendArrow current={g.grantAmount} previous={pg.grantAmount} />}
                            </div>
                          </div>
                          <div className="kpi bg-green-500/5 dark:bg-green-500/10 rounded-xl p-3">
                            <div className="label text-xs text-muted-foreground">支付金额</div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="value text-lg font-bold text-green-600 dark:text-green-400">{fmt(g.paymentAmount)}元</div>
                              {pg && <TrendArrow current={g.paymentAmount} previous={pg.paymentAmount} />}
                            </div>
                          </div>
                          <div className="kpi bg-muted/30 rounded-xl p-3">
                            <div className="label text-xs text-muted-foreground">支付买家数</div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="value text-lg font-bold">{fmtInt(g.paymentBuyers)}人</div>
                              {pg && <TrendArrow current={g.paymentBuyers} previous={pg.paymentBuyers} />}
                            </div>
                          </div>
                          <div className="kpi bg-muted/30 rounded-xl p-3">
                            <div className="label text-xs text-muted-foreground">支付件数</div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="value text-lg font-bold">{fmtInt(g.paymentItems)}件</div>
                              {pg && <TrendArrow current={g.paymentItems} previous={pg.paymentItems} />}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-center">
                          <div className="text-xs text-muted-foreground">ROI</div>
                          <div className={`text-xl font-bold ${r >= 3 ? 'text-green-600 dark:text-green-400' : r >= 1 ? '' : 'text-red-600 dark:text-red-400'}`}>{fmtR(r)}</div>
                          <div className="mt-0.5"><TrendArrow current={r} previous={pr} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 汇总对比 */}
              <div className="px-8 py-6 border-b border-border/50">
                <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-4">汇总对比</h2>
                <table className="table w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">人群</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">发放金额 (元)</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">支付金额 (元)</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">支付买家数 (人)</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">支付件数 (件)</th>
                      <th className="text-center px-4 py-3 font-semibold text-red-600 dark:text-red-400">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '近2年已购用户人群', cur: rec.g1, prev: prev?.g1, roi: rec.g1.grantAmount > 0 ? rec.g1.paymentAmount / rec.g1.grantAmount : 0, pRoi: prev?.g1 && prev.g1.grantAmount > 0 ? prev.g1.paymentAmount / prev.g1.grantAmount : undefined },
                      { label: '365天内有购买且60天无购买人群', cur: rec.g2, prev: prev?.g2, roi: rec.g2.grantAmount > 0 ? rec.g2.paymentAmount / rec.g2.grantAmount : 0, pRoi: prev?.g2 && prev.g2.grantAmount > 0 ? prev.g2.paymentAmount / prev.g2.grantAmount : undefined },
                      { label: '合计', cur: { grantAmount: t.grant, paymentAmount: t.pay, paymentBuyers: rec.g1.paymentBuyers + rec.g2.paymentBuyers, paymentItems: rec.g1.paymentItems + rec.g2.paymentItems }, prev: prev ? { grantAmount: pt.grant, paymentAmount: pt.pay, paymentBuyers: prev.g1.paymentBuyers + prev.g2.paymentBuyers, paymentItems: prev.g1.paymentItems + prev.g2.paymentItems } : undefined, roi: t.roi, pRoi: prev ? pt.roi : undefined, bold: true },
                    ].map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-red-500/5 transition-colors">
                        <td className={`px-4 py-3 text-left ${row.bold ? 'font-bold' : 'font-medium'}`}>{row.label}</td>
                        <td className={`px-4 py-3 text-center ${row.bold ? 'font-bold' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5"><span className="tabular-nums text-red-600 dark:text-red-400">{fmt(row.cur.grantAmount)}</span>{row.prev && <TrendArrow current={row.cur.grantAmount} previous={row.prev.grantAmount} />}</div>
                        </td>
                        <td className={`px-4 py-3 text-center ${row.bold ? 'font-bold' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5"><span className="tabular-nums text-green-600 dark:text-green-400">{fmt(row.cur.paymentAmount)}</span>{row.prev && <TrendArrow current={row.cur.paymentAmount} previous={row.prev.paymentAmount} />}</div>
                        </td>
                        <td className={`px-4 py-3 text-center ${row.bold ? 'font-bold' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5"><span className="tabular-nums">{fmtInt(row.cur.paymentBuyers)}</span>{row.prev && <TrendArrow current={row.cur.paymentBuyers} previous={row.prev.paymentBuyers} />}</div>
                        </td>
                        <td className={`px-4 py-3 text-center ${row.bold ? 'font-bold' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5"><span className="tabular-nums">{fmtInt(row.cur.paymentItems)}</span>{row.prev && <TrendArrow current={row.cur.paymentItems} previous={row.prev.paymentItems} />}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5"><span className="tabular-nums font-bold text-red-600 dark:text-red-400">{fmtR(row.roi)}</span>{row.pRoi !== undefined && <TrendArrow current={row.roi} previous={row.pRoi} />}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 趋势对比 */}
              {allRecords.length > 1 && (
                <div className="px-8 py-6 border-b border-border/50">
                  <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-4">趋势对比</h2>
                  <div className="overflow-x-auto">
                    <table className="table w-full">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">日期</th>
                          <th className="text-center px-4 py-3 font-semibold text-muted-foreground">合计发放 (元)</th>
                          <th className="text-center px-4 py-3 font-semibold text-muted-foreground">合计支付 (元)</th>
                          <th className="text-center px-4 py-3 font-semibold text-red-600 dark:text-red-400">合计ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allRecords.slice(-10).map(r => {
                          const rt = calcTotals(r);
                          return (
                            <tr key={r.id} className={`border-b last:border-0 ${r.id === rec.id ? 'bg-red-500/10 dark:bg-red-500/15 font-semibold' : ''}`}>
                              <td className="px-4 py-3 text-left">{r.recordDate.slice(0, 10)}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{fmt(rt.grant)}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{fmt(rt.pay)}</td>
                              <td className="px-4 py-3 text-center font-bold tabular-nums">{fmtR(rt.roi)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 关键洞察 */}
              <div className="px-8 py-6 border-b border-border/50">
                <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-4">关键洞察</h2>
                <div className="space-y-2">
                  {genInsights().map((insight, i) => (
                    <div key={i} className="insight bg-yellow-500/10 dark:bg-yellow-500/15 border-l-4 border-yellow-500 rounded-r-xl px-4 py-3 text-sm">
                      {insight}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI 模型分析 / 本地规则引擎分析 */}
              {sections && sections.length > 0 && (
                <div className="px-8 py-6">
                  <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                    {currentSource === 'ai' ? (
                      <>
                        <div className="icon-badge bg-purple-500/15 text-purple-600 dark:text-purple-400"><Sparkles className="h-4 w-4" /></div>
                        <h2 className="text-base font-bold text-purple-600 dark:text-purple-400">AI 模型分析</h2>
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 dark:bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          <Sparkles className="h-3 w-3" /> AI 生成{aiModel ? ` · ${aiModel}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="icon-badge bg-slate-500/15 text-slate-600 dark:text-slate-400"><Cpu className="h-4 w-4" /></div>
                        <h2 className="text-base font-bold text-slate-600 dark:text-slate-400">本地规则引擎分析</h2>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 dark:bg-slate-500/20 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-500/20">
                          <Cpu className="h-3 w-3" /> 规则引擎
                        </span>
                      </>
                    )}
                  </div>
                  <div className={`space-y-4 ${aiError && currentSource === 'local' ? 'mt-2' : ''}`}>
                    {aiError && currentSource === 'local' && (
                      <div className="rounded-xl bg-yellow-500/10 dark:bg-yellow-500/15 border border-yellow-500/30 px-4 py-2.5 text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                        ⚠ {aiError}
                      </div>
                    )}
                    {sections.map((s, i) => (
                      <div key={i} className={`ai-section rounded-xl p-4 border ${
                        currentSource === 'ai'
                          ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/10'
                          : 'bg-slate-500/5 dark:bg-slate-500/10 border-slate-500/10'
                      }`}>
                        <h3 className={`text-sm font-bold mb-1.5 ${
                          currentSource === 'ai'
                            ? 'text-purple-700 dark:text-purple-300'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}>{i + 1}. {s.title}</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">{s.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!canView('repeatDiscounts')) return <NoPermission module="repeatDiscounts" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h2 className="text-3xl font-extrabold tracking-tight gradient-text-red">回头客立减</h2>
        <p className="text-muted-foreground mt-1">每日立减数据录入、分析与日报生成</p>
      </div>

      {/* Tabs - Pill Style */}
      <div className="flex gap-2 flex-wrap animate-fade-up" style={{ animationDelay: '50ms' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`tab-pill inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all magnetic-btn ${
                active
                  ? 'tab-pill-active text-red-600 dark:text-red-400 shadow-sm'
                  : 'border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'entry' && renderEntryTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'chart' && renderChartTab()}
        {activeTab === 'preview' && renderPreviewTab()}
      </div>
    </div>
  );
}
