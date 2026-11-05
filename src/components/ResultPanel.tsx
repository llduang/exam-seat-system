'use client';

/**
 * 考场分配结果面板：预览 / 下载 / 统计 三个标签页。
 * 移植自 #resultContainer 及三个 tab-content。导出动作由 page 注入。
 */

import type { ExamSystem } from '@/hooks/use-exam-system';
import ClassStatsChart from './ClassStatsChart';

interface ResultPanelProps {
  sys: ExamSystem;
  onDownloadTotal: () => void;
  onDownloadClass: (className: string) => void;
  onDownloadRoom: (room: number) => void;
  onDownloadSeatPrint: () => void;
  onDownloadComplete: () => void;
  onDownloadPdf: () => void;
}

const GREEN_BTN =
  'inline-block rounded bg-[#27ae60] px-5 py-2.5 text-white transition-colors hover:bg-[#219653]';

export default function ResultPanel({
  sys,
  onDownloadTotal,
  onDownloadClass,
  onDownloadRoom,
  onDownloadSeatPrint,
  onDownloadComplete,
  onDownloadPdf,
}: ResultPanelProps) {
  const result = sys.result;
  if (!result) return null;

  const tabs: { id: 'preview' | 'download' | 'statistics'; label: string }[] = [
    { id: 'preview', label: '预览' },
    { id: 'download', label: '下载' },
    { id: 'statistics', label: '统计' },
  ];

  const classButtons = result.classNames.filter((c) =>
    result.assignments.some((a) => a.class === c),
  );

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-xl font-bold text-[#2c3e50]">考场分配结果</h2>

      <div className="mb-5 flex border-b border-gray-300">
        {tabs.map((tab) => {
          const active = sys.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={
                'mr-1.5 rounded-t-lg border border-b-0 px-5 py-2.5 ' +
                (active
                  ? '-mb-px border-b-white border-gray-300 bg-white font-medium text-blue-700'
                  : 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200')
              }
              onClick={() => sys.setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {sys.activeTab === 'preview' && (
        <div>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr>
                  {['姓名', '考场号', '座位号', '班级', '考号'].map((h) => (
                    <th
                      key={h}
                      className="border border-gray-300 bg-gray-100 px-3 py-2.5 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-gray-50">
                {result.assignments.map((a, i) => (
                  <tr key={i}>
                    <td className="border border-gray-300 px-3 py-2.5">{a.name}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{a.classroom}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{a.seat}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{a.class}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{a.examNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sys.remainingUnassigned.length > 0 && (
            <div className="mt-5 rounded-md border border-[#ffeeba] bg-[#fff3cd] p-4">
              <h4 className="m-0 font-bold text-[#856404]">未分配学生名单：</h4>
              <div className="max-h-[200px] overflow-y-auto">
                {sys.remainingUnassigned.map((s, i) => (
                  <div key={i} className="py-0.5 text-sm">
                    {s.class} - {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sys.activeTab === 'download' && (
        <div>
          <h3 className="text-lg font-bold text-[#2c3e50]">下载分配表：</h3>
          <div className="mt-4 flex flex-wrap gap-3.5">
            <button type="button" className={GREEN_BTN} onClick={onDownloadTotal}>
              下载总表
            </button>
            {classButtons.map((className) => (
              <button
                key={className}
                type="button"
                className={GREEN_BTN}
                onClick={() => onDownloadClass(className)}
              >
                下载{className}分配表
              </button>
            ))}
            {sys.usedRooms.map((room) => (
              <button
                key={room}
                type="button"
                className={GREEN_BTN}
                onClick={() => onDownloadRoom(room)}
              >
                下载第{room}考场分配表
              </button>
            ))}
            <button type="button" className={GREEN_BTN} onClick={onDownloadSeatPrint}>
              下载座位表打印
            </button>
          </div>

          <h3 className="mt-6 text-lg font-bold text-[#2c3e50]">高级下载选项：</h3>
          <div className="mt-4">
            <button
              type="button"
              className="rounded bg-[#3498db] px-6 py-3 text-base text-white transition-colors hover:bg-[#2980b9]"
              onClick={onDownloadComplete}
            >
              下载完整分配表（包含所有工作表）
            </button>
          </div>

          <h3 className="mt-6 text-lg font-bold text-[#2c3e50]">打印下载选项：</h3>
          <div className="mt-4">
            <button
              type="button"
              className="rounded bg-[#e74c3c] px-6 py-3 text-base text-white transition-colors hover:bg-[#d62c1a]"
              onClick={onDownloadPdf}
            >
              下载考场座位表PDF（用于打印）
            </button>
          </div>
        </div>
      )}

      {sys.activeTab === 'statistics' && (
        <div className="rounded-lg border border-gray-200 bg-[#f8f9fa] p-5">
          <h3 className="m-0 border-b border-gray-300 pb-2.5 font-bold text-[#495057]">
            班级人数统计
          </h3>

          <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <h4 className="m-0 text-sm font-medium text-[#6c757d]">总班级数</h4>
              <div className="text-3xl font-bold text-blue-500">{sys.classStats.length}</div>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <h4 className="m-0 text-sm font-medium text-[#6c757d]">总学生数</h4>
              <div className="text-3xl font-bold text-blue-500">
                {sys.classStats.reduce((s, x) => s + x.total, 0)}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <h4 className="m-0 text-sm font-medium text-[#6c757d]">已分配座位</h4>
              <div className="text-3xl font-bold text-blue-500">
                {sys.classStats.reduce((s, x) => s + x.assigned, 0)}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <h4 className="m-0 text-sm font-medium text-[#6c757d]">未分配座位</h4>
              <div className="text-3xl font-bold text-blue-500">
                {sys.classStats.reduce((s, x) => s + x.unassigned, 0)}
              </div>
            </div>
          </div>

          <ClassStatsChart
            labels={result.classNames}
            totalData={sys.classStats.map((x) => x.total)}
            assignedData={sys.classStats.map((x) => x.assigned)}
            unassignedData={sys.classStats.map((x) => x.unassigned)}
          />

          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['班级', '总人数', '已分配', '未分配', '分配率'].map((h) => (
                    <th
                      key={h}
                      className="border border-gray-300 bg-gray-100 px-3 py-2.5 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-gray-50">
                {sys.classStats.map((stat) => (
                  <tr key={stat.className}>
                    <td className="border border-gray-300 px-3 py-2.5">{stat.className}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{stat.total}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{stat.assigned}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{stat.unassigned}</td>
                    <td className="border border-gray-300 px-3 py-2.5">{stat.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
