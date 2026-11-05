/**
 * 考场座位分配系统 —— Excel 导出
 *
 * 移植自单文件版 applyWorksheetStyle / generateExcelFiles / generateSeatPrintExcel。
 * 与原版的差异（修正）：原版“下载总表”按钮闭包捕获的工作簿会追加后续班级/考场
 * 工作表，导致点击时可能下载到完整工作簿；本版每次点击时按需构建，
 * “总表”只含总表，“完整分配表”才包含全部工作表。
 */

import type { WorkSheet } from 'xlsx-js-style';
import { loadXLSX } from './exam-data';
import type { Assignment, PendingStudent } from './exam-assign';

/** 导出上下文（点击导出时的实时状态） */
export interface ExportContext {
  assignments: Assignment[];
  /** 班级顺序（与分配结果一致） */
  classNames: string[];
  /** 班级 → 总人数 */
  classSizes: Record<string, number>;
  /** 未分配（含跳过）学生，供座位表打印末尾追加 */
  remainingUnassigned: PendingStudent[];
  /** 考场数量（导出时实时值，原版导出时读取 DOM） */
  classroomCount: number;
}

/** 为工作表应用框线和列宽样式（原 applyWorksheetStyle，逐行等价） */
async function applyWorksheetStyle(worksheet: WorkSheet, colWidths: number[]): Promise<void> {
  if (!worksheet['!ref']) return;
  const XLSX = await loadXLSX();

  // 设置列宽
  if (colWidths && colWidths.length > 0) {
    worksheet['!cols'] = colWidths.map((w) => ({ wch: w }));
  }

  // 定义通用框线样式
  const borderStyle = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  // 遍历所有单元格，添加框线
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellAddress] as { s?: Record<string, unknown> } | undefined;
      if (cell) {
        if (!cell.s) cell.s = {};
        (cell.s as { border?: unknown }).border = borderStyle;

        // 表头行（第一行）加粗居中
        if (R === 0) {
          (cell.s as { font?: unknown }).font = { bold: true, sz: 11 };
          (cell.s as { alignment?: unknown }).alignment = {
            vertical: 'center',
            horizontal: 'center',
          };
          (cell.s as { fill?: unknown }).fill = {
            fgColor: { rgb: 'E0E0E0' },
          };
        } else {
          // 数据行居中
          (cell.s as { alignment?: unknown }).alignment = {
            vertical: 'center',
            horizontal: 'center',
          };
        }
      }
    }
  }
}

/** 总表行数据（姓名/考场号/座位号/班级/考号） */
function totalRows(assignments: Assignment[]) {
  return assignments.map((a) => ({
    姓名: a.name,
    考场号: a.classroom,
    座位号: a.seat,
    班级: a.class,
    考号: a.examNumber,
  }));
}

/** 构建总表工作表 */
async function buildTotalWorksheet(ctx: ExportContext): Promise<WorkSheet> {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.json_to_sheet(totalRows(ctx.assignments));
  await applyWorksheetStyle(ws, [12, 10, 10, 18, 22]);
  return ws;
}

