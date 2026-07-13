import prisma from '../utils/db';

// ──────────────────────────────────────
// 默认AI配置
// ──────────────────────────────────────
const AI_DEFAULTS: Record<string, { value: string; label: string }> = {
  ai_api_url: { value: 'https://api.deepseek.com/chat/completions', label: 'API 地址' },
  ai_api_key: { value: '', label: 'API Key' },
  ai_model: { value: 'deepseek-chat', label: '模型名称' },
  ai_max_tokens: { value: '1000', label: '最大Token数' },
  ai_temperature: { value: '0.7', label: '温度 (0-1)' },
};

// ──────────────────────────────────────
// 获取指定分组的所有设置
// ──────────────────────────────────────
export async function getSettings(group: string) {
  const settings = await prisma.systemSetting.findMany({
    where: { group },
    orderBy: { key: 'asc' },
  });

  // 如果是 ai 分组，合并默认值
  if (group === 'ai') {
    const map = new Map(settings.map(s => [s.key, s.value]));
    return Object.entries(AI_DEFAULTS).map(([key, def]) => ({
      key,
      value: map.get(key) || def.value,
      label: def.label,
      group: 'ai',
    }));
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
