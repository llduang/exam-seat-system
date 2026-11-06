'use client';

/**
 * 考场设置：学生总人数 + 考场数量 / 每个考场座位数 + 座位号排列顺序展示。
 * 座位数在用户未手动修改时按“总人数 ÷ 考场数”向下取整自动推荐（可直接改）。
 * 移植自 .classroom-settings 与 #seatOrderContainer。
 */

interface ExamSettingsProps {
  classroomCount: number;
  seatCount: number;
  /** 学生总人数（导入名单识别成功后；0 表示尚未识别） */
  totalStudents: number;
  /** 每考场座位数是否被用户手动修改过（true 后不再自动推荐） */
  seatCountEdited: boolean;
  /** 当前推荐每考场座位数（0 表示暂无有效推荐） */
  recommendedSeats: number;
  onClassroomCountChange: (value: number) => void;
  onSeatCountChange: (value: number) => void;
  /** 一键恢复推荐值（重新进入自动推荐模式） */
  onResetSeatCount: () => void;
}

export default function ExamSettings({
  classroomCount,
  seatCount,
  totalStudents,
  seatCountEdited,
  recommendedSeats,
  onClassroomCountChange,
  onSeatCountChange,
  onResetSeatCount,
}: ExamSettingsProps) {
  // 当前座位数为自动推荐值（用户未手动改过，且考场数与总人数均已就绪）
  const recommendActive =
    !seatCountEdited && classroomCount > 0 && totalStudents > 0 && seatCount > 0;
  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-bold text-[#2c3e50]">学生总人数：</span>
        {totalStudents > 0 ? (
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-[#1a5276]">
            共 {totalStudents} 人
          </span>
        ) : (
          <span className="text-sm text-gray-500">导入名单并识别班级后显示</span>
        )}
      </div>
      <div className="flex flex-wrap gap-5">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="classroomCount" className="mb-2 block font-bold text-gray-600">
            考场数量：
          </label>
          <input
            id="classroomCount"
            type="number"
            min={0}
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
            min={0}
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-base"
            value={Number.isFinite(seatCount) ? seatCount : ''}
            onChange={(e) => onSeatCountChange(Math.floor(Number(e.target.value) || 0))}
          />
          {seatCountEdited ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={onResetSeatCount}
                className="rounded-md border border-[#3498db] bg-white px-2.5 py-1 text-sm font-medium text-[#2980b9] transition-colors hover:bg-blue-50"
              >
                恢复推荐值{recommendedSeats > 0 ? `（${recommendedSeats}）` : ''}
              </button>
              <span className="text-sm text-gray-500">已手动修改；恢复后重新跟随自动推荐</span>
            </div>
          ) : recommendActive ? (
            <div className="mt-1.5 text-sm leading-snug text-gray-500">
              已自动推荐：总人数 {totalStudents} ÷ 考场数 {classroomCount}，向下取整为{' '}
              {seatCount}；如需调整可直接修改
            </div>
          ) : (
            <div className="mt-1.5 text-sm leading-snug text-gray-500">
              设置考场数量后，将按“总人数 ÷ 考场数”向下取整自动推荐，也可直接输入
            </div>
          )}
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
          <div className="m-1 inline-flex h-10 items-center justify-center px-2 text-sm text-gray-500">
            …共 {Math.floor(seatCount)} 个座位
          </div>
        )}
      </div>
    </div>
  );
}
