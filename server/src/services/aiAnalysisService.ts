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
  return prisma.repeatDiscountAnalysis.upsert({
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

  return `你是一位资深电商数据分析师，专注于天猫/淘宝回头客立减活动的数据分析。请根据以下数据生成专业的分析报告。

## 当前日期数据
日期：${data.recordDate}

### 人群1：近2年已购用户人群
- 发放金额：¥${fmt(data.g1GrantAmount)}
- 支付金额：¥${fmt(data.g1PaymentAmount)}
- 支付买家数：${data.g1PaymentBuyers} 人
- 支付件数：${data.g1PaymentItems} 件
- ROI：${g1R}

### 人群2：365天内有购买且60天无购买人群
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
请从以下6个维度进行分析，每个维度给出具体的数据洞察和建议：

1. **综合评估**：整体活动效果如何？ROI处于什么水平？
2. **人群效率分析**：哪个人群的投放效率更高？为什么？
3. **趋势分析**：与前一天相比，各项指标的变化趋势说明什么？
4. **成本效率**：每获取一个支付买家的成本是多少？是否合理？
5. **策略建议**：基于数据，应该调整什么策略？
6. **风险提示**：当前数据中有哪些需要关注的风险信号？

请用简洁专业的语言回答，每个维度2-3句话，总计不超过300字。`;
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
          content: '你是一位资深电商数据分析师，专注于天猫/淘宝回头客立减活动的数据分析。请用专业、简洁、数据驱动的语言进行分析。',
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
  const sections = [
    '综合评估', '人群效率分析', '趋势分析', '成本效率', '策略建议', '风险提示'
  ];

  const result: { title: string; content: string }[] = [];

  for (const title of sections) {
    // 匹配 "1. 综合评估" 或 "**综合评估**" 等格式
    const patterns = [
      new RegExp(`${title}[：:]\\s*([\\s\\S]*?)(?=\\d+\\.|\\*\\*[^*]|$)`, 'i'),
      new RegExp(`\\*\\*${title}\\*\\*[：:]?\\s*([\\s\\S]*?)(?=\\d+\\.|\\*\\*[^*]|$)`, 'i'),
      new RegExp(`${title}[：:]\\s*(.+?)(?=\\n\\d+|\\n\\*\\*|$)`, 'i'),
    ];

    let content = '';
    for (const pattern of patterns) {
      const match = rawText.match(pattern);
      if (match) {
        content = match[1].trim().replace(/\n+/g, ' ');
        break;
      }
    }

    if (!content) {
      // 如果没匹配到，尝试按段落分割
      const lines = rawText.split('\n').filter(l => l.trim());
      const idx = lines.findIndex(l => l.includes(title));
      if (idx >= 0 && idx < lines.length - 1) {
        content = lines[idx + 1]?.trim() || lines[idx].replace(title, '').trim();
      }
    }

    result.push({
      title,
      content: content || `${title}分析数据暂不可用`,
    });
  }

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
    return `第${i + 1}天 (${r.recordDate.toISOString().slice(0, 10)}): 发放¥${fmt(tg)}, 支付¥${fmt(tp)}, ROI=${roi}, G1-ROI=${g1r}, G2-ROI=${g2r}, 买家数=${buyers}`;
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

  return `你是一位资深电商数据分析师，专注于天猫/淘宝回头客立减活动的数据分析。请根据以下${days}天的全部数据，生成一份全面的总数据分析报告。

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

## 人群1（近2年已购用户人群）汇总
- 累计发放：¥${fmt(summary.g1GrantAmount)}
- 累计支付：¥${fmt(summary.g1PaymentAmount)}
- 累计ROI：${summary.g1ROI.toFixed(2)}
- 累计买家数：${summary.g1PaymentBuyers} 人

## 人群2（365天内有购买且60天无购买人群）汇总
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
请从以下6个维度进行全面分析，每个维度给出具体的数据洞察和建议：

1. **整体概况**：${days}天的整体投放效果如何？累计ROI是否达标？日均投入产出比如何？
2. **趋势分析**：ROI的变化趋势说明什么？是否存在周期性波动？最高/最低ROI日的原因推测？
3. **人群效率对比**：两个人群的累计ROI差异说明什么？哪个人群更值得持续投入？
4. **成本效率分析**：人均获取成本、件均成本是否合理？与行业平均水平对比如何？
5. **策略优化建议**：基于全部数据趋势，接下来的投放策略应如何调整？人群预算如何分配？
6. **风险预警**：数据中是否存在需要关注的风险信号？哪些指标出现恶化趋势？

请用简洁专业的语言回答，每个维度3-4句话，总计不超过500字。`;
}

// ──────────────────────────────────────
// 解析总体分析（与单日相同的section结构）
// ──────────────────────────────────────
function parseOverallAnalysis(rawText: string) {
  const sections = [
    '整体概况', '趋势分析', '人群效率对比', '成本效率分析', '策略优化建议', '风险预警'
  ];

  const result: { title: string; content: string }[] = [];

  for (const title of sections) {
    const patterns = [
      new RegExp(`${title}[：:]\\s*([\\s\\S]*?)(?=\\d+\\.|\\*\\*[^*]|$)`, 'i'),
      new RegExp(`\\*\\*${title}\\*\\*[：:]?\\s*([\\s\\S]*?)(?=\\d+\\.|\\*\\*[^*]|$)`, 'i'),
      new RegExp(`${title}[：:]\\s*(.+?)(?=\\n\\d+|\\n\\*\\*|$)`, 'i'),
    ];

    let content = '';
    for (const pattern of patterns) {
      const match = rawText.match(pattern);
      if (match) {
        content = match[1].trim().replace(/\n+/g, ' ');
        break;
      }
    }

    if (!content) {
      const lines = rawText.split('\n').filter(l => l.trim());
      const idx = lines.findIndex(l => l.includes(title));
      if (idx >= 0 && idx < lines.length - 1) {
        content = lines[idx + 1]?.trim() || lines[idx].replace(title, '').trim();
      }
    }

    result.push({ title, content: content || `${title}分析数据暂不可用` });
  }

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
