import prisma from '../utils/db';
import {
  DEFAULT_REVIEW_COMMISSION,
  REVIEW_COMMISSION_SETTING_KEY,
  parseReviewCommissionSetting,
} from '../utils/reviewCommission';

// ──────────────────────────────────────
// 默认AI配置
// ──────────────────────────────────────
const AI_DEFAULTS: Record<string, { value: string; label: string }> = {
  ai_api_url: { value: 'https://api.deepseek.com/chat/completions', label: 'API 地址' },
  ai_api_key: { value: '', label: 'API Key' },
  ai_model: { value: 'deepseek-chat', label: '模型名称' },
  ai_max_tokens: { value: '1500', label: '最大Token数' },
  ai_temperature: { value: '0.7', label: '温度 (0-1)' },
};

// ──────────────────────────────────────
// 超期未返款预警天数：系统设置键与默认值
// ──────────────────────────────────────
/** 保存「超期未返款预警天数」的系统设置键 */
export const REFUND_ALERT_DAYS_KEY = 'refund_alert_days';
/** 默认预警天数（天）：超过该天数仍未返款的订单进入「超期未返款」看板 */
export const DEFAULT_REFUND_ALERT_DAYS = 30;

// ──────────────────────────────────────
// 默认通用配置（group = 'general'）
// 这些键在数据库还没有对应行时，也会由 getSettings('general') 合并出来，
// 保证界面能显示默认值（默认好评返佣金额 = 3 元、默认超期未返款预警天数 = 30 天）。
// ──────────────────────────────────────
const GENERAL_DEFAULTS: Record<string, { value: string; label: string }> = {
  [REVIEW_COMMISSION_SETTING_KEY]: {
    value: String(DEFAULT_REVIEW_COMMISSION),
    label: '好评返佣默认金额（元）',
  },
  [REFUND_ALERT_DAYS_KEY]: {
    value: String(DEFAULT_REFUND_ALERT_DAYS),
    label: '超期未返款预警天数（天）',
  },
};

// ──────────────────────────────────────
// 获取指定分组的所有设置
// ──────────────────────────────────────
export async function getSettings(group: string) {
  // 显式标注行类型：Prisma Client 未生成时 findMany 的回调参数会退化为隐式 any（noImplicitAny 报错）
  const settings: { key: string; value: string; group: string }[] = await prisma.systemSetting.findMany({
    where: { group },
    orderBy: { key: 'asc' },
  });

  // 如果是 ai 分组，保持历史行为：只返回默认表里的键（按默认表顺序），值优先用库里的
  if (group === 'ai') {
    const map = new Map(settings.map(s => [s.key, s.value]));
    return Object.entries(AI_DEFAULTS).map(([key, def]) => ({
      key,
      value: map.get(key) || def.value,
      label: def.label,
      group: 'ai',
    }));
  }

  // general 分组：默认值与数据库行合并，保证数据库还没有该行时界面也能显示默认值。
  // 硬约束：数据库里存在、但不在默认表里的历史键必须原样保留，否则会让老设置项凭空消失。
  if (group === 'general') {
    const map = new Map(settings.map(s => [s.key, s.value]));
    const merged: { key: string; value: string; label?: string; group: string }[] =
      Object.entries(GENERAL_DEFAULTS).map(([key, def]) => ({
        key,
        // 用 ?? 而非 ||：空字符串是用户显式保存的值，不能回落到默认值
        value: map.get(key) ?? def.value,
        label: def.label,
        group: 'general',
      }));
    for (const s of settings) {
      if (!(s.key in GENERAL_DEFAULTS)) {
        merged.push({ key: s.key, value: s.value, group: 'general' });
      }
    }
    return merged;
  }

  return settings;
}

// ──────────────────────────────────────
// 批量更新设置
// ──────────────────────────────────────
export async function updateSettings(updates: { key: string; value: string }[]) {
  const operations = updates.map(({ key, value }) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, group: key.startsWith('ai_') ? 'ai' : 'general' },
    })
  );

  await prisma.$transaction(operations);
  return { success: true, updated: updates.length };
}

// ──────────────────────────────────────
// 获取单个设置值（供Service内部调用）
// ──────────────────────────────────────
export async function getSettingValue(key: string): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

// ──────────────────────────────────────
// 获取「好评返佣默认金额」（元）
// 供 orderService 在标记「已好评」时取值；缺省 / 非法时回退默认 3。
// ──────────────────────────────────────
export async function getReviewCommissionAmount(): Promise<number> {
  const raw = await getSettingValue(REVIEW_COMMISSION_SETTING_KEY);
  return parseReviewCommissionSetting(raw);
}

/**
 * 把系统设置里保存的「超期未返款预警天数」原始值解析为整数天数。
 *
 * 回退规则：null / undefined / 空串 / 非有限数字 / <= 0 一律回退 DEFAULT_REFUND_ALERT_DAYS（30）。
 * 合法值取整后夹在 1..365（避免 0 天或超大值把看板查成全量/空集）。
 *
 * @param raw 系统设置原始值（字符串 / 数字 / null / undefined）
 * @returns 解析后的天数（1..365）
 */
export function parseRefundAlertDays(raw: unknown): number {
  if (raw === null || raw === undefined) return DEFAULT_REFUND_ALERT_DAYS;

  const trimmed = String(raw).trim();
  if (trimmed === '') return DEFAULT_REFUND_ALERT_DAYS;

  const value = Number(trimmed);
  // Number('') 已在上面拦截；!Number.isFinite 覆盖 NaN / Infinity / -Infinity
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_REFUND_ALERT_DAYS;

  const intValue = Math.round(value);
  return Math.min(365, Math.max(1, intValue));
}

/**
 * 获取「超期未返款预警天数」（天）；缺省 / 非法时回退默认 30。
 * 供 remindController.getRefundAlerts 在未显式传 days 时取值。
 */
export async function getRefundAlertDays(): Promise<number> {
  return parseRefundAlertDays(await getSettingValue(REFUND_ALERT_DAYS_KEY));
}

// ──────────────────────────────────────
// 获取AI配置（合并数据库+环境变量fallback）
// ──────────────────────────────────────
export async function getAIConfig() {
  const keys = Object.keys(AI_DEFAULTS);
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(settings.map(s => [s.key, s.value]));

  return {
    apiUrl: map.get('ai_api_url') || process.env.DEEPSEEK_API_URL || AI_DEFAULTS.ai_api_url.value,
    apiKey: map.get('ai_api_key') || process.env.DEEPSEEK_API_KEY || '',
    model: map.get('ai_model') || process.env.DEEPSEEK_MODEL || AI_DEFAULTS.ai_model.value,
    maxTokens: parseInt(map.get('ai_max_tokens') || '1000'),
    temperature: parseFloat(map.get('ai_temperature') || '0.7'),
  };
}
