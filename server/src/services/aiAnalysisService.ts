import prisma from '../utils/db';
import { getAIConfig } from './systemSettingService';

// ──────────────────────────────────────
// 保存分析结果到数据库
// ──────────────────────────────────────
async function saveAnalysis(
  type: 'daily' | 'overall',
  scopeKey: string,
  sections: { title: string; content: string }[],
  source: 'ai' | 'local',
  model: string | null,
  rawText: string | null,
  recordId?: string,
) {
  console.log('[AI-Save] Saving analysis:', { type, scopeKey, source, sectionsCount: sections.length });
  const result = await prisma.repeatDiscountAnalysis.upsert({
    where: { scopeKey },
    create: {
      type,
      recordId: recordId || null,
      scopeKey,
      sections: JSON.stringify(sections),
      source,
      model: model || null,
      rawText: rawText || null,
    },
    update: {
      sections: JSON.stringify(sections),
      source,
      model: model || null,
      rawText: rawText || null,
    },
  });
  console.log('[AI-Save] Saved successfully, id:', result.id);
  return result;
}

// ──────────────────────────────────────
// 读取已保存的分析结果
// ──────────────────────────────────────
export async function getSavedDailyAnalysis(recordId: string) {
  const saved = await prisma.repeatDiscountAnalysis.findUnique({
    where: { scopeKey: recordId },
  });
  if (!saved) return null;
  return {
    sections: JSON.parse(saved.sections),
    source: saved.source as 'ai' | 'local',
    model: saved.model || '',
    rawText: saved.rawText || '',
    updatedAt: saved.updatedAt,
  };
}

export async function getSavedOverallAnalysis(startDate?: string, endDate?: string) {
  const scopeKey = `${startDate || 'all'}_${endDate || 'all'}`;
  const saved = await prisma.repeatDiscountAnalysis.findUnique({
    where: { scopeKey },
  });
  if (!saved) return null;
  return {
    sections: JSON.parse(saved.sections),
    source: saved.source as 'ai' | 'local',
    model: saved.model || '',
    rawText: saved.rawText || '',
    updatedAt: saved.updatedAt,
  };
}

