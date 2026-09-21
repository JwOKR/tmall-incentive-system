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
