/**
 * 接单人账号资质相关常量（前端）。
 *
 * 合规判定的权威实现在后端 `server/src/utils/takerCompliance.ts`，
 * 列表接口与详情接口都会在记录上附带 `compliance` 字段；
 * 前端只负责展示，不再重复实现规则，避免两份实现走偏。
 */

/** 信誉等级可选值（与后端保持一致，心 < 钻 < 冠，共 15 级） */
export const CREDIT_LEVELS: string[] = [
  '1心', '2心', '3心', '4心', '5心',
  '1钻', '2钻', '3钻', '4钻', '5钻',
  '1冠', '2冠', '3冠', '4冠', '5冠',
];

export type ComplianceStatus = 'qualified' | 'unqualified' | 'incomplete';

/** 后端返回的合规判定结果（前端只读） */
export interface TakerCompliance {
  status: ComplianceStatus;
  fails: string[];
  /**
   * 参考项：每周收货次数是否未超出参考上限。
   * 为空 → null；false 表示超出参考上限，仅供展示标红，不参与 status 判定。
   */
  weeklyOk: boolean | null;
  /**
   * 参考项：每月收货次数是否未超出参考上限。
   * 为空 → null；false 表示超出参考上限，仅供展示标红，不参与 status 判定。
   */
  monthlyOk: boolean | null;
}

/**
 * 每周收货次数参考上限（与 server/src/utils/takerCompliance.ts 保持一致）。
 * 仅用于展示提示，前端不重复实现判定规则。
 */
export const WEEKLY_RECEIPT_MAX = 5;

/**
 * 每月收货次数参考上限（与 server/src/utils/takerCompliance.ts 保持一致）。
 * 仅用于展示提示，前端不重复实现判定规则。
 */
export const MONTHLY_RECEIPT_MAX = 20;

interface ComplianceMetaItem {
  label: string;
  className: string;
}

/** 合规状态展示元数据（className 为语义色 class，形状类由组件补充） */
export const COMPLIANCE_META: Record<ComplianceStatus, ComplianceMetaItem> = {
  qualified: { label: '合格', className: 'badge-success' },
  unqualified: { label: '不合格', className: 'badge-danger' },
  incomplete: { label: '待完善', className: 'badge-warning' },
};

/**
 * 依据后端返回的 compliance 生成「不可接单」的原因文案（前端只读展示，不重复实现判定规则）。
 *
 * 列表接口返回的 compliance 只有 status / fails / weeklyOk / monthlyOk，
 * 因此这里只能基于 status + fails 生成文案。
 *
 * @param compliance 后端返回的合规判定结果；缺省时按「待完善」处理
 * @returns 原因文案；qualified 时返回空字符串
 */
export function describeComplianceReason(compliance?: TakerCompliance | null): string {
  if (!compliance) return '资质信息未返回，无法接单';
  const fails: string[] = compliance.fails || [];
  const detail = fails.join('、');
  if (compliance.status === 'unqualified') {
    return detail || '账号资质不合格';
  }
  if (compliance.status === 'incomplete') {
    return detail || '尚未登记资质信息';
  }
  return '';
}

/**
 * 接单人是否具备接单资格（前端只读展示用，权威判定在服务端）。
 *
 * @param compliance 后端返回的合规判定结果
 * @returns true 表示可接单
 */
export function isTakerOrderable(compliance?: TakerCompliance | null): boolean {
  return compliance?.status === 'qualified';
}
