'use client';

/**
 * 班级识别结果框：上传/切格式/改列后立即反馈识别出的班级、
 * 合并提示与自动编号提示。移植自 #classInfoBox。
 */

import type { RecognitionState } from '@/lib/exam-data';

export default function ClassRecognitionBox({
  recognition,
}: {
  recognition: RecognitionState | null;
}) {
  if (!recognition) return null;
  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2.5 font-bold text-[#2c3e50]">{recognition.title}</div>
      {recognition.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recognition.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm text-[#1a5276]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {recognition.notes.length > 0 && (
        <div className="mt-2.5 space-y-0.5 text-sm leading-7 text-[#856404]">
          {recognition.notes.map((note, i) => (
            <div key={i}>• {note}</div>
          ))}
        </div>
      )}
    </div>
  );
}
