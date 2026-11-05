'use client';

/**
 * 考号构成配置：四行构成项（启停 / 前缀值 / 位数 / 上下调序）+
 * 分隔符 + 实时预览与位数预警。移植自 #examNumberComponents、#examSeparator、.exam-preview。
 */

import type { ExamComponent, ExamComponentType, ExamPreviewInfo } from '@/lib/exam-core';

const COMP_LABELS: Record<ExamComponentType, string> = {
  prefix: '前缀',
  class: '班级',
  room: '考场',
  seat: '座位号',
};

interface ExamNumberConfigProps {
  components: ExamComponent[];
  separator: string;
  onToggle: (index: number) => void;
  onValueChange: (index: number, value: string) => void;
  onWidthChange: (index: number, width: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onSeparatorChange: (value: string) => void;
  preview: ExamPreviewInfo;
}

export default function ExamNumberConfigPanel({
  components,
  separator,
  onToggle,
  onValueChange,
  onWidthChange,
  onMove,
  onSeparatorChange,
  preview,
}: ExamNumberConfigProps) {
  return (
    <div className="mb-5">
      <label className="mb-2 block font-bold text-gray-600">
        考号构成（默认：前缀 + 班级 + 考场 + 座位号，可调整顺序或去掉某些构成项）：
      </label>

      <div>
        {components.map((comp, index) => (
          <div
            key={comp.type}
            className={
              'mb-2 flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 ' +
              (comp.enabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-100 opacity-60')
            }
          >
            <label className="m-0 flex min-w-[96px] items-center gap-1.5 text-[15px] font-bold text-[#2c3e50]">
              <input
                type="checkbox"
                className="h-[18px] w-[18px] cursor-pointer accent-blue-600"
                checked={comp.enabled}
                onChange={() => onToggle(index)}
              />
              {COMP_LABELS[comp.type]}
            </label>

            {comp.type === 'prefix' ? (
              <input
                type="text"
                className="w-[150px] rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[15px]"
                maxLength={10}
                placeholder="如 806 或 2025"
                value={comp.value}
                onChange={(e) => onValueChange(index, e.target.value)}
              />
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-gray-700">
                编号
                <select
                  className="w-auto rounded-md border border-gray-300 bg-white px-2 py-1.5"
                  value={comp.width}
                  onChange={(e) => onWidthChange(index, Number(e.target.value))}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
                位数
              </span>
            )}

            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                title="上移"
                className="min-h-[38px] min-w-[44px] rounded bg-[#95a5a6] px-3.5 py-1.5 text-base leading-none text-white hover:bg-[#7f8c8d]"
                onClick={() => onMove(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                title="下移"
                className="min-h-[38px] min-w-[44px] rounded bg-[#95a5a6] px-3.5 py-1.5 text-base leading-none text-white hover:bg-[#7f8c8d]"
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 mb-0">
        <label htmlFor="examSeparator" className="mb-2 block font-bold text-gray-600">
          考号分隔符（可选，默认不使用）：
        </label>
        <input
          id="examSeparator"
          type="text"
          className="w-full max-w-[280px] rounded-md border border-gray-300 px-3 py-2.5 text-base"
          maxLength={3}
          placeholder="如 - ，留空则各部分直接相连"
          value={separator}
          onChange={(e) => onSeparatorChange(e.target.value)}
        />
      </div>

      <div className="mt-3 rounded-md border border-[#bee5eb] bg-[#eef6fd] px-4 py-3 text-[15px] text-[#0c5460]">
        考号示例：
        <span className="ml-1 text-[17px] font-bold tracking-wider text-[#2c3e50]">
          {preview.text}
        </span>
        {preview.warnings.length > 0 && (
          <div className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-[#856404]">
            {preview.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
