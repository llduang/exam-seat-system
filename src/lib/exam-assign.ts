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
 * 按（考场号，座位号）升序排序的副本。
 * 总表/班级表/考场表导出与页面预览统一使用：
 * 轮询自动分配部分本就按此序生成（稳定排序保持原样），
 * 补位/手动分配的学生追加在数组末尾，经此排序归位到对应考场座位处。
 */
export function sortByRoomSeat(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort(
    (a, b) => a.classroom - b.classroom || a.seat - b.seat,
  );
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
 * 计算某考场可选的座位选项（排除已占用；无空位时提供 5 个额外座位）。
 * 原版 displayCurrentUnassignedStudent 中考场选择变化时的逻辑。
 * 修复：满员时的额外座位也要跳过已被占用（手动加过）的座位号。
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
  // 如果该考场没有可用座位，提供 5 个额外座位选项（跳过已占用的额外座位号）
  if (seats.length === 0) {
    let nextSeat = seatCount + 1;
    while (seats.length < 5) {
      if (!classroomUsedSeats.has(nextSeat)) seats.push(nextSeat);
      nextSeat++;
    }
    return { seats: seats, extraFrom: seatCount + 1 };
  }
  return { seats: seats, extraFrom: null };
}

/** 自动补位计划：一位待分配学生的落位结果 */
export interface AutoFillPlacement {
  student: PendingStudent;
  classroom: number;
  seat: number;
  examNumber: string;
}

/**
 * 自动补位：把超出座位的学生依次安排到末尾考场的“第 seatCount+1 号”座位。
 *
 * 规则（与用户约定）：比如多出 2 名学生、共 10 个考场每场 40 人，
 * 则第 1 名 → 第 9 考场 41 号座，第 2 名 → 第 10 考场 41 号座
 * （即取末尾 N 个考场，按考场号升序依次加挂 41 号座）。
 *
 * - 每层先补 seatCount+1 号座；某考场该座位号已被占用（如手动分配过）则跳过；
 * - 一层放不下（多出人数 > 可用考场数）时自动进入 seatCount+2 号层继续；
 * - 极端容量场景（所有层全占满）由安全阀截断，正常不会触发。
 *
 * @param queue      待补学生队列（按顺序分配）
 * @param classNameToNumber 班级显示名 → 班级号（生成考号）
 * @param classroomCount 考场数
 * @param seatCount  每考场标准座位数
 * @param usedSeats  已占用座位（考场号 → 座位号集合，须含手动额外座位）
 * @param examConfig 考号构成配置
 * @returns 落位计划（与 queue 等长；座位冲突时自动顺延，正常场景容量充足）
 */
export function planAutoFill(
  queue: PendingStudent[],
  classNameToNumber: Record<string, number>,
  classroomCount: number,
  seatCount: number,
  usedSeats: Record<number, Set<number>>,
  examConfig: ExamNumberConfig,
): AutoFillPlacement[] {
  const placements: AutoFillPlacement[] = [];
  if (!queue.length || classroomCount <= 0 || seatCount <= 0) return placements;

  // 安全阀：层数上限（每层至少能放 1 人时最多 queue.length 层即够；
  // 再留足余量应对“某些层被手动占满”的极端情况）
  const maxLayer = queue.length + classroomCount + 10;

  // 逐层补位：第 1 层为 seatCount+1 号座，第 2 层为 seatCount+2 号座 …
  for (let layer = 1; placements.length < queue.length && layer <= maxLayer; layer++) {
    const layerSeat = seatCount + layer;
    // 本层可用考场 = 该座位号未被占用的考场（升序）
    const freeRooms: number[] = [];
    for (let room = 1; room <= classroomCount; room++) {
      const used = usedSeats[room];
      if (used && used.has(layerSeat)) continue;
      freeRooms.push(room);
    }
    if (!freeRooms.length) continue; // 此层全被占满，进入下一层

    // 取末尾 k 个可用考场（k = 本层待放人数与可用考场数的较小值），
    // 按考场号升序依次分配（多 2 人 → 第 9、10 考场；多 3 人 → 第 8、9、10 考场）
    const remaining = queue.length - placements.length;
    const take = Math.min(remaining, freeRooms.length);
    const roomsForLayer = freeRooms.slice(freeRooms.length - take);
    for (const room of roomsForLayer) {
      if (placements.length >= queue.length) break;
      const student = queue[placements.length];
      placements.push({
        student: student,
        classroom: room,
        seat: layerSeat,
        examNumber: examComposeNumber(
          examConfig.components,
          examConfig.separator,
          classNameToNumber[student.class],
          room,
          layerSeat,
        ),
      });
    }
  }
  return placements;
}
