import { Calendar, Loader2, Save, X } from 'lucide-react';
import { emptyForm, fmt } from '@/lib/repeatDiscounts';
import type { FormState } from '@/lib/repeatDiscounts';
import { GroupInputCard } from './GroupInputCard';

// ─── Tab: Entry ──────────────────────────────────────────────────────────

export function EntryTab({
  form, setForm, pasteText1, setPasteText1, pasteText2, setPasteText2,
  onPaste, onSave, createPending, updatePending, editingId, setEditingId,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pasteText1: string;
  setPasteText1: (t: string) => void;
  pasteText2: string;
  setPasteText2: (t: string) => void;
  onPaste: (target: 'g1' | 'g2', text: string) => void;
  onSave: () => void;
  createPending: boolean;
  updatePending: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center gap-3 animate-fade-up">
        <div className="flex items-center gap-2.5">
          <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400">
            <Calendar className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          </div>
          <label className="text-sm font-semibold">登记日期</label>
        </div>
        <input type="date" value={form.recordDate}
          onChange={e => setForm(f => ({ ...f, recordDate: e.target.value }))}
          className="rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm apple-input" />
      </div>

      {/* Two group cards */}
      <div className="flex flex-col lg:flex-row gap-5">
        <GroupInputCard
          label="近2年已购用户人群"
          sublabel="近2年内有过购买行为的用户人群"
          data={form.g1}
          accent="blue"
          target="g1"
          onChange={(field, val) => setForm(f => ({ ...f, g1: { ...f.g1, [field]: val } }))}
          pasteText={pasteText1}
          onPasteText={setPasteText1}
          onPaste={() => onPaste('g1', pasteText1)}
          setForm={setForm}
        />
        <GroupInputCard
          label="365天内有购买且60天无购买人群"
          sublabel="365天内有购买且60天无购买的用户人群"
          data={form.g2}
          accent="orange"
          target="g2"
          onChange={(field, val) => setForm(f => ({ ...f, g2: { ...f.g2, [field]: val } }))}
          pasteText={pasteText2}
          onPasteText={setPasteText2}
          onPaste={() => onPaste('g2', pasteText2)}
          setForm={setForm}
        />
      </div>

      {/* Summary row */}
      <div className="glass-card rounded-2xl p-5 animate-fade-up flex items-center gap-8 flex-wrap" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计发放</div>
          <span className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{fmt((parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0))}</span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计支付</div>
          <span className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt((parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0))}</span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium text-muted-foreground">合计ROI</div>
          {(() => {
            const tg = (parseFloat(form.g1.grantAmount) || 0) + (parseFloat(form.g2.grantAmount) || 0);
            const tp = (parseFloat(form.g1.paymentAmount) || 0) + (parseFloat(form.g2.paymentAmount) || 0);
            const roi = tg > 0 ? tp / tg : 0;
            return <span className={`text-lg font-bold tabular-nums ${roi >= 3 ? 'text-green-600 dark:text-green-400' : roi >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{tg > 0 ? roi.toFixed(2) : '-'}</span>;
          })()}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: '150ms' }}>
        <button onClick={onSave}
          disabled={createPending || updatePending}
          className="apple-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed">
          {(createPending || updatePending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editingId ? '保存修改' : '保存登记'}
        </button>
        <button onClick={() => { setForm(emptyForm); setPasteText1(''); setPasteText2(''); setEditingId(null); }}
          className="apple-btn inline-flex items-center gap-2 rounded-xl border border-border bg-background/50 px-5 py-3 text-sm font-medium hover:bg-accent">
          <X className="h-4 w-4" /> 清空
        </button>
      </div>
    </div>
  );
}
