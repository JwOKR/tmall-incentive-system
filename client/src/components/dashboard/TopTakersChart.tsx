import { Bar } from 'react-chartjs-2';

// 接单人TOP5横向柱状图组件
const TopTakersChart = ({ data, chartRef, onBarClick }: { data: any[]; chartRef?: any; onBarClick?: (takerId: string) => void }) => {
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)';
  const textColor = isDark ? 'rgba(203, 213, 225, 0.7)' : 'rgba(100, 116, 139, 0.7)';

  const barColors = [
    'rgba(99, 102, 241, 0.85)',
    'rgba(139, 92, 246, 0.8)',
    'rgba(168, 85, 247, 0.75)',
    'rgba(192, 132, 252, 0.7)',
    'rgba(216, 180, 254, 0.65)',
  ];

  const chartData = {
    labels: data.map((t) => t.wechatName),
    datasets: [
      {
        label: '接单数',
        data: data.map((t) => t.totalOrders),
        backgroundColor: barColors,
        borderColor: barColors.map((c) => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: any, elements: any[]) => {
      if (elements.length > 0 && onBarClick) {
        const index = elements[0].index;
        onBarClick(data[index].id);
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
          label: (ctx: any) => `${ctx.parsed.x} 单`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { size: 11 },
          stepSize: 1,
        },
        beginAtZero: true,
      },
      y: {
        grid: { display: false },
        ticks: {
          color: textColor,
          font: { size: 12, weight: 500 as any },
        },
      },
    },
  };

  return <Bar ref={chartRef} data={chartData} options={options} />;
};

export default TopTakersChart;