// ──────────────────────────────────────
// 构建 Prompt
// ──────────────────────────────────────
function buildPrompt(data: any, prevData: any) {
  const fmt = (v: number) => v.toFixed(2);

  // 当天数据
  const g1R = data.g1GrantAmount > 0 ? (data.g1PaymentAmount / data.g1GrantAmount).toFixed(2) : 'N/A';
  const g2R = data.g2GrantAmount > 0 ? (data.g2PaymentAmount / data.g2GrantAmount).toFixed(2) : 'N/A';
  const totalGrant = data.g1GrantAmount + data.g2GrantAmount;
  const totalPayment = data.g1PaymentAmount + data.g2PaymentAmount;
  const totalROI = totalGrant > 0 ? (totalPayment / totalGrant).toFixed(2) : 'N/A';
  const totalBuyers = data.g1PaymentBuyers + data.g2PaymentBuyers;
  const totalItems = data.g1PaymentItems + data.g2PaymentItems;

  // 前一天数据（用于对比）
  let prevSection = '';
  if (prevData) {
    const pG1R = prevData.g1GrantAmount > 0 ? (prevData.g1PaymentAmount / prevData.g1GrantAmount).toFixed(2) : 'N/A';
    const pG2R = prevData.g2GrantAmount > 0 ? (prevData.g2PaymentAmount / prevData.g2GrantAmount).toFixed(2) : 'N/A';
    const pTotalGrant = prevData.g1GrantAmount + prevData.g2GrantAmount;
    const pTotalPayment = prevData.g1PaymentAmount + prevData.g2PaymentAmount;
    const pTotalROI = pTotalGrant > 0 ? (pTotalPayment / pTotalGrant).toFixed(2) : 'N/A';
    const pTotalBuyers = prevData.g1PaymentBuyers + prevData.g2PaymentBuyers;

    prevSection = `
前一天数据对比：
- 前一天合计发放：¥${fmt(pTotalGrant)}，合计支付：¥${fmt(pTotalPayment)}，合计ROI：${pTotalROI}
- 前一天近2年已购用户人群ROI：${pG1R}，365天内有购买且60天无购买人群ROI：${pG2R}
- 前一天合计支付买家数：${pTotalBuyers}

环比变化：
- 发放金额变化：${pTotalGrant > 0 ? ((totalGrant - pTotalGrant) / pTotalGrant * 100).toFixed(1) : 'N/A'}%
- 支付金额变化：${pTotalPayment > 0 ? ((totalPayment - pTotalPayment) / pTotalPayment * 100).toFixed(1) : 'N/A'}%
- ROI变化：${pTotalGrant > 0 && totalGrant > 0 ? ((parseFloat(totalROI) - parseFloat(pTotalROI)) / parseFloat(pTotalROI) * 100).toFixed(1) : 'N/A'}%
- 支付买家数变化：${pTotalBuyers > 0 ? ((totalBuyers - pTotalBuyers) / pTotalBuyers * 100).toFixed(1) : 'N/A'}%`;
  }

  return `你是一位资深电商数据分析师，专注于天猫/淘宝回头客立减活动的数据分析。请根据以下数据生成一份有洞察力的分析报告。

## 当前日期数据
日期：${data.recordDate}

### 近2年已购用户人群
- 发放金额：¥${fmt(data.g1GrantAmount)}
- 支付金额：¥${fmt(data.g1PaymentAmount)}
- 支付买家数：${data.g1PaymentBuyers} 人
- 支付件数：${data.g1PaymentItems} 件
- ROI：${g1R}

### 365天内有购买且60天无购买人群
- 发放金额：¥${fmt(data.g2GrantAmount)}
- 支付金额：¥${fmt(data.g2PaymentAmount)}
- 支付买家数：${data.g2PaymentBuyers} 人
- 支付件数：${data.g2PaymentItems} 件
- ROI：${g2R}

### 合计
- 合计发放：¥${fmt(totalGrant)}
- 合计支付：¥${fmt(totalPayment)}
- 合计ROI：${totalROI}
- 合计支付买家数：${totalBuyers}
- 合计支付件数：${totalItems}
${prevSection}

## 分析要求
请像一位真正的分析师那样，结合数据给出有深度的洞察，而不是泛泛而谈。要求：

1. **综合评估**：不要只说"ROI为X，处于XX水平"。要结合发放与支付的绝对量、买家转化率等综合判断活动健康度。如果ROI高但买家数很少，要指出这个矛盾。
2. **人群效率分析**：不要只比较两个ROI数字。要分析人群规模差异、转化效率差异背后的可能原因（如人群重叠度、优惠券面额差异等）。
3. **趋势分析**：如果有前一天数据，不要只报百分比变化。要判断变化是正常波动还是趋势信号，给出可能的归因。
4. **成本效率**：计算单客获取成本和件均成本，与行业常见水平（通常5-15元/客）对比，给出具体评价。
5. **策略建议**：给出可执行的具体建议，不要说"建议优化"这种空话。要具体到：调整哪个指标、幅度大概多少、预期效果如何。
6. **风险提示**：关注数据中的异常信号，如ROI骤降、买家数萎缩、人群效率分化等，给出预警级别。
7. **关键洞察**：提炼3-5条最重要的数据洞察，每条一句话，用简洁有力的语言概括。这些洞察应该是运营人员最需要关注的核心信息，如"ROI虽高但买家数仅X人，数据可信度不足"或"沉睡人群效率反超已购人群，召回策略见效"。

语气要像一位资深分析师在给运营团队做汇报，专业但不枯燥，有数据支撑但不堆砌数字。每段2-3句话，总计350-450字。`;
}