/** 构建班级工作表 */
async function buildClassWorksheet(
  ctx: ExportContext,
  className: string,
): Promise<WorkSheet> {
  const XLSX = await loadXLSX();
  const rows = ctx.assignments
    .filter((a) => a.class === className)
    .map((a) => ({
      姓名: a.name,
      考场号: a.classroom,
      座位号: a.seat,
      班级: a.class,
      考号: a.examNumber,
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  await applyWorksheetStyle(ws, [12, 10, 10, 18, 22]);
  return ws;
}

/** 构建考场工作表（带合并标题行，原版 generateExcelFiles 中考场部分） */
async function buildRoomWorksheet(
  roomNumber: number,
  roomAssignments: Assignment[],
): Promise<WorkSheet> {
  const XLSX = await loadXLSX();
  const classroomAoa: unknown[][] = [];
  // 标题行
  classroomAoa.push([`第${roomNumber}考场`, '', '', '']);
  // 表头行
  classroomAoa.push(['姓名', '座位号', '班级', '考号']);
  // 数据行
  roomAssignments.forEach((a) => {
    classroomAoa.push([a.name, a.seat, a.class, a.examNumber]);
  });

  const ws = XLSX.utils.aoa_to_sheet(classroomAoa) as WorkSheet & Record<string, unknown>;

  // 合并标题行的单元格
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

  // 设置列宽
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 22 }];

  // 设置行高（标题行 30）
  ws['!rows'] = [];
  (ws['!rows'] as unknown[])[0] = { hpt: 30 };

  // 样式：标题行加粗大字体居中（无背景色）
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const titleCellObj = ws[titleCell] as { s?: Record<string, unknown> } | undefined;
  if (titleCellObj) {
    titleCellObj.s = {
      font: { name: '宋体', sz: 16, bold: true, charset: 134 },
      alignment: { vertical: 'center', horizontal: 'center' },
    };
  }

  // 样式：表头行
  for (let c = 0; c < 4; c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c });
    const cell = ws[addr] as { s?: Record<string, unknown> } | undefined;
    if (cell) {
      cell.s = {
        font: { bold: true, sz: 11 },
        alignment: { vertical: 'center', horizontal: 'center' },
        fill: { fgColor: { rgb: 'E0E0E0' } },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      };
    }
  }

  // 样式：数据行
  for (let r = 2; r < classroomAoa.length; r++) {
    for (let c = 0; c < 4; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as { s?: Record<string, unknown> } | undefined;
      if (cell) {
        cell.s = {
          alignment: { vertical: 'center', horizontal: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
    }
  }

  return ws;
}

/**
 * 生成座位表打印工作簿（原 generateSeatPrintExcel，逐行等价）。
 * 布局：横向打印；按考场分组；每个考场前一行合并单元格写“第X考场”；
 * 考场内学生按座位号顺序排列，每行两个学生（考号|姓名|考号|姓名）。
 */
export async function buildSeatPrintWorkbook(ctx: ExportContext) {
  const XLSX = await loadXLSX();
  const seatPrintWorkbook = XLSX.utils.book_new();

  const seatPrintData: unknown[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const titleRows = new Set<number>();

  let currentRow = 0;

  // 取出所有出现过的考场号，并按升序排序
  const classroomNumbers = Array.from(
    new Set(ctx.assignments.map((a) => a.classroom)),
  ).sort((a, b) => a - b);

  classroomNumbers.forEach((roomNum) => {
    // 取出该考场的所有学生，按座位号升序排序
    const roomAssignments = ctx.assignments
      .filter((a) => a.classroom === roomNum)
      .sort((a, b) => a.seat - b.seat);

    if (roomAssignments.length === 0) return;

    // 考场标题行：合并 A:D，写入“第X考场”
    titleRows.add(currentRow);
    seatPrintData.push([`第${roomNum}考场`, '', '', '']);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    currentRow++;

    // 学生数据行：每行两个学生，按顺序排列
    for (let i = 0; i < roomAssignments.length; i += 2) {
      const s1 = roomAssignments[i];
      const s2 = roomAssignments[i + 1];
      seatPrintData.push([
        s1 ? s1.examNumber : '',
        s1 ? s1.name : '',
        s2 ? s2.examNumber : '',
        s2 ? s2.name : '',
      ]);
      currentRow++;
    }
  });

  // 如果有未分配/跳过的学生，在最后添加
  if (ctx.remainingUnassigned.length > 0) {
    // 添加一个空行作为分隔
    seatPrintData.push(['', '', '', '']);
    currentRow++;

    // 添加未分配学生标题行（合并 A:D）
    titleRows.add(currentRow);
    seatPrintData.push(['未分配学生', '', '', '']);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    currentRow++;

    // 未分配学生信息，同样每行两个
    for (let i = 0; i < ctx.remainingUnassigned.length; i += 2) {
      const s1 = ctx.remainingUnassigned[i];
      const s2 = ctx.remainingUnassigned[i + 1];
      seatPrintData.push([
        s1 ? `${s1.class} - ${s1.name}` : '',
        '',
        s2 ? `${s2.class} - ${s2.name}` : '',
        '',
      ]);
      currentRow++;
    }
  }

  // 如果没有任何数据，至少放一个空行避免 !ref 为空
  if (seatPrintData.length === 0) {
    seatPrintData.push(['', '', '', '']);
  }

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(seatPrintData) as WorkSheet & Record<string, unknown>;

  // 应用合并单元格
  if (merges.length > 0) {
    ws['!merges'] = merges;
  }

  // 设置列宽（4列：考号|姓名|考号|姓名）
  ws['!cols'] = [
    { wch: 19.9 }, // A列 考号
    { wch: 17.9 }, // B列 姓名
    { wch: 19.9 }, // C列 考号
    { wch: 17.9 }, // D列 姓名
  ];

  // 设置行高（数据非空，!ref 必定存在）
  const range = XLSX.utils.decode_range(ws['!ref'] as string);
  const rowCount = range.e.r + 1;
  ws['!rows'] = [];
  for (let i = 0; i < rowCount; i++) {
    if (titleRows.has(i)) {
      // 考场标题行高度
      (ws['!rows'] as unknown[])[i] = { hpt: 30 };
    } else {
      // 学生数据行高度
      (ws['!rows'] as unknown[])[i] = { hpt: 75.0 };
    }
  }

  // 设置单元格样式
  for (let row = 0; row < rowCount; row++) {
    if (titleRows.has(row)) {
      // 考场标题行样式：宋体20号加粗居中，无底色（透明）
      const titleCellAddr = XLSX.utils.encode_cell({ r: row, c: 0 });
      const cell = ws[titleCellAddr] as { s?: Record<string, unknown> } | undefined;
      if (cell) {
        cell.s = {
          font: { name: '宋体', sz: 20, bold: true, charset: 134 },
          alignment: { vertical: 'center', horizontal: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
    } else {
      // 学生数据行：4列分别设置样式
      for (let c = 0; c < 4; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c });
        const cell = ws[cellAddr] as { v?: unknown; s?: Record<string, unknown> } | undefined;
        if (cell && cell.v !== '' && cell.v !== undefined) {
          if (!cell.s) cell.s = {};
          (cell.s as { font?: unknown }).font = {
            name: '宋体',
            sz: 20,
            bold: true,
            charset: 134,
          };
          (cell.s as { alignment?: unknown }).alignment = {
            vertical: 'center',
            horizontal: 'center',
          };
        }
      }
    }
  }

  // 设置打印方向为横向（landscape）
  ws['!pageSetup'] = {
    orientation: 'landscape',
    fitToWidth: 1,
    fitToHeight: 0,
  };
  // 打印时水平居中
  ws['!printOptions'] = { horizontalCentered: true };

  XLSX.utils.book_append_sheet(seatPrintWorkbook, ws, '座位表打印');
  return seatPrintWorkbook;
}

/** 下载总表（仅含总表工作表） */
export async function downloadTotalSheet(ctx: ExportContext): Promise<void> {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, await buildTotalWorksheet(ctx), '总表');
  XLSX.writeFile(workbook, '总表.xlsx');
}

/** 下载单个班级分配表 */
export async function downloadClassSheet(ctx: ExportContext, className: string): Promise<void> {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, await buildClassWorksheet(ctx, className), className);
  XLSX.writeFile(workbook, `${className}_分配表.xlsx`);
}

/** 下载单个考场分配表 */
export async function downloadRoomSheet(ctx: ExportContext, room: number): Promise<void> {
  const XLSX = await loadXLSX();
  const roomAssignments = ctx.assignments.filter((a) => a.classroom === room);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    await buildRoomWorksheet(room, roomAssignments),
    `第${room}考场`,
  );
  XLSX.writeFile(workbook, `第${room}考场_分配表.xlsx`);
}

/** 下载座位表打印 */
export async function downloadSeatPrint(ctx: ExportContext): Promise<void> {
  const XLSX = await loadXLSX();
  const workbook = await buildSeatPrintWorkbook(ctx);
  XLSX.writeFile(workbook, '座位表打印.xlsx');
}

/**
 * 下载完整分配表（总表 + 各班级 + 各考场 + 班级统计）。
 * 原版此按钮与“总表”闭包共享同一工作簿对象，本版明确区分。
 */
export async function downloadComplete(ctx: ExportContext): Promise<void> {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();

  // 总表
  XLSX.utils.book_append_sheet(workbook, await buildTotalWorksheet(ctx), '总表');

  // 各班级工作表
  for (const className of ctx.classNames) {
    if (ctx.assignments.some((a) => a.class === className)) {
      XLSX.utils.book_append_sheet(
        workbook,
        await buildClassWorksheet(ctx, className),
        className,
      );
    }
  }

  // 各考场工作表（1..classroomCount 中有数据的考场）
  for (let i = 1; i <= ctx.classroomCount; i++) {
    const classroomAssignments = ctx.assignments.filter((a) => a.classroom === i);
    if (classroomAssignments.length > 0) {
      XLSX.utils.book_append_sheet(
        workbook,
        await buildRoomWorksheet(i, classroomAssignments),
        `第${i}考场`,
      );
    }
  }

  // 班级统计（班级 / 参考人数 = 已分配，含手动分配）
  const statsData = ctx.classNames.map((className) => ({
    班级: className,
    参考人数: ctx.assignments.filter((a) => a.class === className).length,
  }));
  const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
  await applyWorksheetStyle(statsWorksheet, [18, 12]);
  XLSX.utils.book_append_sheet(workbook, statsWorksheet, '班级统计');

  XLSX.writeFile(workbook, '完整分配表.xlsx');
}
