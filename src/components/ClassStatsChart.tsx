'use client';

/**
 * 班级人数统计图表（Chart.js 堆叠柱状图）。
 * 移植自 updateChart；Chart.js 按需动态加载。
 */

import { useEffect, useRef } from 'react';

interface ClassStatsChartProps {
  labels: string[];
  totalData: number[];
  assignedData: number[];
  unassignedData: number[];
}

export default function ClassStatsChart({
  labels,
  totalData,
  assignedData,
  unassignedData,
}: ClassStatsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let chart: { destroy(): void } | null = null;

    (async () => {
      const Chart = (await import('chart.js/auto')).default;
      const canvas = canvasRef.current;
      if (disposed || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '已分配',
              data: assignedData,
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
            },
            {
              label: '未分配',
              data: unassignedData,
              backgroundColor: 'rgba(255, 99, 132, 0.6)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              title: { display: true, text: '班级' },
            },
            y: {
              stacked: true,
              title: { display: true, text: '学生人数' },
              beginAtZero: true,
            },
          },
          plugins: {
            title: {
              display: true,
              text: '各班级座位分配情况',
            },
            tooltip: {
              callbacks: {
                footer(tooltipItems: { dataIndex: number }[]) {
                  const index = tooltipItems[0].dataIndex;
                  const total = totalData[index];
                  const assigned = assignedData[index];
                  const rate = total > 0 ? ((assigned / total) * 100).toFixed(1) : '0';
                  return `分配率: ${rate}%`;
                },
              },
            },
          },
        },
      });
    })();

    return () => {
      disposed = true;
      if (chart) chart.destroy();
    };
  }, [labels, totalData, assignedData, unassignedData]);

  return (
    <div className="relative mt-5 h-[300px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
