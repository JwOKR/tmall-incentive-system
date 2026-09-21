import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog, getClientIp } from '../utils/auditLog';
import { AuthRequest } from '../middleware/auth';
import { parseExcelDate } from '../utils/parseExcelDate';
import {
  CREDIT_LEVELS,
  countScreenshots,
  evaluateTakerCompliance,
} from '../utils/takerCompliance';

/** 单个截图 base64 字符串的最大长度（约 2MB 字符，远小于 body 10mb 上限） */
const MAX_SCREENSHOT_LENGTH = 2_000_000;

/** 截图字段键名 */
const SCREENSHOT_FIELDS = ['avatarScreenshot', 'securityScreenshot', 'reviewScreenshot'] as const;

/** 判断字段是否「已填写」（null / undefined / 空字符串均视为未填写；false 视为已填写） */
function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * 资质是否为「实质性登记」：全空载荷（前端无条件提交全部字段但均为空值）不算登记。
 * 用于决定是否记录 accountInfoUpdatedAt，避免空登记被评定为「已登记」。
 */
function hasSubstantiveAccountInfo(parsed: Record<string, unknown>): boolean {
  if (parsed.registerDate) return true;
  if (parsed.isRealNameVerified === true) return true;
  if (hasValue(parsed.creditLevel)) return true;
  if (parsed.weeklyReceiptCount !== null && parsed.weeklyReceiptCount !== undefined) return true;
  if (parsed.monthlyReceiptCount !== null && parsed.monthlyReceiptCount !== undefined) return true;
  return SCREENSHOT_FIELDS.some((k) => hasValue(parsed[k]));
}

/**
 * 布尔语义解析：'true' / '是' / '1' / 'yes' / 'y' 视为 true，其余为 false。
 */
function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === '是' || s === '1' || s === 'yes' || s === 'y';
}

/**
 * 解析非负整数：非有限数、非整数或负数均视为非法并返回 null（调用方据此忽略该字段）。
 */
function parseNonNegativeInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/** 默认注册时间解析器：空值 → null，非法 → null */
function defaultRegisterDateParser(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 统一解析并净化接单人「账号资质」入参，返回可直接展开进 Prisma `data` 的对象。
 *
 * 仅当请求体中出现资质字段时才纳入结果；非法值静默忽略（不覆盖已有值）。
 *
 * @param body 请求体
 * @param registerDateParser 注册时间解析器（批量导入传 parseExcelDate 以支持 Excel 序列号）
 */
export function parseAccountInfo(
  body: Record<string, unknown>,
  registerDateParser: (value: unknown) => Date | null = defaultRegisterDateParser
): { data: Record<string, unknown>; hasAnyField: boolean } {
  const data: Record<string, unknown> = {};
  let hasAnyField = false;

  // 注册时间
  if (Object.prototype.hasOwnProperty.call(body, 'registerDate')) {
    hasAnyField = true;
    const raw = body.registerDate;
    if (raw === null || raw === undefined || raw === '') {
      data.registerDate = null;
    } else {
      const parsed = registerDateParser(raw);
      if (parsed) data.registerDate = parsed;
    }
  }

  // 实名认证（必须显式确认；未传/空值一律视为否）
  if (Object.prototype.hasOwnProperty.call(body, 'isRealNameVerified')) {
    hasAnyField = true;
    data.isRealNameVerified = parseBooleanFlag(body.isRealNameVerified);
  }

  // 信誉等级：必须命中枚举，否则忽略
  if (Object.prototype.hasOwnProperty.call(body, 'creditLevel')) {
    hasAnyField = true;
    const raw = body.creditLevel;
    if (raw === null || raw === undefined || raw === '') {
      data.creditLevel = null;
    } else if (CREDIT_LEVELS.includes(String(raw))) {
      data.creditLevel = String(raw);
    }
  }

  // 每周 / 每月收货次数：空 → null，非法 → 忽略
  for (const key of ['weeklyReceiptCount', 'monthlyReceiptCount'] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    hasAnyField = true;
    const raw = body[key];
    if (raw === null || raw === undefined || raw === '') {
      data[key] = null;
      continue;
    }
    const parsed = parseNonNegativeInt(raw);
    if (parsed !== null) data[key] = parsed;
  }

  // 三张截图：字符串则存（超限忽略），空 → null
  for (const key of SCREENSHOT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    hasAnyField = true;
    const raw = body[key];
    if (raw === null || raw === undefined || raw === '') {
      data[key] = null;
      continue;
    }
    if (typeof raw === 'string') {
      if (raw.length <= MAX_SCREENSHOT_LENGTH) data[key] = raw;
    }
  }

  return { data, hasAnyField };
}

/**
 * 将解析结果与既有截图字段合并后统计截图数量，保证「仅部分字段更新」时计数正确。
 */
function resolveScreenshotCount(
  parsed: Record<string, unknown>,
  existing?: {
    avatarScreenshot?: string | null;
    securityScreenshot?: string | null;
    reviewScreenshot?: string | null;
  }
): number {
  const pick = (key: 'avatarScreenshot' | 'securityScreenshot' | 'reviewScreenshot') =>
    Object.prototype.hasOwnProperty.call(parsed, key)
      ? (parsed[key] as string | null)
      : (existing?.[key] ?? null);
  return countScreenshots({
    avatarScreenshot: pick('avatarScreenshot'),
    securityScreenshot: pick('securityScreenshot'),
    reviewScreenshot: pick('reviewScreenshot'),
  });
}

/** 提取资质变更的简短描述，供审计日志使用 */
function describeAccountChange(parsed: Record<string, unknown>, hasAnyField: boolean): string {
  if (!hasAnyField) return '';
  const parts: string[] = [];
  if ('registerDate' in parsed) parts.push(`注册时间:${parsed.registerDate ?? '空'}`);
  if ('isRealNameVerified' in parsed) parts.push(`实名:${parsed.isRealNameVerified ? '是' : '否'}`);
  if ('creditLevel' in parsed) parts.push(`信誉:${parsed.creditLevel ?? '空'}`);
  if ('weeklyReceiptCount' in parsed) parts.push(`周收货:${parsed.weeklyReceiptCount ?? '空'}`);
  if ('monthlyReceiptCount' in parsed) parts.push(`月收货:${parsed.monthlyReceiptCount ?? '空'}`);
  const screenshotKeys = SCREENSHOT_FIELDS.filter((k) => k in parsed);
  if (screenshotKeys.length > 0) parts.push(`截图更新:${screenshotKeys.length}张`);
  return parts.join(' ');
}

/** 列表查询所需的显式字段（不含三个 LongText 截图字段，避免响应体积膨胀） */
const LIST_SELECT = {
  id: true,
  wechatName: true,
  wechatId: true,
  status: true,
  totalOrders: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  registerDate: true,
  isRealNameVerified: true,
  creditLevel: true,
  weeklyReceiptCount: true,
  monthlyReceiptCount: true,
  screenshotCount: true,
  accountInfoUpdatedAt: true,
} as const;

// 获取所有接单人
export const getAllTakers = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, search } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { wechatName: { contains: search as string } },
        { wechatId: { contains: search as string } },
      ];
    }

    const [takers, total] = await Promise.all([
      prisma.orderTaker.findMany({
        where,
        select: LIST_SELECT,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.orderTaker.count({ where }),
    ]);

    const list = takers.map((taker: any) => ({
      ...taker,
      compliance: evaluateTakerCompliance(taker),
    }));

    res.json({
      success: true,
      data: {
        list,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching takers:', error);
    res.status(500).json({
      success: false,
      message: '获取接单人列表失败',
    });
  }
};

// 获取单个接单人详情
export const getTakerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taker = await prisma.orderTaker.findUnique({
      where: { id },
      include: {
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!taker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    res.json({
      success: true,
      data: {
        ...taker,
        compliance: evaluateTakerCompliance(taker),
      },
    });
  } catch (error) {
    console.error('Error fetching taker:', error);
    res.status(500).json({
      success: false,
      message: '获取接单人详情失败',
    });
  }
};

// 创建接单人
export const createTaker = async (req: AuthRequest, res: Response) => {
  try {
    const { wechatName, wechatId } = req.body;

    // 检查微信号是否已存在
    const existing = await prisma.orderTaker.findUnique({
      where: { wechatId },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: '该微信号已存在',
      });
    }

    const account = parseAccountInfo(req.body);
    const data: Record<string, unknown> = {
      wechatName,
      wechatId,
      ...account.data,
    };
    if (account.hasAnyField) {
      data.screenshotCount = resolveScreenshotCount(account.data);
    }
    if (hasSubstantiveAccountInfo(account.data)) {
      data.accountInfoUpdatedAt = new Date();
    }

    const taker = await prisma.orderTaker.create({ data: data as any });

    const accountDetail = describeAccountChange(account.data, account.hasAnyField);
    await createAuditLog({
      userId: req.userId,
      action: 'create',
      detail: `创建接单人: ${wechatName} (${wechatId})${accountDetail ? ` | ${accountDetail}` : ''}`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      data: taker,
    });
  } catch (error) {
    console.error('Error creating taker:', error);
    res.status(500).json({
      success: false,
      message: '创建接单人失败',
    });
  }
};

// 更新接单人
export const updateTaker = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { wechatName, wechatId, status } = req.body;

    const existingTaker = await prisma.orderTaker.findUnique({
      where: { id },
    });

    if (!existingTaker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    // 检查微信号是否被其他人使用
    if (wechatId && wechatId !== existingTaker.wechatId) {
      const duplicate = await prisma.orderTaker.findUnique({
        where: { wechatId },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: '该微信号已被使用',
        });
      }
    }

    const account = parseAccountInfo(req.body);
    const data: Record<string, unknown> = {
      wechatName,
      wechatId,
      status,
      ...account.data,
    };
    if (account.hasAnyField) {
      data.screenshotCount = resolveScreenshotCount(account.data, existingTaker);
    }
    if (hasSubstantiveAccountInfo(account.data)) {
      data.accountInfoUpdatedAt = new Date();
    }

    const taker = await prisma.orderTaker.update({
      where: { id },
      data: data as any,
    });

    const accountDetail = describeAccountChange(account.data, account.hasAnyField);
    await createAuditLog({
      userId: req.userId,
      action: 'update',
      detail: `更新接单人: ${wechatName}${accountDetail ? ` | ${accountDetail}` : ''}`,
      ipAddress: getClientIp(req),
    });

    res.json({
      success: true,
      data: taker,
    });
  } catch (error) {
    console.error('Error updating taker:', error);
    res.status(500).json({
      success: false,
      message: '更新接单人失败',
    });
  }
};

// 批量导入接单人
export const batchCreateTakers = async (req: AuthRequest, res: Response) => {
  try {
    const { takers } = req.body;

    if (!Array.isArray(takers) || takers.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供接单人列表',
      });
    }

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const taker of takers) {
      try {
        // 检查微信号是否已存在
        const existing = await prisma.orderTaker.findUnique({
          where: { wechatId: taker.wechatId },
        });

        if (existing) {
          duplicates++;
          continue;
        }

        // 批量导入支持资质字段（截图除外）；此处按记录独立净化，非法值不阻断整批导入
        const account = parseAccountInfo(taker, parseExcelDate as (value: unknown) => Date | null);
        for (const key of SCREENSHOT_FIELDS) {
          delete account.data[key];
        }

        const data: Record<string, unknown> = {
          wechatName: taker.wechatName,
          wechatId: taker.wechatId,
          ...account.data,
        };
        if (hasSubstantiveAccountInfo(account.data)) {
          data.accountInfoUpdatedAt = new Date();
        }

        await prisma.orderTaker.create({ data: data as any });
        success++;
      } catch (error) {
        failed++;
        errors.push(`${taker.wechatName}: ${(error as Error).message}`);
      }
    }

    await createAuditLog({
      action: 'batch_create',
      detail: `批量导入接单人: 成功${success}条，重复${duplicates}条，失败${failed}条`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      data: {
        success,
        failed,
        duplicates,
        errors: errors.slice(0, 10), // 最多返回10条错误
      },
      message: `导入完成: 成功${success}条，重复${duplicates}条，失败${failed}条`,
    });
  } catch (error) {
    console.error('Error batch creating takers:', error);
    res.status(500).json({
      success: false,
      message: '批量导入接单人失败',
    });
  }
};

// 删除接单人
export const deleteTaker = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existingTaker = await prisma.orderTaker.findUnique({
      where: { id },
      include: {
        orders: true,
      },
    });

    if (!existingTaker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    if (existingTaker.orders.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该接单人有关联订单，无法删除',
      });
    }

    await prisma.orderTaker.delete({
      where: { id },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'delete',
      detail: `删除接单人: ${existingTaker.wechatName} (${existingTaker.wechatId})`,
      ipAddress: getClientIp(req),
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Error deleting taker:', error);
    res.status(500).json({
      success: false,
      message: '删除接单人失败',
    });
  }
};
