import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repeatDiscountApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Pencil, Trash2, TrendingUp, DollarSign, Package,
  Calendar, Loader2, Save, X, Clipboard, ArrowUp, ArrowDown, Minus,
  BarChart3, FileText, Download, ChevronDown, Sparkles,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
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

const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: number) => v.toLocaleString('zh-CN');

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
  if (pct > 0) return <span className="text-green-600 inline-flex items-center gap-0.5"><ArrowUp className="h-3.5 w-3.5" />{pct.toFixed(1)}%</span>;
  if (pct < 0) return <span className="text-red-600 inline-flex items-center gap-0.5"><ArrowDown className="h-3.5 w-3.5" />{Math.abs(pct).toFixed(1)}%</span>;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RepeatDiscounts() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();

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

  const summary = (summaryData as any)?.data;
  const list: RecordItem[] = (listData as any)?.data?.list || [];
  const total = (listData as any)?.data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const allRecords: RecordItem[] = useMemo(() => {
    const d = (allData as any)?.data?.list || [];
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
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      } as any,
      {
        label: '合计支付',
        data: allRecords.map(r => calcTotals(r).pay),
        backgroundColor: 'rgba(34,197,94,0.7)',
        borderColor: 'rgba(34,197,94,1)',
        borderWidth: 1,
        yAxisID: 'y',
        order: 3,
      } as any,
      {
        label: '合计ROI',
        data: allRecords.map(r => calcTotals(r).roi),
        type: 'line' as const,
        borderColor: 'rgba(239,68,68,1)',
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.3,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  }), [chartLabels, allRecords]);

  const barChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: { legend: { position: 'top' as const }, tooltip: { mode: 'index' as const } },
    scales: {
      y: { type: 'linear' as const, position: 'left' as const, title: { display: true, text: '金额（元）' } },
      y1: { type: 'linear' as const, position: 'right' as const, title: { display: true, text: 'ROI' }, grid: { drawOnChartArea: false } },
    },
  }), []);

  const lineChartData = useMemo(() => ({
    labels: chartLabels,
    datasets: [
      { label: 'g1 ROI', data: allRecords.map(r => r.g1.grantAmount > 0 ? r.g1.paymentAmount / r.g1.grantAmount : 0), borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: 'g2 ROI', data: allRecords.map(r => r.g2.grantAmount > 0 ? r.g2.paymentAmount / r.g2.grantAmount : 0), borderColor: 'rgba(249,115,22,1)', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: '合计 ROI', data: allRecords.map(r => calcTotals(r).roi), borderColor: 'rgba(239,68,68,1)', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, borderDash: [6, 3], pointRadius: 3, tension: 0.3 },
    ],
  }), [chartLabels, allRecords]);

  const lineChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: { legend: { position: 'top' as const }, tooltip: { mode: 'index' as const } },
    scales: { y: { title: { display: true, text: 'ROI' } } },
  }), []);

  // ─── Group Input Card (reusable) ─────────────────────────────────────────

  const GroupInputCard = ({
    label, sublabel, data, onChange, pasteText, onPasteText, onPaste,
  }: {
    label: string; sublabel: string; data: GroupData;
    onChange: (field: keyof GroupData, val: string) => void;
    pasteText: string; onPasteText: (t: string) => void; onPaste: () => void;
  }) => {
    const roi = calcRoi(parseFloat(data.grantAmount) || 0, parseFloat(data.paymentAmount) || 0);
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm flex-1 min-w-[300px]">
        <div className="mb-4">
          <h4 className="text-base font-semibold text-foreground">{label}</h4>
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
        {/* Paste area */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">粘贴生意参谋数据</label>
          <textarea
            value={pasteText}
            onChange={e => onPasteText(e.target.value)}
            onBlur={onPaste}
            placeholder="粘贴数据后自动解析..."
            className="w-full h-20 rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-xs resize-none focus:border-red-400 focus:outline-none"
          />
        </div>
        {/* Input fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">发放金额（元）</label>
            <input type="number" step="0.01" value={data.grantAmount} onChange={e => onChange('grantAmount', e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">支付金额（元）</label>
            <input type="number" step="0.01" value={data.paymentAmount} onChange={e => onChange('paymentAmount', e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">支付买家数（人）</label>
            <input type="number" value={data.paymentBuyers} onChange={e => onChange('paymentBuyers', e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" placeholder="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">支付件数（件）</label>
            <input type="number" value={data.paymentItems} onChange={e => onChange('paymentItems', e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" placeholder="0" />
          </div>
        </div>
        {/* ROI display */}
        <div className="mt-4 rounded-md bg-muted/50 px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">实时 ROI</span>
          <span className={`text-lg font-bold ${roi >= 3 ? 'text-green-600' : roi >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
            {roi > 0 ? roi.toFixed(2) : '-'}
          </span>
        </div>
      </div>
    );
  };

  // ─── Tab: Entry ──────────────────────────────────────────────────────────

  const renderEntryTab = () => (
    <div className="space-y-5">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">登记日期</label>
        <input type="date" value={form.recordDate}
          onChange={e => setForm(f => ({ ...f, recordDate: e.target.value }))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>

      {/* Two group cards */}
      <div className="flex flex-col lg:flex-row gap-5">
        <GroupInputCard
          label="人群1：近2年已购用户"
          sublabel="近2年内有过购买行为的用户人群"
          data={form.g1}
          onChange={(field, val) => setForm(f => ({ ...f, g1: { ...f.g1, [field]: val } }))}
          pasteText={pasteText1}
          onPasteText={setPasteText1}
          onPaste={() => handlePaste('g1', pasteText1)}
        />
        <GroupInputCard
          label="人群2：60天无购买用户"
          sublabel="365天内有购买且60天无购买的用户人群"
          data={form.g2}
          onChange={(field, val) => setForm(f => ({ ...f, g2: { ...f.g2, [field]: val } }))}
          pasteText={pasteText2}
          onPasteText={setPasteText2}
          onPaste={() => handlePaste('g2', pasteText2)}
        />
      </div>

      {/* Summary row */}
      <div className="rounded-lg border bg-card p-4 shadow-sm flex items-center gap-6 flex-wrap">
        <div className="text-sm"><span className="text-muted-foreground">合计发放：</span><span className="font-semibold text-red-600">¥{fmt((parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0))}</span></div>
        <div className="text-sm"><span className="text-muted-foreground">合计支付：</span><span className="font-semibold text-green-600">¥{fmt((parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0))}</span></div>
        <div className="text-sm"><span className="text-muted-foreground">合计ROI：</span><span className="font-semibold">{(() => {
          const tg = (parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0);
          const tp = (parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0);
          return tg > 0 ? (tp / tg).toFixed(2) : '-';
        })()}</span></div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave}
          disabled={createMutation.isPending || updateMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]">
          {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editingId ? '保存修改' : '保存登记'}
        </button>
        <button onClick={() => { setForm(emptyForm); setPasteText1(''); setPasteText2(''); setEditingId(null); }}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors">
          <X className="h-4 w-4" /> 清空
        </button>
      </div>
    </div>
  );

  // ─── Tab: History ────────────────────────────────────────────────────────

  const renderHistoryTab = () => {
    const latestDay = list.length > 0 ? list[list.length - 1] : null;
    const prevDay = list.length > 1 ? list[list.length - 2] : null;

    return (
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">起始日期</label>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">结束日期</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
              className="text-sm text-muted-foreground hover:text-foreground">清除筛选</button>
          )}
          <span className="text-sm text-muted-foreground ml-auto">共 {total} 条</span>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Calendar className="h-3.5 w-3.5" /> 记录天数
              </div>
              <p className="text-2xl font-bold">{summary.totalDays}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> 最新合计ROI
              </div>
              <p className="text-2xl font-bold text-red-600">
                {latestDay ? calcTotals(latestDay).roi.toFixed(2) : '-'}
              </p>
              {latestDay && prevDay && <TrendArrow current={calcTotals(latestDay).roi} previous={calcTotals(prevDay).roi} />}
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" /> 平均ROI
              </div>
              <p className="text-2xl font-bold">{summary.avgRoi?.toFixed(2) || '-'}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Package className="h-3.5 w-3.5" /> 累计支付
              </div>
              <p className="text-2xl font-bold text-green-600">¥{fmt(summary.totalPaymentAmount || 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="h-3.5 w-3.5" /> 单日最高支付
              </div>
              <p className="text-2xl font-bold">¥{fmt(summary.maxDailyPayment || 0)}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">日期</th>
                  <th className="text-right px-3 py-3 font-medium text-red-600 whitespace-nowrap">近2年发放</th>
                  <th className="text-right px-3 py-3 font-medium text-green-600 whitespace-nowrap">近2年支付</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">近2年ROI</th>
                  <th className="text-right px-3 py-3 font-medium text-red-600 whitespace-nowrap">60天发放</th>
                  <th className="text-right px-3 py-3 font-medium text-green-600 whitespace-nowrap">60天支付</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">60天ROI</th>
                  <th className="text-right px-3 py-3 font-medium text-red-700 whitespace-nowrap">合计发放</th>
                  <th className="text-right px-3 py-3 font-medium text-green-700 whitespace-nowrap">合计支付</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">合计ROI</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />加载中...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">暂无数据</td></tr>
                ) : (
                  list.map((item) => {
                    const totals = calcTotals(item);
                    return (
                      <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{formatDate(item.recordDate)}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-red-600">¥{fmt(item.g1.grantAmount)}</td>
                        <td className="px-3 py-3 text-right text-green-600">¥{fmt(item.g1.paymentAmount)}</td>
                        <td className="px-3 py-3 text-right font-medium">{item.g1.grantAmount > 0 ? (item.g1.paymentAmount / item.g1.grantAmount).toFixed(2) : '-'}</td>
                        <td className="px-3 py-3 text-right text-red-600">¥{fmt(item.g2.grantAmount)}</td>
                        <td className="px-3 py-3 text-right text-green-600">¥{fmt(item.g2.paymentAmount)}</td>
                        <td className="px-3 py-3 text-right font-medium">{item.g2.grantAmount > 0 ? (item.g2.paymentAmount / item.g2.grantAmount).toFixed(2) : '-'}</td>
                        <td className="px-3 py-3 text-right text-red-700 font-medium">¥{fmt(totals.grant)}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">¥{fmt(totals.pay)}</td>
                        <td className="px-3 py-3 text-right font-bold">{totals.grant > 0 ? totals.roi.toFixed(2) : '-'}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleEdit(item)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="编辑">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item.id, item.recordDate)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="删除">
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
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 hover:bg-accent">上一页</button>
              <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 hover:bg-accent">下一页</button>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditModal(false)}>
            <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">编辑记录</h3>
                <button onClick={() => setShowEditModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium">日期</label>
                <input type="date" value={editForm.recordDate}
                  onChange={e => setEditForm(f => ({ ...f, recordDate: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold mb-2">人群1：近2年已购用户</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g1.grantAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g1.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g1.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g1.paymentItems} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold mb-2">人群2：60天无购买用户</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g2.grantAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g2.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g2.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g2.paymentItems} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={handleSaveEdit} disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存修改
                </button>
                <button onClick={() => setShowEditModal(false)} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab: Chart ──────────────────────────────────────────────────────────

  const renderChartTab = () => (
    <div className="space-y-6">
      {allRecords.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">暂无数据，请先登记数据</div>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold mb-3">发放/支付金额 & 合计ROI趋势</h3>
            <div style={{ height: 400 }}>
              <Bar data={barChartData} options={barChartOptions} />
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold mb-3">分人群ROI趋势对比</h3>
            <div style={{ height: 400 }}>
              <Line data={lineChartData} options={lineChartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ─── Tab: Preview ────────────────────────────────────────────────────────

  const renderPreviewTab = () => {
    const rec = previewRecord;
    const prev = prevPreviewRecord;
    const shopName = '店铺名';

    const fmtR = (v: number) => v.toFixed(2);

    const genInsights = () => {
      if (!rec) return ['暂无数据，无法生成洞察'];
      const insights: string[] = [];
      const t = calcTotals(rec);
      if (t.roi >= 5) insights.push(`合计ROI达到 ${fmtR(t.roi)}，表现优秀，投入产出比高`);
      else if (t.roi >= 2) insights.push(`合计ROI为 ${fmtR(t.roi)}，处于良好水平`);
      else if (t.roi > 0) insights.push(`合计ROI仅 ${fmtR(t.roi)}，需关注投放效率`);
      const g1Eff = rec.g1.grantAmount > 0 ? rec.g1.paymentAmount / rec.g1.grantAmount : 0;
      const g2Eff = rec.g2.grantAmount > 0 ? rec.g2.paymentAmount / rec.g2.grantAmount : 0;
      if (g1Eff > g2Eff) insights.push(`近2年用户人群ROI（${fmtR(g1Eff)}）优于60天无购人群（${fmtR(g2Eff)}），老客转化更高效`);
      else if (g2Eff > g1Eff) insights.push(`60天无购人群ROI（${fmtR(g2Eff)}）优于近2年用户人群（${fmtR(g1Eff)}），沉睡用户唤醒效果好`);
      if (rec.g1.paymentBuyers + rec.g2.paymentBuyers > 50) insights.push('日均支付买家数表现良好，人群覆盖面广');
      return insights.length > 0 ? insights : ['数据表现平稳，建议持续观察趋势变化'];
    };

    const genAiAnalysis = () => {
      if (!rec) return null;
      const t = calcTotals(rec);
      const g1R = rec.g1.grantAmount > 0 ? rec.g1.paymentAmount / rec.g1.grantAmount : 0;
      const g2R = rec.g2.grantAmount > 0 ? rec.g2.paymentAmount / rec.g2.grantAmount : 0;
      const sections = [
        { title: '综合评估', content: `当日回头客立减活动共投入 ¥${fmt(t.grant)}，带来 ¥${fmt(t.pay)} 支付，综合ROI ${fmtR(t.roi)}。${t.roi >= 3 ? '整体投放效率良好，建议维持当前策略。' : t.roi >= 1 ? '投放效率尚可，建议优化人群定向以提升ROI。' : 'ROI偏低，建议调整优惠力度或筛选更精准的人群。'}` },
        { title: '人群效率分析', content: `近2年已购用户人群：发放 ¥${fmt(rec.g1.grantAmount)}，支付 ¥${fmt(rec.g1.paymentAmount)}，ROI ${fmtR(g1R)}，覆盖 ${fmtInt(rec.g1.paymentBuyers)} 位买家。60天无购买人群：发放 ¥${fmt(rec.g2.grantAmount)}，支付 ¥${fmt(rec.g2.paymentAmount)}，ROI ${fmtR(g2R)}，覆盖 ${fmtInt(rec.g2.paymentBuyers)} 位买家。${g1R > g2R ? '老客人群转化效率更高，建议加大该人群投放。' : g2R > g1R ? '沉睡用户唤醒效果更佳，值得深入挖掘该人群潜力。' : '两个人群效率接近，建议A/B测试寻找更优策略。'}` },
        { title: '趋势分析', content: prev ? (() => {
          const pt = calcTotals(prev);
          const roiChange = pt.roi > 0 ? ((t.roi - pt.roi) / pt.roi * 100).toFixed(1) : 'N/A';
          const payChange = pt.pay > 0 ? ((t.pay - pt.pay) / pt.pay * 100).toFixed(1) : 'N/A';
          return `与前日相比，ROI ${roiChange === 'N/A' ? '无法比较' : (parseFloat(roiChange) >= 0 ? `提升 ${roiChange}%` : `下降 ${Math.abs(parseFloat(roiChange))}%`)}，支付金额${payChange === 'N/A' ? '无法比较' : (parseFloat(payChange) >= 0 ? `增长 ${payChange}%` : `下降 ${Math.abs(parseFloat(payChange))}%`)}`;
        })() : '首次记录，暂无趋势数据可比。' },
        { title: '成本效率', content: `人均发放金额：¥${(t.grant / (rec.g1.paymentBuyers + rec.g2.paymentBuyers || 1)).toFixed(2)}；人均支付金额：¥${(t.pay / (rec.g1.paymentBuyers + rec.g2.paymentBuyers || 1)).toFixed(2)}；件均支付金额：¥${(t.pay / (rec.g1.paymentItems + rec.g2.paymentItems || 1)).toFixed(2)}。${t.grant / (rec.g1.paymentBuyers + rec.g2.paymentBuyers || 1) < 10 ? '单客获取成本较低，效率可观。' : '单客成本偏高，建议优化优惠策略。'}` },
        { title: '策略建议', content: t.roi < 2 ? '建议：1) 缩小发放范围至高价值用户；2) 降低优惠力度或设置满减门槛；3) 优化人群标签精准度。' : '建议：1) 维持当前投放策略；2) 可适当扩展人群覆盖；3) 关注复购率变化，持续优化。' },
        { title: '风险提示', content: `${t.roi < 1 ? '当前ROI低于1，存在亏损风险，需立即调整策略。' : ''}${g2R < 1 ? '60天无购人群ROI偏低，该人群可能已流失，建议降低投放。' : ''}关注竞品动态及平台规则变化对活动效果的影响。` },
      ];
      return sections;
    };

    const handleAiAnalysis = async () => {
      if (!rec) return;
      setAiLoading(true);
      setAiError('');
      try {
        const result = await repeatDiscountApi.aiAnalysis(rec.id) as any;
        if (result.success) {
          setAiSections(result.data.sections);
        } else {
          setAiError(result.message || 'AI分析失败');
        }
      } catch (err: any) {
        setAiError(err?.response?.data?.message || err.message || 'AI分析请求失败');
      } finally {
        setAiLoading(false);
      }
    };

    const downloadHtml = () => {
      const el = document.getElementById('preview-report');
      if (!el) return;
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>日报 - ${rec?.recordDate || ''}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#333}.report{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)}.header{background:linear-gradient(135deg,#dc2626,#f97316);color:#fff;padding:30px}.header h1{margin:0;font-size:24px}.header p{margin:5px 0 0;opacity:.9}.section{padding:20px;border-bottom:1px solid #eee}.section h2{font-size:16px;color:#dc2626;margin:0 0 12px}.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.kpi{background:#f9fafb;border-radius:8px;padding:12px}.kpi .label{font-size:12px;color:#666}.kpi .value{font-size:20px;font-weight:700;margin-top:4px}.kpi .value.red{color:#dc2626}.kpi .value.green{color:#16a34a}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{padding:8px 12px;border:1px solid #e5e7eb;text-align:right}.table th{background:#f9fafb;font-weight:600;text-align:center}.insight{background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 14px;margin:8px 0;border-radius:0 6px 6px 0;font-size:13px}.ai-section{margin:12px 0}.ai-section h3{font-size:14px;color:#1e40af;margin:0 0 6px}.ai-section p{font-size:13px;color:#555;margin:0;line-height:1.6}</style></head><body><div class="report">${el.innerHTML}</div></body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `回头客立减日报_${rec?.recordDate?.slice(0, 10) || '未知'}.html`;
      a.click(); URL.revokeObjectURL(url);
    };

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">选择日期</label>
          <div className="relative">
            <select value={previewDate} onChange={e => setPreviewDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm pr-8 appearance-none">
              {allRecords.length === 0 && <option value="">暂无数据</option>}
              {allRecords.slice().reverse().map(r => (
                <option key={r.id} value={r.recordDate.slice(0, 10)}>{r.recordDate.slice(0, 10)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
          </div>
          <button onClick={downloadHtml} disabled={!rec}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
            <Download className="h-4 w-4" />下载HTML
          </button>
          <button onClick={handleAiAnalysis} disabled={!rec || aiLoading}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-all">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? 'AI分析中...' : 'AI智能分析'}
          </button>
          {aiError && <span className="text-sm text-destructive">{aiError}</span>}
        </div>

        {!rec ? (
          <div className="text-center py-20 text-muted-foreground">暂无数据</div>
        ) : (() => {
          const t = calcTotals(rec);
          const sections = aiSections || genAiAnalysis();
          return (
            <div id="preview-report" className="rounded-lg border bg-card shadow-sm overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white px-6 py-8">
                <h1 className="text-2xl font-bold">{shopName} · 回头客立减日报</h1>
                <p className="text-sm opacity-90 mt-1">{rec.recordDate.slice(0, 10)}</p>
              </div>

              {/* 活动信息 */}
              <div className="px-6 py-5 border-b">
                <h2 className="text-base font-bold text-red-600 mb-3">活动信息</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="bg-muted/30 rounded-md p-3"><span className="text-muted-foreground">活动类型：</span><span className="font-medium">回头客立减</span></div>
                  <div className="bg-muted/30 rounded-md p-3"><span className="text-muted-foreground">记录日期：</span><span className="font-medium">{rec.recordDate.slice(0, 10)}</span></div>
                  <div className="bg-muted/30 rounded-md p-3"><span className="text-muted-foreground">覆盖人群：</span><span className="font-medium">2组</span></div>
                  <div className="bg-muted/30 rounded-md p-3"><span className="text-muted-foreground">数据来源：</span><span className="font-medium">生意参谋</span></div>
                </div>
              </div>

              {/* 分人群效果 */}
              <div className="px-6 py-5 border-b">
                <h2 className="text-base font-bold text-red-600 mb-3">分人群效果</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { label: '近2年已购用户', g: rec.g1, pg: prev?.g1 },
                    { label: '60天无购买用户', g: rec.g2, pg: prev?.g2 },
                  ].map(({ label, g, pg }) => {
                    const r = g.grantAmount > 0 ? g.paymentAmount / g.grantAmount : 0;
                    const pr = pg && pg.grantAmount > 0 ? pg.paymentAmount / pg.grantAmount : undefined;
                    return (
                      <div key={label} className="bg-muted/20 rounded-lg p-4 border">
                        <h3 className="text-sm font-semibold mb-2">{label}</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="kpi"><div className="label">发放金额</div><div className="value red">¥{fmt(g.grantAmount)}</div></div>
                          <div className="kpi"><div className="label">支付金额</div><div className="value green">¥{fmt(g.paymentAmount)}</div></div>
                          <div className="kpi"><div className="label">支付买家数</div><div className="value">{fmtInt(g.paymentBuyers)}人</div></div>
                          <div className="kpi"><div className="label">ROI</div><div className={`value ${r >= 3 ? 'green' : r >= 1 ? '' : 'red'}`}>{fmtR(r)}</div><TrendArrow current={r} previous={pr} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 汇总对比 */}
              <div className="px-6 py-5 border-b">
                <h2 className="text-base font-bold text-red-600 mb-3">汇总对比</h2>
                <table className="table">
                  <thead><tr><th></th><th>近2年</th><th>60天</th><th>合计</th></tr></thead>
                  <tbody>
                    <tr><td className="font-medium" style={{textAlign:'left'}}>发放金额</td><td>¥{fmt(rec.g1.grantAmount)}</td><td>¥{fmt(rec.g2.grantAmount)}</td><td className="font-bold">¥{fmt(t.grant)}</td></tr>
                    <tr><td className="font-medium" style={{textAlign:'left'}}>支付金额</td><td>¥{fmt(rec.g1.paymentAmount)}</td><td>¥{fmt(rec.g2.paymentAmount)}</td><td className="font-bold">¥{fmt(t.pay)}</td></tr>
                    <tr><td className="font-medium" style={{textAlign:'left'}}>ROI</td><td>{rec.g1.grantAmount > 0 ? fmtR(rec.g1.paymentAmount / rec.g1.grantAmount) : '-'}</td><td>{rec.g2.grantAmount > 0 ? fmtR(rec.g2.paymentAmount / rec.g2.grantAmount) : '-'}</td><td className="font-bold">{fmtR(t.roi)}</td></tr>
                    <tr><td className="font-medium" style={{textAlign:'left'}}>支付买家数</td><td>{fmtInt(rec.g1.paymentBuyers)}</td><td>{fmtInt(rec.g2.paymentBuyers)}</td><td className="font-bold">{fmtInt(rec.g1.paymentBuyers + rec.g2.paymentBuyers)}</td></tr>
                    <tr><td className="font-medium" style={{textAlign:'left'}}>支付件数</td><td>{fmtInt(rec.g1.paymentItems)}</td><td>{fmtInt(rec.g2.paymentItems)}</td><td className="font-bold">{fmtInt(rec.g1.paymentItems + rec.g2.paymentItems)}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* 趋势对比 */}
              {allRecords.length > 1 && (
                <div className="px-6 py-5 border-b">
                  <h2 className="text-base font-bold text-red-600 mb-3">趋势对比</h2>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead><tr><th>日期</th><th>合计发放</th><th>合计支付</th><th>合计ROI</th></tr></thead>
                      <tbody>
                        {allRecords.slice(-10).map(r => {
                          const rt = calcTotals(r);
                          return (
                            <tr key={r.id} className={r.id === rec.id ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                              <td style={{textAlign:'left'}}>{r.recordDate.slice(0, 10)}</td>
                              <td>¥{fmt(rt.grant)}</td><td>¥{fmt(rt.pay)}</td>
                              <td className="font-bold">{fmtR(rt.roi)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 关键洞察 */}
              <div className="px-6 py-5 border-b">
                <h2 className="text-base font-bold text-red-600 mb-3">关键洞察</h2>
                {genInsights().map((insight, i) => (
                  <div key={i} className="insight">{insight}</div>
                ))}
              </div>

              {/* AI 模型分析 */}
              {sections && sections.length > 0 && (
                <div className="px-6 py-5">
                  <h2 className="text-base font-bold text-red-600 mb-3">AI 模型分析</h2>
                  {sections.map((s, i) => (
                    <div key={i} className="ai-section">
                      <h3>{i + 1}. {s.title}</h3>
                      <p>{s.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">回头客立减</h2>
        <p className="text-muted-foreground">每日立减数据录入、分析与日报生成</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
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
