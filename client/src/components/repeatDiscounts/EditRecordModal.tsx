import { Loader2, Pencil, Save, X } from 'lucide-react';
import type { FormState } from '@/lib/repeatDiscounts';

// ─── Edit Modal (历史数据页) ─────────────────────────────────────────────

export function EditRecordModal({
  show, onClose, editForm, setEditForm, onSave, pending,
}: {
  show: boolean;
  onClose: () => void;
  editForm: FormState;
  setEditForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  pending: boolean;
}) {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400"><Pencil className="h-4 w-4" /></div>
            <h3 className="text-lg font-bold">编辑记录</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent apple-btn"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-5">
          <label className="text-sm font-medium">日期</label>
          <input type="date" value={editForm.recordDate}
            onChange={e => setEditForm(f => ({ ...f, recordDate: e.target.value }))}
            className="mt-1.5 w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm apple-input" />
        </div>
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />近2年已购用户人群</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g1.grantAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g1.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g1.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g1.paymentItems} onChange={e => setEditForm(f => ({ ...f, g1: { ...f.g1, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
            </div>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" />365天内有购买且60天无购买人群</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">发放金额</label><input type="number" step="0.01" value={editForm.g2.grantAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, grantAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付金额</label><input type="number" step="0.01" value={editForm.g2.paymentAmount} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentAmount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付买家数</label><input type="number" value={editForm.g2.paymentBuyers} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentBuyers: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
              <div><label className="text-xs text-muted-foreground">支付件数</label><input type="number" value={editForm.g2.paymentItems} onChange={e => setEditForm(f => ({ ...f, g2: { ...f.g2, paymentItems: e.target.value } }))} className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" /></div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onSave} disabled={pending}
            className="apple-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/25 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存修改
          </button>
          <button onClick={onClose} className="apple-btn inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-accent">取消</button>
        </div>
      </div>
    </div>
  );
}
