import { Minus, ArrowUp, ArrowDown } from 'lucide-react';

// Trend arrow component
export function TrendArrow({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === null || previous === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (pct > 0) return <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5 text-xs font-medium"><ArrowUp className="h-3 w-3" />{pct.toFixed(1)}%</span>;
  if (pct < 0) return <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5 text-xs font-medium"><ArrowDown className="h-3 w-3" />{Math.abs(pct).toFixed(1)}%</span>;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}