// ──────────────────────────────────────
// 调用 AI API（OpenAI 兼容格式）
// ──────────────────────────────────────
async function callAIApi(prompt: string): Promise<string> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error('AI API Key 未配置，请在系统设置 → AI模型配置中设置');
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '你是一位资深电商数据分析师，拥有10年天猫/淘宝运营经验。你擅长从数据中发现别人看不到的洞察，用通俗易懂的语言解释复杂的商业逻辑。你的分析风格是：数据驱动、洞察深刻、建议具体可执行。你不会说"建议优化"这种空话，而是会给出具体的调整幅度和预期效果。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API 调用失败 (${response.status}): ${errText}`);
  }

  const result: any = await response.json();
  return result.choices?.[0]?.message?.content || '未能获取分析结果';
}

// ──────────────────────────────────────
// 解析AI返回的结构化分析
// ──────────────────────────────────────
function parseAnalysis(rawText: string) {
  console.log('[AI-Parse] Daily raw text:', rawText);
  
  const sectionTitleMap = [
    { keys: ['综合评估', '整体评估'], display: '综合评估' },
    { keys: ['人群效率分析', '人群效率'], display: '人群效率分析' },
    { keys: ['趋势分析', '趋势'], display: '趋势分析' },
    { keys: ['成本效率', '成本分析'], display: '成本效率' },
    { keys: ['策略建议', '策略优化'], display: '策略建议' },
    { keys: ['风险提示', '风险预警'], display: '风险提示' },
    { keys: ['关键洞察', '核心洞察', '核心发现'], display: '关键洞察' },
  ];

  // 预处理：去掉粗体标记
  const cleaned = rawText.replace(/\*\*/g, '').trim();
  
  // 按行分割
  const lines = cleaned.split('\n').map(l => l.trim());
  
  // 识别每行是否是标题行，返回匹配的 section index
  const findSectionForLine = (line: string): number => {
    // 去掉行首的数字编号、星号、空格
    const stripped = line.replace(/^\d+[.、)\s]+/, '').replace(/^\*+\s*/, '').trim();
    for (let i = 0; i < sectionTitleMap.length; i++) {
      if (sectionTitleMap[i].keys.some(key => stripped.startsWith(key))) {
        return i;
      }
    }
    return -1;
  };
  
  // 按标题行切分 sections
  const sections: { sectionIdx: number; contentLines: string[] }[] = [];
  let currentSection: { sectionIdx: number; contentLines: string[] } | null = null;
  
  for (const line of lines) {
    if (!line) continue; // 跳过空行
    const sectionIdx = findSectionForLine(line);
    if (sectionIdx >= 0) {
      // 找到新标题，保存当前 section
      if (currentSection) sections.push(currentSection);
      // 提取标题行中冒号后面的内容（副标题）
      const section = sectionTitleMap[sectionIdx];
      const key = section.keys.find(k => {
        const stripped = line.replace(/^\d+[.、)\s]+/, '').replace(/^\*+\s*/, '').trim();
        return stripped.startsWith(k);
      }) || '';
      const keyIdx = line.indexOf(key);
      let subtitle = '';
      if (keyIdx >= 0) {
        subtitle = line.substring(keyIdx + key.length).replace(/^[:：\s]+/, '').trim();
      }
      currentSection = { sectionIdx, contentLines: subtitle ? [subtitle] : [] };
    } else if (currentSection) {
      // 非标题行，追加到当前 section
      currentSection.contentLines.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);
  
  // 按 sectionTitleMap 顺序组装结果
  const result: { title: string; content: string }[] = [];
  for (let i = 0; i < sectionTitleMap.length; i++) {
    const found = sections.find(s => s.sectionIdx === i);
    const content = found ? found.contentLines.join('\n').trim() : '';
    result.push({ title: sectionTitleMap[i].display, content: content || `${sectionTitleMap[i].display}分析数据暂不可用` });
  }

  console.log('[AI-Parse] Daily parsed result:', result.map(r => `${r.title}: ${r.content.substring(0, 40)}...`));
  return result;
}

