/**
 * 接单人表单的纯数据契约与纯函数（无 React 依赖）。
 *
 * 从 `pages/Takers.tsx` 逐字提取而来，供页面与 `components/takers/*` 共用，
 * 避免同一份表单契约在两处各写一遍导致走偏。
 */

/** 接单人表单状态 */
export interface TakerFormState {
  wechatName: string;
  wechatId: string;
  taobaoNickname: string;
  registerDate: string;
  /** 实名认证是硬性门槛：必须显式确认为「是」，未确认视为不通过 */
  isRealNameVerified: boolean;
  creditLevel: string;
  weeklyReceiptCount: string;
  monthlyReceiptCount: string;
  avatarScreenshot: string | null;
  securityScreenshot: string | null;
  reviewScreenshot: string | null;
  /** 收款人姓名（返款用） */
  payeeName: string;
  /** 收款账号（支付宝/银行卡号，敏感） */
  payeeAccount: string;
  /** 风控标记（true = 硬拦截快速接单） */
  riskFlag: boolean;
  /** 黑名单/风控原因 */
  blacklistReason: string;
}

/** 空表单初始值（新增 / 成功重置 / 关闭重置复用） */
export const EMPTY_FORM: TakerFormState = {
  wechatName: '',
  wechatId: '',
  taobaoNickname: '',
  registerDate: '',
  isRealNameVerified: false,
  creditLevel: '',
  weeklyReceiptCount: '',
  monthlyReceiptCount: '',
  avatarScreenshot: null,
  securityScreenshot: null,
  reviewScreenshot: null,
  payeeName: '',
  payeeAccount: '',
  riskFlag: false,
  blacklistReason: '',
};

/** 粘贴截图时，按此优先级填入第一个空槽 */
export const PASTE_SLOTS = ['avatarScreenshot', 'securityScreenshot', 'reviewScreenshot'] as const;
export type PasteSlot = (typeof PASTE_SLOTS)[number];

/** 将日期值截断为本地 'YYYY-MM-DD'（避免 toISOString 造成时区偏移） */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 将可选数值字段转为表单字符串 */
export function countToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
