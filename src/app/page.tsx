'use client';

/**
 * 主页面：上传 → 识别 → 设置 → 考号构成 → 生成 → 结果面板 / 未分配模态框。
 * 布局顺序与单文件版 index.html 保持一致。
 */

import { useEffect } from 'react';
import { useExamSystem } from '@/hooks/use-exam-system';
import UploadSection from '@/components/UploadSection';
import ClassRecognitionBox from '@/components/ClassRecognitionBox';
import ExamSettings, { SeatOrderChips } from '@/components/ExamSettings';
import ExamNumberConfigPanel from '@/components/ExamNumberConfig';
import { LoadingSpinner, StatusMessage } from '@/components/Feedback';
import ResultPanel from '@/components/ResultPanel';
import UnassignedModal from '@/components/UnassignedModal';
import {
  downloadClassSheet,
  downloadComplete,
  downloadRoomSheet,
  downloadSeatPrint,
  downloadTotalSheet,
  type ExportContext,
} from '@/lib/exam-export';
import { generateSeatPdf } from '@/lib/exam-pdf';

export default function Page() {
  const sys = useExamSystem();
  const result = sys.result;

  const buildCtx = (): ExportContext | null => {
    if (!result) return null;
    return {
      assignments: result.assignments,
      classNames: result.classNames,
      classSizes: result.classSizes,
      remainingUnassigned: sys.remainingUnassigned,
      classroomCount: sys.classroomCount,
    };
  };

  // 生成完成/未分配处理完后，自动平滑滚动到结果面板（页面较长，避免“生成了没反应”的困惑）
  useEffect(() => {
    if (sys.phase !== 'done') return;
    document.getElementById('resultPanel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [sys.phase]);

  // 未分配处理模态框打开时锁定背景滚动
  useEffect(() => {
    if (sys.phase !== 'modal') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sys.phase]);

  // 页面级拦截拖拽默认行为：拖到上传区外时浏览器不再打开/下载文件
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  // 滚回设置区（结果面板“返回修改设置”用）
  const backToSettings = () => {
    document.getElementById('settingsSection')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <main className="min-h-screen bg-[#f5f7fa] px-4 py-5 text-[#333] sm:py-6">
      <div className="mx-auto max-w-[1200px] rounded-xl bg-white p-5 shadow-md sm:p-8">
        <h1 className="mb-8 text-center text-2xl font-bold text-[#2c3e50] sm:text-3xl">
          考场座位分配系统
        </h1>

        <UploadSection
          format={sys.format}
          onFormatChange={sys.setFormat}
          columnHeaders={sys.columnHeaders}
          nameColumn={sys.nameColumn}
          classColumn={sys.classColumn}
          onNameColumnChange={sys.setNameColumn}
          onClassColumnChange={sys.setClassColumn}
          onFilesSelected={sys.onFilesSelected}
        />

        <ClassRecognitionBox recognition={sys.recognition} />

        <div id="settingsSection">
          <ExamSettings
            classroomCount={sys.classroomCount}
            seatCount={sys.seatCount}
            totalStudents={sys.totalStudents}
            seatCountEdited={sys.seatCountEdited}
            recommendedSeats={sys.recommendedSeats}
            onClassroomCountChange={sys.setClassroomCount}
            onSeatCountChange={sys.setSeatCount}
            onResetSeatCount={sys.resetSeatCountToRecommended}
          />
        </div>

        <ExamNumberConfigPanel
          components={sys.components}
          separator={sys.separator}
          onToggle={sys.toggleComponent}
          onValueChange={sys.setComponentValue}
          onWidthChange={sys.setComponentWidth}
          onMove={sys.moveComponent}
          onSeparatorChange={sys.setSeparator}
          preview={sys.preview}
        />

        {sys.seatCount > 0 && (
          <div className="mb-5">
            <label className="mb-2.5 block font-bold text-gray-600">座位号排列顺序：</label>
            <SeatOrderChips seatCount={sys.seatCount} />
          </div>
        )}

        <div className="my-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={sys.generate}
            disabled={sys.phase === 'working' || sys.generateBlockers.length > 0}
            className="rounded-md bg-[#3498db] px-6 py-3 text-base text-white transition-colors hover:bg-[#2980b9] disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            生成考场分配表
          </button>
          {sys.generateBlockers.length > 0 && (
            <div className="text-center text-sm leading-6 text-gray-500">
              生成前还需：{sys.generateBlockers.join('；')}
            </div>
          )}
        </div>

        {sys.phase === 'working' && <LoadingSpinner />}

        <StatusMessage status={sys.status} />

        {sys.phase === 'done' && result && (
          <div id="resultPanel">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={backToSettings}
                className="text-sm text-[#2980b9] hover:underline"
              >
                ↑ 返回修改设置
              </button>
            </div>
            <ResultPanel
              sys={sys}
              onDownloadTotal={() => {
                const ctx = buildCtx();
                if (ctx) downloadTotalSheet(ctx);
              }}
              onDownloadClass={(className) => {
                const ctx = buildCtx();
                if (ctx) downloadClassSheet(ctx, className);
              }}
              onDownloadRoom={(room) => {
                const ctx = buildCtx();
                if (ctx) downloadRoomSheet(ctx, room);
              }}
              onDownloadSeatPrint={() => {
                const ctx = buildCtx();
                if (ctx) downloadSeatPrint(ctx);
              }}
              onDownloadComplete={() => {
                const ctx = buildCtx();
                if (ctx) downloadComplete(ctx);
              }}
              onDownloadPdf={() => {
                if (!result) return;
                generateSeatPdf(
                  {
                    assignments: result.assignments,
                    classroomCount: sys.classroomCount,
                    seatCount: sys.seatCount,
                  },
                  { onStatus: sys.showStatus },
                );
              }}
            />
          </div>
        )}
      </div>

      {sys.phase === 'modal' && result && (
        <UnassignedModal
          queue={result.unassignedQueue}
          queueIndex={result.queueIndex}
          currentPending={sys.currentPending}
          classroomCount={sys.classroomCount}
          seatCount={sys.seatCount}
          seatOptionsForRoom={sys.seatOptionsForRoom}
          autoFillPreview={sys.autoFillPreview}
          onAssign={sys.assignCurrent}
          onSkip={sys.skipCurrent}
          onAutoFill={sys.autoFillRemaining}
          onFinish={sys.finishModal}
          onAbort={sys.abortModal}
        />
      )}
    </main>
  );
}
