/**
 * 考场座位分配系统 —— 座位分配算法
 *
 * 移植自单文件版 generateAssignment 的分配部分（两阶段轮询），
 * 逻辑逐行等价：第一阶段按班级顺序循环分配；第二阶段在考场仍有空位时
 * 继续消化未分配学生，并避免与同班级上一条记录座位号相同。
 */

// 显式 .ts 扩展：Node 原生 type stripping 可直接运行本模块（供 scripts/ 单元测试）
import { examComposeNumber, type ExamNumberConfig } from './exam-core.ts';

/** 一条分配结果 */
export interface Assignment {
  name: string;
  classroom: number;
  seat: number;
  class: string;
  examNumber: string;
}

/** 未分配学生（进入待处理队列） */
export interface PendingStudent {
  name: string;
  class: string;
}

/** 分配算法输入 */
export interface AssignInput {
  /** 班级显示名 → 学生列表（文件顺序） */
  classData: Record<string, string[]>;
  /** 班级顺序（已归一化排序） */
  classNames: string[];
  /** 班级显示名 → 班级号 */
  classNameToNumber: Record<string, number>;
  classroomCount: number;
  seatCount: number;
  examConfig: ExamNumberConfig;
}

/** 分配算法输出 */
export interface AssignOutput {
  assignments: Assignment[];
  /** 未分配学生队列（班级顺序、文件顺序） */
  unassignedQueue: PendingStudent[];
  /** 班级显示名 → 总人数 */
  classSizes: Record<string, number>;
}

/** 执行两阶段分配 */
export function runAssignment(input: AssignInput): AssignOutput {
  const { classData, classNames, classNameToNumber, classroomCount, seatCount, examConfig } = input;

  const classSizes: Record<string, number> = {};
  classNames.forEach((className) => {
    classSizes[className] = classData[className].length;
  });

  // 生成座位号列表
  const seatOrder = Array.from({ length: seatCount }, (_, i) => i + 1);
  const studentsPerClassroom = seatOrder.length;
  const totalSeats = classroomCount * studentsPerClassroom;

  const totalStudents = classNames.reduce(
    (sum, className) => sum + classData[className].length,
    0,
  );

  const assignments: Assignment[] = [];
  const classCounters: Record<string, number> = {};
  classNames.forEach((className) => {
    classCounters[className] = 0;
  });

  let seatCounter = 0;

  // 第一轮分配：按班级顺序循环分配
  for (let i = 0; i < Math.min(totalStudents, totalSeats); i++) {
    const classIdx = i % classNames.length;
    const className = classNames[classIdx];

    if (classCounters[className] < classSizes[className]) {
      const studentName = classData[className][classCounters[className]];
      classCounters[className]++;

      // 计算考场号和座位号
      const classroomNumber = Math.floor(seatCounter / studentsPerClassroom) + 1;
      const seatNumber = seatOrder[seatCounter % studentsPerClassroom];

      // 生成考号：按“考号构成”配置的顺序与位数拼接
      const examNumber = examComposeNumber(
        examConfig.components,
        examConfig.separator,
        classNameToNumber[className],
        classroomNumber,
        seatNumber,
      );

      assignments.push({
        name: studentName,
        classroom: classroomNumber,
        seat: seatNumber,
        class: className,
        examNumber: examNumber,
      });

      seatCounter++;
    }
  }

  // 计算每个班级未分配的学生数
  const unassignedStudentsCount: Record<string, number> = {};
  classNames.forEach((className) => {
    unassignedStudentsCount[className] = classSizes[className] - classCounters[className];
  });

  // 若有班级存在未分配学生，继续分配直到考场无剩余座位
  while (seatCounter < totalSeats && Object.values(unassignedStudentsCount).some((count) => count > 0)) {
    for (const className of classNames) {
      // 修复（原单文件版遗留缺陷）：while 条件只在整轮 for 之间生效，
      // 最后一轮 for 内 seatCounter 可能越过 totalSeats，导致座位“超卖”、
      // 生成不存在的考场号（如 10 个考场分出第 11 考场）且未分配队列归零。
      if (seatCounter >= totalSeats) break;
      if (unassignedStudentsCount[className] > 0) {
        const studentName = classData[className][classCounters[className]];
        classCounters[className]++;
        unassignedStudentsCount[className]--;

        // 计算考场号和座位号
        const classroomNumber = Math.floor(seatCounter / studentsPerClassroom) + 1;
        let seatNumber = seatOrder[seatCounter % studentsPerClassroom];

        // 检查是否会与同班级相邻，若相邻则调整座位号
        if (assignments.length > 0) {
          const lastAssignment = assignments[assignments.length - 1];
          if (lastAssignment.class === className && seatNumber === lastAssignment.seat) {
            seatNumber = (seatNumber % studentsPerClassroom) + 1;
          }
        }

        // 生成考号
        const examNumber = examComposeNumber(
          examConfig.components,
          examConfig.separator,
          classNameToNumber[className],
          classroomNumber,
          seatNumber,
        );

        assignments.push({
          name: studentName,
          classroom: classroomNumber,
          seat: seatNumber,
          class: className,
          examNumber: examNumber,
        });

        seatCounter++;
      }
    }
  }

  // 收集未分配的学生信息
  const unassignedQueue: PendingStudent[] = [];
  classNames.forEach((className) => {
    const unassignedCount = classSizes[className] - classCounters[className];
    if (unassignedCount > 0) {
      for (let i = classCounters[className]; i < classSizes[className]; i++) {
        unassignedQueue.push({
          name: classData[className][i],
          class: className,
        });
      }
    }
  });

  return {
    assignments: assignments,
    unassignedQueue: unassignedQueue,
    classSizes: classSizes,
  };
}

/**
 * 获取已使用的座位（考场号 → 座位号集合），含手动分配产生的额外座位。
 * 原版 getUsedSeats。
 */
export function getUsedSeats(
  assignments: Assignment[],
  additionalSeats: Record<number, number[]>,
): Record<number, Set<number>> {
  const usedSeats: Record<number, Set<number>> = {};
  assignments.forEach((assignment) => {
    if (!usedSeats[assignment.classroom]) {
      usedSeats[assignment.classroom] = new Set();
    }
    usedSeats[assignment.classroom].add(assignment.seat);
  });

  // 添加额外座位
  Object.keys(additionalSeats).forEach((key) => {
    const classroomNumber = Number(key);
    if (!usedSeats[classroomNumber]) {
      usedSeats[classroomNumber] = new Set();
    }
    additionalSeats[classroomNumber].forEach((seatNumber) => {
      usedSeats[classroomNumber].add(seatNumber);
    });
  });

  return usedSeats;
}

/**
 * 计算某考场可选的座位选项（排除已占用；无空位时提供 5 个额外座位 seatCount+1..seatCount+5）。
 * 原版 displayCurrentUnassignedStudent 中考场选择变化时的逻辑。
 */
export function getSeatOptionsForRoom(
  room: number,
  seatCount: number,
  usedSeats: Record<number, Set<number>>,
): { seats: number[]; extraFrom: number | null } {
  const classroomUsedSeats = usedSeats[room] || new Set<number>();
  const seats: number[] = [];
  for (let i = 1; i <= seatCount; i++) {
    if (!classroomUsedSeats.has(i)) seats.push(i);
  }
  // 如果该考场没有可用座位，提供 5 个额外座位选项
  if (seats.length === 0) {
    const nextSeat = seatCount + 1;
    for (let i = 0; i < 5; i++) {
      seats.push(nextSeat + i);
    }
    return { seats: seats, extraFrom: nextSeat };
  }
  return { seats: seats, extraFrom: null };
}