// ──────────────────────────────────────
// 主函数：生成AI分析
// ──────────────────────────────────────
// ──────────────────────────────────────
// 构建 总体分析 Prompt
// ──────────────────────────────────────
function buildOverallPrompt(records: any[], summary: any) {
  const fmt = (v: number) => v.toFixed(2);
  const days = records.length;

  // 每日数据摘要
  const dailyLines = records.map((r: any, i: number) => {
    const tg = r.g1GrantAmount + r.g2GrantAmount;
    const tp = r.g1PaymentAmount + r.g2PaymentAmount;
    const roi = tg > 0 ? (tp / tg).toFixed(2) : 'N/A';
    const g1r = r.g1GrantAmount > 0 ? (r.g1PaymentAmount / r.g1GrantAmount).toFixed(2) : 'N/A';
    const g2r = r.g2GrantAmount > 0 ? (r.g2PaymentAmount / r.g2GrantAmount).toFixed(2) : 'N/A';
    const buyers = r.g1PaymentBuyers + r.g2PaymentBuyers;
    return `第${i + 1}天 (${r.recordDate.toISOString().slice(0, 10)}): 发放¥${fmt(tg)}, 支付¥${fmt(tp)}, ROI=${roi}, 已购ROI=${g1r}, 沉睡ROI=${g2r}, 买家数=${buyers}`;
  }).join('\n');

  // 计算趋势
  const firstRecord = records[0];
  const lastRecord = records[records.length - 1];
  const firstROI = (firstRecord.g1GrantAmount + firstRecord.g2GrantAmount) > 0
    ? (firstRecord.g1PaymentAmount + firstRecord.g2PaymentAmount) / (firstRecord.g1GrantAmount + firstRecord.g2GrantAmount) : 0;
  const lastROI = (lastRecord.g1GrantAmount + lastRecord.g2GrantAmount) > 0
    ? (lastRecord.g1PaymentAmount + lastRecord.g2PaymentAmount) / (lastRecord.g1GrantAmount + lastRecord.g2GrantAmount) : 0;
  const roiChange = firstROI > 0 ? ((lastROI - firstROI) / firstROI * 100).toFixed(1) : 'N/A';

  // 找最高和最低ROI日
  let maxROI = -Infinity, minROI = Infinity, maxROIday = '', minROIday = '';
  for (const r of records) {
    const tg = r.g1GrantAmount + r.g2GrantAmount;
    if (tg <= 0) continue;
    const roi = (r.g1PaymentAmount + r.g2PaymentAmount) / tg;
    if (roi > maxROI) { maxROI = roi; maxROIday = r.recordDate.toISOString().slice(0, 10); }
    if (roi < minROI) { minROI = roi; minROIday = r.recordDate.toISOString().slice(0, 10); }
  }

  return `你是一位资深电商数据分析师，专注于天猫/淘宝回头客立减活动的数据分析。请根据以下${days}天的全部数据，生成一份有深度的总数据分析报告。

## 数据概览
- 统计天数：${days} 天
- 累计发放金额：¥${fmt(summary.totalGrantAmount)}
- 累计支付金额：¥${fmt(summary.totalPaymentAmount)}
- 累计综合ROI：${summary.totalROI.toFixed(2)}
- 累计支付买家数：${summary.totalPaymentBuyers} 人
- 累计支付件数：${summary.totalPaymentItems} 件
- 平均日发放：¥${fmt(summary.totalGrantAmount / days)}
- 平均日支付：¥${fmt(summary.totalPaymentAmount / days)}
- 平均日ROI：${summary.totalROI.toFixed(2)}

## 近2年已购用户人群 汇总
- 累计发放：¥${fmt(summary.g1GrantAmount)}
- 累计支付：¥${fmt(summary.g1PaymentAmount)}
- 累计ROI：${summary.g1ROI.toFixed(2)}
- 累计买家数：${summary.g1PaymentBuyers} 人

## 365天内有购买且60天无购买人群 汇总
- 累计发放：¥${fmt(summary.g2GrantAmount)}
- 累计支付：¥${fmt(summary.g2PaymentAmount)}
- 累计ROI：${summary.g2ROI.toFixed(2)}
- 累计买家数：${summary.g2PaymentBuyers} 人

## 每日数据明细
${dailyLines}

## 趋势特征
- 首日ROI：${firstROI.toFixed(2)} → 末日ROI：${lastROI.toFixed(2)}，变化：${roiChange}%
- 最高ROI日：${maxROIday}（${maxROI.toFixed(2)}）
- 最低ROI日：${minROIday}（${minROI.toFixed(2)}）

## 分析要求
请像一位真正的数据分析师那样，深入挖掘数据背后的故事。要求：

1. **整体概况**：不要只报数字。要判断整体投放是否健康，ROI趋势是上升还是衰减，结合天数给出投放节奏评价。
2. **趋势分析**：要识别数据中的模式——是否有周期性波动（如周末效应）？ROI是持续下滑还是企稳回升？最高/最低日的可能原因是什么？
3. **人群效率对比**：不要只比较ROI。要分析两个人群的投入产出比、人群规模、转化效率的差异，以及是否值得调整预算分配。
4. **成本效率分析**：计算单客获取成本，与行业基准对比。分析成本趋势是改善还是恶化。
5. **策略优化建议**：给出具体可执行的建议——比如"将沉睡人群的预算占比从当前的X%提升到Y%"，而不是"建议优化"这种空话。
6. **风险预警**：关注数据中的异常信号——ROI是否跌破盈亏线？买家数是否持续萎缩？人群效率是否分化加剧？

语气要像一位资深分析师在给管理层做汇报，有洞察力、有判断、有建议，而不是机械地复述数据。每段2-3句话，总计350-500字。`;
}

