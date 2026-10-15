import { Clipboard } from 'lucide-react';
import { calcRoi, parsePastedText } from '@/lib/repeatDiscounts';
import type { FormState, GroupData } from '@/lib/repeatDiscounts';

// ─── Group Input Card (reusable) ─────────────────────────────────────────────

export function GroupInputCard({
  label, sublabel, data, onChange, pasteText, onPasteText, onPaste, accent, target, setForm,
}: {
  label: string; sublabel: string; data: GroupData;
  onChange: (field: keyof GroupData, val: string) => void;
  pasteText: string; onPasteText: (t: string) => void; onPaste: () => void;
  accent: 'blue' | 'orange'; target: 'g1' | 'g2';
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const roi = calcRoi(parseFloat(data.grantAmount) || 0, parseFloat(data.paymentAmount) || 0);
  const accentRing = accent === 'blue' ? 'from-blue-500/20 to-blue-500/5' : 'from-orange-500/20 to-orange-500/5';
  const accentText = accent === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400';
  const accentDot = accent === 'blue' ? 'bg-blue-500' : 'bg-orange-500';
  return (
    <div className={`glass-card rounded-2xl p-6 flex-1 min-w-[300px] animate-fade-up bg-gradient-to-br ${accentRing} card-hover`}>
      <div className="mb-5 flex items-center gap-2.5">
        <div className={`w-2.5 h-2.5 rounded-full ${accentDot} ring-2 ring-offset-2 ring-offset-transparent`} style={{ '--tw-ring-color': accent === 'blue' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)' } as React.CSSProperties} />
        <div>
          <h4 className="text-base font-bold text-foreground">{label}</h4>
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
      </div>
      {/* Paste area */}
      <div className="mb-5">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
          <Clipboard className="h-3 w-3" /> 粘贴生意参谋数据
        </label>
        <textarea
          value={pasteText}
          onChange={e => onPasteText(e.target.value)}
          onBlur={onPaste}
          onPaste={e => {
            // 粘贴后立即解析，直接使用剪贴板数据
            const text = e.clipboardData?.getData('text') || '';
            if (text) {
              onPasteText(text);
              const parsed = parsePastedText(text);
              if (Object.keys(parsed).length > 0) {
                // 直接更新表单，不等 state
                setForm(f => ({
                  ...f,
                  [target]: { ...f[target], ...parsed },
                }));
              }
            }
          }}
          placeholder="粘贴数据后自动解析..."
          className="w-full h-20 rounded-xl border border-dashed border-input bg-muted/20 px-3 py-2.5 text-xs resize-none apple-input placeholder:text-muted-foreground/60"
        />
      </div>
      {/* Input fields */}
      <div className="grid grid-cols-2 gap-3">
        {([
          { field: 'grantAmount', label: '发放金额（元）', step: '0.01', ph: '0.00' },
          { field: 'paymentAmount', label: '支付金额（元）', step: '0.01', ph: '0.00' },
          { field: 'paymentBuyers', label: '支付买家数（人）', step: '1', ph: '0' },
          { field: 'paymentItems', label: '支付件数（件）', step: '1', ph: '0' },
        ] as const).map(({ field, label: lbl, step, ph }) => (
          <div key={field}>
            <label className="text-xs font-medium text-muted-foreground">{lbl}</label>
            <input type="number" step={step} value={data[field]} onChange={e => onChange(field, e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" placeholder={ph} />
          </div>
        ))}
      </div>
      {/* ROI display */}
      <div className="mt-5 rounded-xl bg-muted/40 px-4 py-3 flex items-center justify-between border border-border/50">
        <span className="text-xs font-medium text-muted-foreground">实时 ROI</span>
        <span className={`text-xl font-bold tabular-nums ${roi >= 3 ? 'text-green-600 dark:text-green-400' : roi >= 1 ? accentText : 'text-red-600 dark:text-red-400'}`}>
          {roi > 0 ? roi.toFixed(2) : '-'}
        </span>
      </div>
    </div>
  );
}
