import { Clipboard, BarChart3, TrendingUp, FileText } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GroupData {
  grantAmount: string;
  paymentAmount: string;
  paymentBuyers: string;
  paymentItems: string;
}

export interface FormState {
  recordDate: string;
  g1: GroupData;
  g2: GroupData;
}

export interface RecordItem {
  id: string;
  recordDate: string;
  g1: { grantAmount: number; paymentAmount: number; paymentBuyers: number; paymentItems: number };
  g2: { grantAmount: number; paymentAmount: number; paymentBuyers: number; paymentItems: number };
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

export const emptyGroup: GroupData = { grantAmount: '', paymentAmount: '', paymentBuyers: '', paymentItems: '' };

export const emptyForm: FormState = { recordDate: '', g1: { ...emptyGroup }, g2: { ...emptyGroup } };

export const calcRoi = (grant: number, pay: number) => (grant > 0 ? (pay / grant) : 0);

export const calcTotals = (r: RecordItem) => ({
  grant: r.g1.grantAmount + r.g2.grantAmount,
  pay: r.g1.paymentAmount + r.g2.paymentAmount,
  roi: calcRoi(r.g1.grantAmount + r.g2.grantAmount, r.g1.paymentAmount + r.g2.paymentAmount),
});

export const fmt = (v: number) => Number(v.toFixed(2)) % 1 === 0 ? Math.round(v).toString() : v.toFixed(2);
export const fmtInt = (v: number) => Math.round(v).toString();

export const TABS = [
  { key: 'entry', label: '登记数据', icon: Clipboard },
  { key: 'history', label: '历史数据', icon: BarChart3 },
  { key: 'chart', label: '趋势图表', icon: TrendingUp },
  { key: 'preview', label: '日报预览', icon: FileText },
] as const;

export type TabKey = typeof TABS[number]['key'];

// Smart paste: parse 生意参谋 pasted text
export function parsePastedText(text: string): Partial<GroupData> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: Partial<GroupData> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('发放金额') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9.\-]/g, '');
      if (val) result.grantAmount = val;
    } else if (line.includes('支付金额') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9.\-]/g, '');
      if (val) result.paymentAmount = val;
    } else if (line.includes('支付买家数') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9]/g, '');
      if (val) result.paymentBuyers = val;
    } else if (line.includes('支付件数') && i + 1 < lines.length) {
      const val = lines[i + 1].replace(/[^0-9]/g, '');
      if (val) result.paymentItems = val;
    }
  }
  return result;
}
