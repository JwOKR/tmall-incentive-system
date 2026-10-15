import { Doughnut } from 'react-chartjs-2';

// 返款状态环形图组件
function RefundStatusChart({ data }: { data: any[] }) {
  const isDark = document.documentElement.classList.contains('dark');

  const totalRefunded = data.reduce((sum, d) => sum + (d.refundedCount || 0), 0);
  const totalPending = data.reduce((sum, d) => sum + (d.pendingCount || 0), 0);

  const chartData = {
    labels: ['已返款', '待返款'],
    datasets: [
      {
        data: [totalRefunded, totalPending],
        backgroundColor: ['#10b981', '#f59e0b'],
        borderColor: isDark ? ['#0d9669', '#d97706'] : ['#059669', '#d97706'],
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
          color: isDark ? '#cbd5e1' : '#475569',
          font: { size: 12 },
        },
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? '#e2e8f0' : '#1e293b',
        bodyColor: isDark ? '#cbd5e1' : '#475569',
        borderColor: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        callbacks: {
          label: (ctx: any) => {
            const total = totalRefunded + totalPending;
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
            return `${ctx.label}: ${ctx.parsed} 单 (${pct}%)`;
          },
        },
      },
    },
  };

  return <Doughnut data={chartData} options={options} />;
}

export default RefundStatusChart;
