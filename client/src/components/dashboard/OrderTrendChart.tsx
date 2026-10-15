import { Line } from 'react-chartjs-2';

// 接单趋势折线图组件
const OrderTrendChart = ({ data, chartRef, onPointClick }: { data: any[]; chartRef?: any; onPointClick?: (date: string) => void }) => {
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)';
  const textColor = isDark ? 'rgba(203, 213, 225, 0.7)' : 'rgba(100, 116, 139, 0.7)';

  const chartData = {
    labels: data.map((d) => d.date.slice(5)),
    datasets: [
      {
        label: '接单数',
        data: data.map((d) => d.orderCount),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: any, elements: any[]) => {
      if (elements.length > 0 && onPointClick) {
        const index = elements[0].index;
        onPointClick(data[index].date);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? '#e2e8f0' : '#1e293b',
        bodyColor: isDark ? '#cbd5e1' : '#475569',
        borderColor: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y} 单`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textColor, font: { size: 11 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { size: 11 },
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  };

  return <Line ref={chartRef} data={chartData} options={options} />;
};

export default OrderTrendChart;
