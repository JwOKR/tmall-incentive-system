import prisma from '../utils/db';
import { getAIConfig } from './systemSettingService';

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
- 前一天近2年用户ROI：${pG1R}，60天沉睡用户ROI：${pG2R}
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

### 人群1：近2年已购用户
- 发放金额：¥${fmt(data.g1GrantAmount)}
- 支付金额：¥${fmt(data.g1PaymentAmount)}
- 支付买家数：${data.g1PaymentBuyers} 人
- 支付件数：${data.g1PaymentItems} 件
- ROI：${g1R}

### 人群2：60天沉睡用户（365天内有购买且60天无购买）
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

  return {
    recordDate: record.recordDate,
    sections,
    rawText: rawAnalysis,
    source: 'ai' as const,
    model: config.model || 'unknown',
  };
}