// ──────────────────────────────────────
// 解析总体分析（与单日相同的section结构）
// ──────────────────────────────────────
function parseOverallAnalysis(rawText: string) {
  console.log('[AI-Parse] Overall raw text:', rawText);
  
  const sectionTitleMap = [
    { keys: ['整体概况', '综合评估'], display: '整体概况' },
    { keys: ['趋势分析', '趋势'], display: '趋势分析' },
    { keys: ['人群效率对比', '人群效率分析', '人群效率'], display: '人群效率对比' },
    { keys: ['成本效率分析', '成本效率'], display: '成本效率分析' },
    { keys: ['策略优化建议', '策略建议', '策略'], display: '策略优化建议' },
    { keys: ['风险预警', '风险提示', '风险'], display: '风险预警' },
    { keys: ['关键洞察', '核心洞察', '核心发现'], display: '关键洞察' },
  ];

  const cleaned = rawText.replace(/\*\*/g, '').trim();
  const lines = cleaned.split('\n').map(l => l.trim());
  
  const findSectionForLine = (line: string): number => {
    const stripped = line.replace(/^\d+[.、)\s]+/, '').replace(/^\*+\s*/, '').trim();
    for (let i = 0; i < sectionTitleMap.length; i++) {
      if (sectionTitleMap[i].keys.some(key => stripped.startsWith(key))) {
        return i;
      }
    }
    return -1;
  };
  
  const sections: { sectionIdx: number; contentLines: string[] }[] = [];
  let currentSection: { sectionIdx: number; contentLines: string[] } | null = null;
  
  for (const line of lines) {
    if (!line) continue;
    const sectionIdx = findSectionForLine(line);
    if (sectionIdx >= 0) {
      if (currentSection) sections.push(currentSection);
      const section = sectionTitleMap[sectionIdx];
      const key = section.keys.find(k => {
        const stripped = line.replace(/^\d+[.、)\s]+/, '').replace(/^\*+\s*/, '').trim();
        return stripped.startsWith(k);
      }) || '';
      const keyIdx = line.indexOf(key);
      let subtitle = '';
      if (keyIdx >= 0) {
        subtitle = line.substring(keyIdx + key.length).replace(/^[:：\s]+/, '').trim();
      }
      currentSection = { sectionIdx, contentLines: subtitle ? [subtitle] : [] };
    } else if (currentSection) {
      currentSection.contentLines.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);
  
  const result: { title: string; content: string }[] = [];
  for (let i = 0; i < sectionTitleMap.length; i++) {
    const found = sections.find(s => s.sectionIdx === i);
    const content = found ? found.contentLines.join('\n').trim() : '';
    result.push({ title: sectionTitleMap[i].display, content: content || `${sectionTitleMap[i].display}分析数据暂不可用` });
  }

  console.log('[AI-Parse] Overall parsed result:', result.map(r => `${r.title}: ${r.content.substring(0, 40)}...`));
  return result;
}

