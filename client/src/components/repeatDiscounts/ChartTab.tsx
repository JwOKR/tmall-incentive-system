import { BarChart3, TrendingUp } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip as ChartTooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { calcTotals } from '@/lib/repeatDiscounts';
import type { RecordItem } from '@/lib/repeatDiscounts';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ChartTooltip, Legend, Filler);

// ─── Tab: Chart ──────────────────────────────────────────────────────────

export function ChartTab({
  allRecords, filteredChartRecords,
  barChartData, barChartOptions, lineChartData, lineChartOptions,
  chartStartDate, setChartStartDate, chartEndDate, setChartEndDate,
}: {
  allRecords: RecordItem[];
  filteredChartRecords: RecordItem[];
  barChartData: any;
  barChartOptions: any;
  lineChartData: any;
  lineChartOptions: any;
  chartStartDate: string;
  setChartStartDate: (v: string) => void;
  chartEndDate: string;
  setChartEndDate: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      {allRecords.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground glass-card rounded-2xl">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无数据，请先在「登记数据」页面录入</p>
        </div>
      ) : (
        <>
          {/* 图表日期筛选 */}
          <div className="flex items-center gap-3 flex-wrap animate-fade-up">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">起始</label>
              <input type="date" value={chartStartDate} onChange={e => setChartStartDate(e.target.value)}
                className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">结束</label>
              <input type="date" value={chartEndDate} onChange={e => setChartEndDate(e.target.value)}
                className="rounded-xl border border-input bg-background/50 px-3 py-2 text-sm apple-input" />
            </div>
            <div className="flex gap-1.5 ml-1">
              {[
                { label: '近7天', days: 7 },
                { label: '近14天', days: 14 },
                { label: '近30天', days: 30 },
                { label: '全部', days: 0 },
              ].map(q => (
                <button key={q.label} onClick={() => {
                  if (q.days === 0) { setChartStartDate(''); setChartEndDate(''); }
                  else {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - q.days + 1);
                    setChartStartDate(start.toISOString().slice(0, 10));
                    setChartEndDate(end.toISOString().slice(0, 10));
                  }
                }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border/60 bg-background/40 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all apple-btn">
                  {q.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredChartRecords.length} 条数据</span>
          </div>

          <div className="glass-card rounded-2xl p-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-badge bg-red-500/15 text-red-600 dark:text-red-400"><BarChart3 className="h-4 w-4" /></div>
              <h3 className="text-base font-bold">发放/支付金额 & 合计ROI趋势</h3>
            </div>
            <div style={{ height: 400 }}>
              <Bar data={{
                labels: filteredChartRecords.map(r => r.recordDate.slice(5)),
                datasets: [
                  { ...barChartData.datasets[0], data: filteredChartRecords.map(r => calcTotals(r).grant) },
                  { ...barChartData.datasets[1], data: filteredChartRecords.map(r => calcTotals(r).pay) },
                  { ...barChartData.datasets[2], data: filteredChartRecords.map(r => calcTotals(r).roi) },
                ],
              }} options={barChartOptions} />
            </div>
          </div>
          <div className="glass-card rounded-2xl p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-badge bg-orange-500/15 text-orange-600 dark:text-orange-400"><TrendingUp className="h-4 w-4" /></div>
              <h3 className="text-base font-bold">分人群ROI趋势对比</h3>
            </div>
            <div style={{ height: 400 }}>
              <Line data={{
                labels: filteredChartRecords.map(r => r.recordDate.slice(5)),
                datasets: [
                  { ...lineChartData.datasets[0], data: filteredChartRecords.map(r => r.g1.grantAmount > 0 ? r.g1.paymentAmount / r.g1.grantAmount : 0) },
                  { ...lineChartData.datasets[1], data: filteredChartRecords.map(r => r.g2.grantAmount > 0 ? r.g2.paymentAmount / r.g2.grantAmount : 0) },
                  { ...lineChartData.datasets[2], data: filteredChartRecords.map(r => calcTotals(r).roi) },
                ],
              }} options={lineChartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
