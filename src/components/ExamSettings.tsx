'use client';

/**
 * 考场设置：考场数量 / 每个考场座位数 + 座位号排列顺序展示。
 * 移植自 .classroom-settings 与 #seatOrderContainer。
 */

interface ExamSettingsProps {
  classroomCount: number;
  seatCount: number;
  onClassroomCountChange: (value: number) => void;
  onSeatCountChange: (value: number) => void;
}

export default function ExamSettings({
  classroomCount,
  seatCount,
  onClassroomCountChange,
  onSeatCountChange,
}: ExamSettingsProps) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-5">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="classroomCount" className="mb-2 block font-bold text-gray-600">
            考场数量：
          </label>
          <input
            id="classroomCount"
            type="number"
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-base"
            value={Number.isFinite(classroomCount) ? classroomCount : ''}
            onChange={(e) => onClassroomCountChange(Math.floor(Number(e.target.value) || 0))}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="seatCount" className="mb-2 block font-bold text-gray-600">
            每个考场座位数：
          </label>
          <input
            id="seatCount"
            type="number"
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-base"
            value={Number.isFinite(seatCount) ? seatCount : ''}
            onChange={(e) => onSeatCountChange(Math.floor(Number(e.target.value) || 0))}
          />
        </div>
      </div>
    </div>
  );
}

/** 座位号排列顺序展示（1..N 色块）；超过 300 个时截断展示，避免超大 DOM。 */
export function SeatOrderChips({ seatCount }: { seatCount: number }) {
  const count = Math.max(0, Math.min(Math.floor(seatCount) || 0, 300));
  const chips = Array.from({ length: count }, (_, i) => i + 1);
  const hidden = Math.floor(seatCount) - count;
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap">
        {chips.map((n) => (
          <div
            key={n}
            className="m-1 inline-flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-sm"
          >
            {n}
          </div>
        ))}
        {hidden > 0 && (
          <div className="m-1 inline-flex h-10 items-center justify-center rounded-md px-2 text-sm text-gray-500">
            …共 {Math.floor(seatCount)} 个座位
          </div>
        )}
      </div>
    </div>
  );
}