// ──────────────────────────────────────
// 主函数：生成总体AI分析
// ──────────────────────────────────────
export async function generateOverallAIAnalysis(startDate?: string, endDate?: string) {
  const where: any = {};
  if (startDate || endDate) {
    where.recordDate = {};
    if (startDate) where.recordDate.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.recordDate.lte = end;
    }
  }

  const records = await prisma.repeatDiscount.findMany({
    where,
    orderBy: { recordDate: 'asc' },
  });

  if (records.length === 0) throw new Error('没有可分析的数据');

  // 计算汇总
  const s = {
    totalGrantAmount: 0, totalPaymentAmount: 0, totalPaymentBuyers: 0, totalPaymentItems: 0,
    g1GrantAmount: 0, g1PaymentAmount: 0, g1PaymentBuyers: 0, g1PaymentItems: 0,
    g2GrantAmount: 0, g2PaymentAmount: 0, g2PaymentBuyers: 0, g2PaymentItems: 0,
  };
  for (const r of records) {
    s.totalGrantAmount += r.g1GrantAmount + r.g2GrantAmount;
    s.totalPaymentAmount += r.g1PaymentAmount + r.g2PaymentAmount;
    s.totalPaymentBuyers += r.g1PaymentBuyers + r.g2PaymentBuyers;
    s.totalPaymentItems += r.g1PaymentItems + r.g2PaymentItems;
    s.g1GrantAmount += r.g1GrantAmount;
    s.g1PaymentAmount += r.g1PaymentAmount;
    s.g1PaymentBuyers += r.g1PaymentBuyers;
    s.g1PaymentItems += r.g1PaymentItems;
    s.g2GrantAmount += r.g2GrantAmount;
    s.g2PaymentAmount += r.g2PaymentAmount;
    s.g2PaymentBuyers += r.g2PaymentBuyers;
    s.g2PaymentItems += r.g2PaymentItems;
  }
  const summary = {
    ...s,
    totalROI: s.totalGrantAmount > 0 ? s.totalPaymentAmount / s.totalGrantAmount : 0,
    g1ROI: s.g1GrantAmount > 0 ? s.g1PaymentAmount / s.g1GrantAmount : 0,
    g2ROI: s.g2GrantAmount > 0 ? s.g2PaymentAmount / s.g2GrantAmount : 0,
  };

  const prompt = buildOverallPrompt(records, summary);
  const rawAnalysis = await callAIApi(prompt);
  const sections = parseOverallAnalysis(rawAnalysis);

  const config = await getAIConfig();

  // 保存到数据库
  const scopeKey = `${startDate || 'all'}_${endDate || 'all'}`;
  await saveAnalysis('overall', scopeKey, sections, 'ai', config.model || null, rawAnalysis);

  return {
    days: records.length,
    summary,
    sections,
    rawText: rawAnalysis,
    source: 'ai' as const,
    model: config.model || 'unknown',
  };
}

// ──────────────────────────────────────
// 主函数：生成单日AI分析
// ──────────────────────────────────────
export async function generateAIAnalysis(recordId: string) {
  // 获取当天数据
  const record = await prisma.repeatDiscount.findUnique({ where: { id: recordId } });
  if (!record) throw new Error('记录不存在');

  // 获取前一天数据
  const prevRecord = await prisma.repeatDiscount.findFirst({
    where: { recordDate: { lt: record.recordDate } },
    orderBy: { recordDate: 'desc' },
  });

  const prompt = buildPrompt(record, prevRecord);
  const rawAnalysis = await callAIApi(prompt);
  const sections = parseAnalysis(rawAnalysis);

  const config = await getAIConfig();

  // 保存到数据库
  await saveAnalysis('daily', recordId, sections, 'ai', config.model || null, rawAnalysis, recordId);

  return {
    recordDate: record.recordDate,
    sections,
    rawText: rawAnalysis,
    source: 'ai' as const,
    model: config.model || 'unknown',
  };
}
