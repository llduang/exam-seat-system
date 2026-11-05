'use client';

/**
 * 考场座位分配系统 —— 全局状态与动作
 *
 * 将单文件版散落在 <script> 里的全局变量（selectedFormat / assignments /
 * unassignedStudents / classNameToNumber / loadedWorkbookFiles ...）收敛为
 * 单一状态源，DOM 读写改为显式状态传递，逻辑与原版逐行等价。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  examComposeNumber,
  examNormalizeClassGroups,
  examPreviewInfo,
  type ExamComponent,
  type ExamNumberConfig,
  type ExamPreviewInfo,
} from '@/lib/exam-core';
import {
  autoMatchColumns,
  computeRecognition,
  extractClassData,
  getFirstSheetHeaders,
  readFilesAsWorkbooks,
  type ExcelFormat,
  type LoadedFile,
  type RecognitionState,
} from '@/lib/exam-data';
import {
  getSeatOptionsForRoom,
  getUsedSeats,
  runAssignment,
  type Assignment,
  type PendingStudent,
} from '@/lib/exam-assign';

/** 页面阶段 */
export type Phase = 'idle' | 'working' | 'modal' | 'done';

/** 状态提示类型 */
export type StatusType = 'success' | 'error' | 'info';

/** 状态提示 */
export interface StatusMsg {
  message: string;
  type: StatusType;
}

/** 生成结果（含未分配处理进度） */
export interface ExamResultState {
  assignments: Assignment[];
  classNames: string[];
  classNameToNumber: Record<string, number>;
  classSizes: Record<string, number>;
  /** 待处理队列（生成时固定） */
  unassignedQueue: PendingStudent[];
  /** 队列进度 */
  queueIndex: number;
  /** 本次跳过的学生 */
  skipped: PendingStudent[];
  /** 手动分配产生的额外座位（考场号 → 座位号列表） */
  additionalSeats: Record<number, number[]>;
  /** 本次手动分配数 */
  manualAssignedCount: number;
}

/** 默认考号构成（与单文件版初始 HTML 一致） */
const DEFAULT_COMPONENTS: ExamComponent[] = [
  { type: 'prefix', enabled: true, value: '806', width: 2 },
  { type: 'class', enabled: true, value: '', width: 2 },
  { type: 'room', enabled: true, value: '', width: 2 },
  { type: 'seat', enabled: true, value: '', width: 2 },
];

