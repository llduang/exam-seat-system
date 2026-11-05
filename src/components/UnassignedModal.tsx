'use client';

/**
 * 未分配学生处理模态框：逐个为学生选择考场/座位（排除已占用，
 * 无空位时提供额外座位），或跳过。移植自 #unassignedModal 及其事件逻辑。
 */

import { useEffect, useState } from 'react';
import type { PendingStudent } from '@/lib/exam-assign';

interface UnassignedModalProps {
  /** 待处理队列 */
  queue: PendingStudent[];
  /** 当前处理进度 */
  queueIndex: number;
  /** 当前学生（null 表示全部处理完成） */
  currentPending: PendingStudent | null;
  classroomCount: number;
  seatCount: number;
  /** 指定考场的可选座位 */
  seatOptionsForRoom: (room: number) => { seats: number[]; extraFrom: number | null };
  onAssign: (room: number, seat: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  onAbort: () => void;
}

export default function UnassignedModal({
  queue,
  queueIndex,
  currentPending,
  classroomCount,
  seatCount,
  seatOptionsForRoom,
  onAssign,
  onSkip,
  onFinish,
  onAbort,
}: UnassignedModalProps) {
  const [room, setRoom] = useState<number | null>(null);
  const [seat, setSeat] = useState<number | null>(null);

  // 切换到下一位学生时重置选择
  useEffect(() => {
    setRoom(null);
    setSeat(null);
  }, [queueIndex, currentPending]);

  const roomSeats = room ? seatOptionsForRoom(room) : null;

  return (
    <div
      className="fixed inset-0 z-[1000] overflow-y-auto bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto my-[50px] w-[90%] max-w-[800px] max-h-[80vh] overflow-y-auto rounded-xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between border-b border-gray-200 pb-4">
          <h2 className="m-0 text-xl font-bold text-[#2c3e50]">处理未分配学生</h2>
          <button
            type="button"
            className="border-none bg-none text-3xl font-bold leading-none text-gray-400 hover:text-black"
            onClick={onAbort}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div>
          {!currentPending ? (
            <p className="text-center text-lg text-[#28a745]">
              所有未分配学生已处理完成！
            </p>
          ) : (
            <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-base font-bold">{currentPending.name}</span>
                <span className="text-gray-500">{currentPending.class}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                <select
                  aria-label="选择考场"
                  className="min-w-[120px] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2.5"
                  value={room ?? ''}
                  onChange={(e) => {
                    setRoom(e.target.value === '' ? null : Number(e.target.value));
                    setSeat(null);
                  }}
                >
                  <option value="">选择考场</option>
                  {Array.from({ length: classroomCount }, (_, i) => i + 1).map((r) => (
                    <option key={r} value={r}>
                      考场{r}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="选择座位"
                  disabled={!room}
                  className="min-w-[120px] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2.5 disabled:bg-gray-100 disabled:text-gray-400"
                  value={seat ?? ''}
                  onChange={(e) =>
                    setSeat(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">{room ? '选择座位' : '先选择考场'}</option>
                  {(roomSeats?.seats ?? []).map((n) => (
                    <option key={n} value={n}>
                      {n > seatCount ? `额外座位${n}` : `座位${n}`}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!(room && seat)}
                  onClick={() => room && seat && onAssign(room, seat)}
                  className="rounded bg-[#28a745] px-4 py-2.5 text-sm text-white hover:bg-[#218838] disabled:cursor-not-allowed disabled:bg-gray-500"
                >
                  分配座位
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded bg-[#dc3545] px-4 py-2.5 text-sm text-white hover:bg-[#c82333]"
                >
                  跳过此学生
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-500">
            处理进度：{Math.min(queueIndex, queue.length)}/{queue.length}
          </div>
          {!currentPending && (
            <button
              type="button"
              onClick={onFinish}
              className="rounded bg-[#007bff] px-5 py-2.5 text-base text-white hover:bg-[#0069d9]"
            >
              完成分配
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
