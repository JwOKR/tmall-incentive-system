import { ChevronDown, Cpu, Download, FileText, Loader2, Sparkles } from 'lucide-react';
import { repeatDiscountApi } from '@/lib/api';
import { calcTotals, fmt, fmtInt } from '@/lib/repeatDiscounts';
import type { RecordItem } from '@/lib/repeatDiscounts';
import { TrendArrow } from './TrendArrow';

// ─── Tab: Preview ────────────────────────────────────────────────────────────

export function PreviewTab({
  previewRecord, prevPreviewRecord, allRecords,
  previewDate, setPreviewDate,
  aiSections, setAiSections, aiLoading, setAiLoading, aiError, setAiError,
  aiSource, setAiSource, aiModel, setAiModel,
}: {
  previewRecord: RecordItem | null;
  prevPreviewRecord: RecordItem | null;
  allRecords: RecordItem[];
  previewDate: string;
  setPreviewDate: (v: string) => void;
  aiSections: { title: string; content: string }[] | null;
  setAiSections: (s: { title: string; content: string }[] | null) => void;
  aiLoading: boolean;
  setAiLoading: (v: boolean) => void;
  aiError: string;
  setAiError: (v: string) => void;
  aiSource: 'ai' | 'local' | null;
  setAiSource: (v: 'ai' | 'local' | null) => void;
  aiModel: string;
  setAiModel: (v: string) => void;
}) {
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
            className="rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm pr-10 appearance-none apple-input cursor-pointer">
            {allRecords.length === 0 && <option value="">暂无数据</option>}
            {allRecords.slice().reverse().map(r => (
              <option key={r.id} value={r.recordDate.slice(0, 10)}>{r.recordDate.slice(0, 10)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
        </div>
        <button onClick={downloadHtml} disabled={!rec}
          className="apple-btn inline-flex items-center gap-2 rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
          <Download className="h-4 w-4" />下载HTML
        </button>
        <button onClick={handleAiAnalysis} disabled={!rec || aiLoading}
          className={`apple-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ${
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
        const allSections = aiSections || genAiAnalysis();
        const currentSource = aiSource || (aiSections ? 'ai' : 'local');
        // 从 sections 中提取关键洞察，剩余部分作为分析报告
        const insightSection = allSections?.find(s => s.title === '关键洞察');
        const analysisSections = allSections?.filter(s => s.title !== '关键洞察') || [];
        // AI 洞察：按换行或分号拆分为数组
        const aiInsights = insightSection?.content
          ?.split(/[\n；;]/)
          .map(s => s.replace(/^\d+[.、)\s]+/, '').trim())
          .filter(s => s.length > 4) || [];
        const insights = aiInsights.length > 0 ? aiInsights : genInsights();
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
                      <td className={`px-4 py-3 text-center tabular-nums text-red-600 dark:text-red-400 ${row.bold ? 'font-bold text-red-700 dark:text-red-300' : ''}`}>{fmt(row.cur.grantAmount)}</td>
                      <td className={`px-4 py-3 text-center tabular-nums text-green-600 dark:text-green-400 ${row.bold ? 'font-bold text-green-700 dark:text-green-300' : ''}`}>{fmt(row.cur.paymentAmount)}</td>
                      <td className={`px-4 py-3 text-center tabular-nums ${row.bold ? 'font-bold' : ''}`}>{fmtInt(row.cur.paymentBuyers)}</td>
                      <td className={`px-4 py-3 text-center tabular-nums ${row.bold ? 'font-bold' : ''}`}>{fmtInt(row.cur.paymentItems)}</td>
                      <td className="px-4 py-3 text-center tabular-nums font-bold text-red-600 dark:text-red-400">{fmtR(row.roi)}</td>
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
                {insights.map((insight, i) => (
                  <div key={i} className="insight bg-yellow-500/10 dark:bg-yellow-500/15 border-l-4 border-yellow-500 rounded-r-xl px-4 py-3 text-sm">
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            {/* AI 模型分析 / 本地规则引擎分析 */}
            {analysisSections.length > 0 && (
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
                  {analysisSections.map((s, i) => (
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
}