/** 主 Hook：返回页面所需的全部状态与动作 */
export function useExamSystem() {
  // ---- 基础设置 ----
  const [format, setFormat] = useState<ExcelFormat>('multi-sheet');
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [classColumn, setClassColumn] = useState<number | null>(null);
  const [classroomCount, setClassroomCount] = useState(18);
  const [seatCount, setSeatCount] = useState(25);

  // ---- 考号构成 ----
  const [components, setComponents] = useState<ExamComponent[]>(DEFAULT_COMPONENTS);
  const [separator, setSeparator] = useState('');

  // ---- 识别 / 状态 / 结果 ----
  const [recognition, setRecognition] = useState<RecognitionState | null>(null);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ExamResultState | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'download' | 'statistics'>('preview');

  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 显示状态消息（5 秒自动隐藏） */
  const showStatus = useCallback((message: string, type: StatusType) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus({ message, type });
    statusTimer.current = setTimeout(() => {
      setStatus(null);
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  // ---- 班级识别（上传/切格式/改列后自动重算） ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await computeRecognition(loadedFiles, format, {
        nameColumn,
        classColumn,
      });
      if (!cancelled) setRecognition(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedFiles, format, nameColumn, classColumn]);

  /** 文件选择（支持多文件） */
  const onFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      if (!files || (files as File[]).length === 0) return;
      try {
        const loaded = await readFilesAsWorkbooks(files);
        setLoadedFiles(loaded);
        // 更新列选择（单工作表格式用；表头取第一个文件的第一个工作表）
        const headers = await getFirstSheetHeaders(loaded);
        setColumnHeaders(headers);
        const { nameIndex, classIndex } = autoMatchColumns(headers);
        setNameColumn(nameIndex !== -1 ? nameIndex : null);
        setClassColumn(classIndex !== -1 ? classIndex : null);
        showStatus(
          loaded.length > 1
            ? `已成功加载 ${loaded.length} 个文件，可以开始生成考场分配表`
            : '文件已成功加载，可以开始生成考场分配表',
          'success',
        );
      } catch (error) {
        showStatus('读取文件时出错: ' + (error as Error).message, 'error');
      }
    },
    [showStatus],
  );

  // ---- 考号构成编辑动作 ----
  const toggleComponent = useCallback((index: number) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, enabled: !c.enabled } : c)),
    );
  }, []);

  const setComponentValue = useCallback((index: number, value: string) => {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, value } : c)));
  }, []);

  const setComponentWidth = useCallback((index: number, width: number) => {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, width } : c)));
  }, []);

  const moveComponent = useCallback((index: number, dir: -1 | 1) => {
    setComponents((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  }, []);

  // ---- 考号配置（实时）与预览 ----
  // 前缀在读取时 trim（对齐原版 getExamNumberConfig 的 prefixInput.value.trim()）
  const examConfig: ExamNumberConfig = useMemo(
    () => ({
      components: components.map((c) =>
        c.type === 'prefix' ? { ...c, value: c.value.trim() } : c,
      ),
      separator,
    }),
    [components, separator],
  );

  const previewNumbers = useMemo<Record<string, number>>(() => {
    if (result) return result.classNameToNumber;
    if (recognition && recognition.mode === 'ok') return recognition.numbers;
    return {};
  }, [result, recognition]);

  const preview: ExamPreviewInfo = useMemo(
    () => examPreviewInfo(examConfig, classroomCount, seatCount, previewNumbers),
    [examConfig, classroomCount, seatCount, previewNumbers],
  );

  // ---- 生成 ----
  const generate = useCallback(async () => {
    if (!loadedFiles.length) {
      showStatus('请先上传学生名单Excel文件', 'error');
      return;
    }
    if (classroomCount <= 0 || seatCount <= 0) {
      showStatus('考场数量和座位数必须大于0', 'error');
      return;
    }
    // 校验考号构成配置
    if (!examConfig.components.some((c) => c.enabled)) {
      showStatus('请至少勾选一个考号构成项（前缀、班级、考场或座位号）', 'error');
      return;
    }
    const prefixComp = examConfig.components.find((c) => c.type === 'prefix');
    if (prefixComp && prefixComp.enabled && !prefixComp.value) {
      showStatus('已勾选“前缀”构成项，请填写前缀内容，或取消勾选前缀', 'error');
      return;
    }
    if (format === 'single-sheet' && (nameColumn === null || classColumn === null)) {
      showStatus('请选择姓名列和班级列', 'error');
      return;
    }

    setPhase('working');
    try {
      const extraction = await extractClassData(loadedFiles, format, {
        nameColumn,
        classColumn,
      });
      if (!extraction.rawClassNames.length) {
        showStatus('未能从文件中识别出任何班级，请检查文件格式设置是否正确', 'error');
        setPhase('idle');
        return;
      }

      // 班级名称归一化：合并同一班级的不同写法，按班级号排序
      const norm = examNormalizeClassGroups(extraction.rawClassNames);
      const classNames = norm.groups.map((g) => g.display);
      const classNameToNumber: Record<string, number> = {};
      norm.groups.forEach((g) => {
        classNameToNumber[g.display] = g.classNumber;
      });
      const classData: Record<string, string[]> = {};
      classNames.forEach((c) => {
        classData[c] = [];
      });
      extraction.rawClassNames.forEach((raw) => {
        const display = norm.rawToDisplay[raw];
        classData[display] = classData[display].concat(extraction.studentsByRawClass[raw]);
      });

      const out = runAssignment({
        classData,
        classNames,
        classNameToNumber,
        classroomCount,
        seatCount,
        examConfig,
      });

      const nextResult: ExamResultState = {
        assignments: out.assignments,
        classNames,
        classNameToNumber,
        classSizes: out.classSizes,
        unassignedQueue: out.unassignedQueue,
        queueIndex: 0,
        skipped: [],
        additionalSeats: {},
        manualAssignedCount: 0,
      };
      setResult(nextResult);

      if (out.unassignedQueue.length > 0) {
        setPhase('modal');
      } else {
        setPhase('done');
        setActiveTab('preview');
        showStatus('所有学生都已成功分配座位', 'success');
      }
    } catch (error) {
      showStatus('处理文件时出错: ' + (error as Error).message, 'error');
      setPhase('idle');
    }
  }, [
    loadedFiles, classroomCount, seatCount, examConfig, format, nameColumn, classColumn, showStatus,
  ]);

  // ---- 未分配学生处理（模态框） ----
  const currentPending: PendingStudent | null =
    phase === 'modal' && result
      ? result.unassignedQueue[result.queueIndex] ?? null
      : null;

  const usedSeats = useMemo<Record<number, Set<number>>>(() => {
    if (!result) return {};
    return getUsedSeats(result.assignments, result.additionalSeats);
  }, [result]);

  /** 当前考场可选座位（原版考场选择变化后的选项逻辑） */
  const seatOptionsForRoom = useCallback(
    (room: number) => getSeatOptionsForRoom(room, seatCount, usedSeats),
    [seatCount, usedSeats],
  );

  /** 手动分配当前学生 */
  const assignCurrent = useCallback(
    (room: number, seat: number) => {
      if (!result || !currentPending) return;
      const examNumber = examComposeNumber(
        examConfig.components,
        examConfig.separator,
        result.classNameToNumber[currentPending.class],
        room,
        seat,
      );
      const assignments: Assignment[] = [
        ...result.assignments,
        {
          name: currentPending.name,
          classroom: room,
          seat,
          class: currentPending.class,
          examNumber,
        },
      ];
      const additionalSeats: Record<number, number[]> = { ...result.additionalSeats };
      // 如果是额外座位，记录到额外座位列表
      if (seat > seatCount) {
        additionalSeats[room] = [...(additionalSeats[room] || []), seat];
      }
      setResult({
        ...result,
        assignments,
        additionalSeats,
        queueIndex: result.queueIndex + 1,
        manualAssignedCount: result.manualAssignedCount + 1,
      });
    },
    [result, currentPending, examConfig, seatCount],
  );

  /** 跳过当前学生 */
  const skipCurrent = useCallback(() => {
    if (!result || !currentPending) return;
    setResult({
      ...result,
      skipped: [...result.skipped, currentPending],
      queueIndex: result.queueIndex + 1,
    });
  }, [result, currentPending]);

  /** 完成处理，展示结果 */
  const finishModal = useCallback(() => {
    if (!result) return;
    setPhase('done');
    setActiveTab('preview');
    const assignedCount = result.manualAssignedCount;
    const skippedCount = result.skipped.length;
    const remainingCount = result.unassignedQueue.length - result.queueIndex;
    let message = `未分配学生处理完成！\n已分配：${assignedCount}人`;
    if (skippedCount > 0) message += `\n跳过：${skippedCount}人`;
    if (remainingCount > 0) message += `\n待处理：${remainingCount}人`;
    showStatus(message, 'success');
  }, [result, showStatus]);

  /** 直接关闭模态框（中止，不展示结果——与原版 closeUnassignedModal 一致） */
  const abortModal = useCallback(() => {
    setPhase('idle');
  }, []);

  // ---- 派生数据 ----
  /** 未分配（含跳过）学生列表 */
  const remainingUnassigned: PendingStudent[] = useMemo(() => {
    if (!result) return [];
    return result.unassignedQueue.slice(result.queueIndex).concat(result.skipped);
  }, [result]);

  /** 各班级统计（已分配含手动分配；顺序与分配时一致） */
  const classStats = useMemo(() => {
    if (!result) return [];
    return result.classNames.map((className) => {
      const total = result.classSizes[className] ?? 0;
      const assigned = result.assignments.filter((a) => a.class === className).length;
      return {
        className,
        total,
        assigned,
        unassigned: total - assigned,
        rate: total > 0 ? ((assigned / total) * 100).toFixed(1) : '0',
      };
    });
  }, [result]);

  /** 有数据的考场号（升序） */
  const usedRooms = useMemo(() => {
    if (!result) return [];
    return Array.from(new Set(result.assignments.map((a) => a.classroom))).sort((a, b) => a - b);
  }, [result]);

  return {
    // 设置
    format,
    setFormat,
    loadedFiles,
    columnHeaders,
    nameColumn,
    setNameColumn,
    classColumn,
    setClassColumn,
    classroomCount,
    setClassroomCount,
    seatCount,
    setSeatCount,
    // 考号构成
    components,
    separator,
    setSeparator,
    toggleComponent,
    setComponentValue,
    setComponentWidth,
    moveComponent,
    examConfig,
    preview,
    // 识别 / 状态 / 结果
    recognition,
    status,
    phase,
    result,
    activeTab,
    setActiveTab,
    // 动作
    onFilesSelected,
    generate,
    showStatus,
    currentPending,
    usedSeats,
    seatOptionsForRoom,
    assignCurrent,
    skipCurrent,
    finishModal,
    abortModal,
    // 派生
    remainingUnassigned,
    classStats,
    usedRooms,
  };
}

export type ExamSystem = ReturnType<typeof useExamSystem>;
