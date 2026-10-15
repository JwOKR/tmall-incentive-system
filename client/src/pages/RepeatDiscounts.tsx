import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repeatDiscountApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  emptyForm, calcTotals, fmt, fmtInt, parsePastedText, TABS,
} from '@/lib/repeatDiscounts';
import type { FormState, RecordItem, TabKey } from '@/lib/repeatDiscounts';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { EntryTab } from '@/components/repeatDiscounts/EntryTab';
import { HistoryTab } from '@/components/repeatDiscounts/HistoryTab';
import { ChartTab } from '@/components/repeatDiscounts/ChartTab';
import { PreviewTab } from '@/components/repeatDiscounts/PreviewTab';

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
    repeatDiscountApi.getSavedOverallAnalysis(startDate || undefined, endDate || undefined).then((res: any) => {
      if (cancelled) return;
      // axios 拦截器已解包一层
      const data = res?.data ?? res;
      if (data && data.sections) {
        setOverallAiSections(data.sections);
        setOverallAiSource(data.source);
        setOverallAiModel(data.model || '');
      } else {
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
    repeatDiscountApi.getSavedAnalysis(previewRecord.id).then((res: any) => {
      if (cancelled) return;
      // axios 拦截器已解包一层，res 就是 { success, data }
      const data = res?.data ?? res;
      if (data && data.sections) {
        setAiSections(data.sections);
        setAiSource(data.source);
        setAiModel(data.model || '');
      } else {
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h2 className="text-3xl font-extrabold tracking-tight apple-text-title-1-red">回头客立减</h2>
        <p className="text-muted-foreground mt-1">每日立减数据录入、分析与日报生成</p>
      </div>

      {/* Tabs - Pill Style */}
      <div className="flex gap-2 flex-wrap animate-fade-up" style={{ animationDelay: '50ms' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`tab-pill inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all apple-btn ${
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
        {activeTab === 'entry' && (
          <EntryTab
            form={form}
            setForm={setForm}
            pasteText1={pasteText1}
            setPasteText1={setPasteText1}
            pasteText2={pasteText2}
            setPasteText2={setPasteText2}
            onPaste={handlePaste}
            onSave={handleSave}
            createPending={createMutation.isPending}
            updatePending={updateMutation.isPending}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            list={list}
            total={total}
            totalPages={totalPages}
            listLoading={listLoading}
            summary={summary}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            page={page}
            setPage={setPage}
            onEdit={handleEdit}
            onDelete={handleDelete}
            overallAi={{
              sections: overallAiSections,
              loading: overallAiLoading,
              error: overallAiError,
              source: overallAiSource,
              model: overallAiModel,
              onAnalyze: handleOverallAiAnalysis,
            }}
            edit={{
              showEditModal,
              setShowEditModal,
              editForm,
              setEditForm,
              onSaveEdit: handleSaveEdit,
              updatePending: updateMutation.isPending,
            }}
          />
        )}
        {activeTab === 'chart' && (
          <ChartTab
            allRecords={allRecords}
            filteredChartRecords={filteredChartRecords}
            barChartData={barChartData}
            barChartOptions={barChartOptions}
            lineChartData={lineChartData}
            lineChartOptions={lineChartOptions}
            chartStartDate={chartStartDate}
            setChartStartDate={setChartStartDate}
            chartEndDate={chartEndDate}
            setChartEndDate={setChartEndDate}
          />
        )}
        {activeTab === 'preview' && (
          <PreviewTab
            previewRecord={previewRecord}
            prevPreviewRecord={prevPreviewRecord}
            allRecords={allRecords}
            previewDate={previewDate}
            setPreviewDate={setPreviewDate}
            aiSections={aiSections}
            setAiSections={setAiSections}
            aiLoading={aiLoading}
            setAiLoading={setAiLoading}
            aiError={aiError}
            setAiError={setAiError}
            aiSource={aiSource}
            setAiSource={setAiSource}
            aiModel={aiModel}
            setAiModel={setAiModel}
          />
        )}
      </div>
    </div>
  );
}
