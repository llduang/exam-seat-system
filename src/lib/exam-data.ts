/**
 * 考场座位分配系统 —— Excel 文件读取与班级/学生数据提取
 *
 * 移植自单文件版 readFilesAsWorkbooks / extractClassDataFromLoaded /
 * refreshClassRecognition / populateColumnSelects，并升级：
 * 所有格式均按表头自动检测姓名/班级列（不再固定第一列为姓名）。
 * XLSX 运行库按需动态加载（浏览器端首屏不打包进主 bundle）。
 */

import type { WorkBook } from 'xlsx-js-style';
// 显式 .ts 扩展：Node 原生 type stripping 可直接运行本模块（供 scripts/ 单元测试）
import { examNormalizeClassGroups, type ClassNormalization } from './exam-core.ts';

/** Excel 文件格式 */
export type ExcelFormat = 'multi-sheet' | 'single-sheet' | 'multi-file';

/** 单工作表格式的列选择 */
export interface ColumnSelection {
  /** 姓名列下标（0 基），未选为 null */
  nameColumn: number | null;
  /** 班级列下标（0 基），未选为 null */
  classColumn: number | null;
}

/** 已加载的 Excel 文件（缓存，避免重复解析） */
export interface LoadedFile {
  fileName: string;
  workbook: WorkBook;
}

type XLSXModule = typeof import('xlsx-js-style');

let cachedXLSX: XLSXModule | null = null;

/** 动态加载 xlsx-js-style（模块级缓存） */
export async function loadXLSX(): Promise<XLSXModule> {
  if (!cachedXLSX) {
    const mod = await import('xlsx-js-style');
    cachedXLSX = ((mod as unknown as { default?: XLSXModule }).default ?? mod) as XLSXModule;
  }
  return cachedXLSX;
}

/** 读取多个 Excel 文件为工作簿 */
export async function readFilesAsWorkbooks(files: FileList | File[]): Promise<LoadedFile[]> {
  const list = Array.from(files);
  return Promise.all(
    list.map(
      (file) =>
        new Promise<LoadedFile>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = function (e) {
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              loadXLSX()
                .then((XLSX) => {
                  try {
                    const workbook = XLSX.read(data, { type: 'array' });
                    resolve({ fileName: file.name, workbook: workbook });
                  } catch (err) {
                    reject(new Error('文件 “' + file.name + '” 读取失败: ' + (err as Error).message));
                  }
                })
                .catch((err) => {
                  // 运行库动态加载失败也必须让外层 promise 落定，否则 UI 永远等待
                  reject(new Error('文件 “' + file.name + '” 读取失败: ' + (err as Error).message));
                });
            } catch (err) {
              reject(new Error('文件 “' + file.name + '” 读取失败: ' + (err as Error).message));
            }
          };
          reader.onerror = function () {
            reject(new Error('文件 “' + file.name + '” 读取失败'));
          };
          reader.readAsArrayBuffer(file);
        }),
    ),
  );
}

/** 从文件名提取班级名（去掉扩展名） */
export function examFileBaseName(fileName: string): string {
  return String(fileName).replace(/\.[^.]+$/, '').trim();
}

/** 表头单元格判定：是否“姓名”列表头 */
function isNameHeaderCell(cell: unknown): boolean {
  if (cell === undefined || cell === null) return false;
  const s = String(cell).trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes('姓名') ||
    s.includes('名字') ||
    s.includes('name') ||
    s === '考生' ||
    s === '学生' ||
    s === 'student'
  );
}

/**
 * 表头单元格判定：是否“班级”列表头。
 * loose=true 时放宽到含“级”字（仅用于单表格式的人工可改预选；
 * 静默自动检测用 false，避免“年级”等误判）。
 */
function isClassHeaderCell(cell: unknown, loose: boolean): boolean {
  if (cell === undefined || cell === null) return false;
  const s = String(cell).trim().toLowerCase();
  if (!s) return false;
  if (s.includes('班级') || s.includes('班别')) return true;
  if (s.includes('class') && !s.includes('name')) return true;
  return loose && s.includes('级');
}

/** 工作表表头自动检测结果 */
export interface SheetColumnDetection {
  /** 表头行下标（0 基）；null 表示未检测到表头行 */
  headerRowIndex: number | null;
  /** 姓名列下标（0 基）；-1 表示未检测到 */
  nameIndex: number;
  /** 班级列下标（0 基）；-1 表示未检测到 */
  classIndex: number;
  /** 姓名列表头原文 */
  nameHeader: string;
  /** 班级列表头原文 */
  classHeader: string;
}

/**
 * 在工作表前若干行中寻找表头行并识别姓名/班级列。
 * 表头行 = 首个合“姓名”类表头的行（兼容标题占行）；
 * 未检测到时返回 headerRowIndex=null，由调用方回退旧行为。
 */
export function detectSheetColumns(
  rows: unknown[][],
  maxScanRows = 5,
): SheetColumnDetection {
  const scanEnd = Math.min(maxScanRows, rows.length);
  for (let r = 0; r < scanEnd; r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    let nameIndex = -1;
    for (let c = 0; c < row.length; c++) {
      if (isNameHeaderCell(row[c])) {
        nameIndex = c;
        break;
      }
    }
    if (nameIndex === -1) continue;
    let classIndex = -1;
    for (let c = 0; c < row.length; c++) {
      if (c === nameIndex) continue;
      if (isClassHeaderCell(row[c], false)) {
        classIndex = c;
        break;
      }
    }
    return {
      headerRowIndex: r,
      nameIndex: nameIndex,
      classIndex: classIndex,
      nameHeader: String(row[nameIndex] ?? '').trim(),
      classHeader: classIndex !== -1 ? String(row[classIndex] ?? '').trim() : '',
    };
  }
  return { headerRowIndex: null, nameIndex: -1, classIndex: -1, nameHeader: '', classHeader: '' };
}

/** 工作表学生行（classFromColumn = “班级”列内容，无班级列或值为空时为 null） */
interface SheetStudentRow {
  name: string;
  classFromColumn: string | null;
}

/**
 * 读取工作表学生：按表头自动识别姓名/班级列（不固定第一列）。
 * 未检测到表头时回退旧行为：首行视为表头、第一列为姓名。
 */
async function readStudentsFromSheet(
  worksheet: unknown,
): Promise<{ students: SheetStudentRow[]; detection: SheetColumnDetection }> {
  const XLSX = await loadXLSX();
  const rows = XLSX.utils.sheet_to_json(worksheet as never, { header: 1 }) as unknown[][];
  const detection = detectSheetColumns(rows);
  const detected = detection.headerRowIndex !== null && detection.nameIndex >= 0;
  const nameIdx = detected ? detection.nameIndex : 0;
  const startRow = detection.headerRowIndex !== null ? detection.headerRowIndex + 1 : 1;
  const classIdx = detection.classIndex;
  const students: SheetStudentRow[] = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const nameValue = row[nameIdx];
    if (nameValue === undefined || nameValue === null) continue;
    const name = String(nameValue).trim();
    if (!name) continue;
    let classFromColumn: string | null = null;
    if (classIdx >= 0) {
      const classValue = row[classIdx];
      if (classValue !== undefined && classValue !== null) {
        const cls = String(classValue).trim();
        if (cls) classFromColumn = cls;
      }
    }
    students.push({ name: name, classFromColumn: classFromColumn });
  }
  return { students: students, detection: detection };
}

/** 班级/学生提取结果 */
export interface ClassExtraction {
  rawClassNames: string[];
  studentsByRawClass: Record<string, string[]>;
  /** 单工作表格式但尚未选择列 */
  needColumns?: boolean;
  /** 数据读取方式说明（表头自动识别情况等，展示在识别框） */
  notes: string[];
}

/**
 * 按当前格式从已加载文件中提取班级与学生。
 * 多工作表/多文件：按表头自动识别姓名列与班级列（不固定第一列），
 * 班级优先取“班级”列内容，无班级列或值为空时回退工作表名/文件名。
 * 单工作表：按用户所选列读取（表头行自动检测，兼容标题占行）。
 */
export async function extractClassData(
  loadedFiles: LoadedFile[],
  format: ExcelFormat,
  columns: ColumnSelection,
): Promise<ClassExtraction> {
  const rawClassNames: string[] = [];
  const studentsByRawClass: Record<string, string[]> = {};
  const addClass = function (raw: string) {
    if (!(raw in studentsByRawClass)) {
      studentsByRawClass[raw] = [];
      rawClassNames.push(raw);
    }
  };
  const pushStudent = function (raw: string, name: string) {
    addClass(raw);
    studentsByRawClass[raw].push(name);
  };

  if (format === 'multi-sheet' || format === 'multi-file') {
    // 多工作表格式：所有文件的所有工作表；多文件格式：每文件第一个工作表。
    // 共用按表头自动识别的读取逻辑，班级列值优先，回退工作表名/文件名。
    const fallbackName = format === 'multi-sheet' ? '工作表名' : '文件名';
    let detectedSheets = 0;
    let sheetsWithClassColumn = 0;
    let fallbackSheets = 0;
    let firstNameHeader = '';
    let firstClassHeader = '';

    const consumeSheet = async function (fallbackClass: string, worksheet: unknown) {
      const { students, detection } = await readStudentsFromSheet(worksheet);
      const detected = detection.headerRowIndex !== null && detection.nameIndex >= 0;
      if (detected) {
        detectedSheets++;
        if (!firstNameHeader) firstNameHeader = detection.nameHeader;
        if (detection.classIndex >= 0) {
          sheetsWithClassColumn++;
          if (!firstClassHeader) firstClassHeader = detection.classHeader;
        }
      } else {
        fallbackSheets++;
      }
      students.forEach(function (s) {
        pushStudent(s.classFromColumn ?? fallbackClass, s.name);
      });
    };

    if (format === 'multi-sheet') {
      for (const f of loadedFiles) {
        for (const sheetName of f.workbook.SheetNames) {
          await consumeSheet(sheetName, f.workbook.Sheets[sheetName]);
        }
      }
    } else {
      for (const f of loadedFiles) {
        const sheetName = f.workbook.SheetNames[0];
        if (sheetName) {
          await consumeSheet(examFileBaseName(f.fileName), f.workbook.Sheets[sheetName]);
        }
      }
    }

    const notes: string[] = [];
    if (detectedSheets > 0) {
      let note =
        '已按表头自动识别“' +
        (firstNameHeader || '姓名') +
        '”为姓名列';
      if (sheetsWithClassColumn > 0) {
        note +=
          '，“' +
          (firstClassHeader || '班级') +
          '”为班级列（班级以该列内容为准，空值回退' +
          fallbackName +
          '）';
      } else {
        note += '，未发现“班级”列（班级按' + fallbackName + '）';
      }
      notes.push(note);
    }
    if (fallbackSheets > 0) {
      notes.push(
        fallbackSheets + ' 个工作表未识别到“姓名”表头，已按第一列读取（首行视为表头）',
      );
    }
    return { rawClassNames: rawClassNames, studentsByRawClass: studentsByRawClass, notes: notes };
  }

  // 单工作表格式：每个文件的第一个工作表，按所选列读取
  if (columns.nameColumn === null || columns.classColumn === null) {
    return { needColumns: true, rawClassNames: [], studentsByRawClass: {}, notes: [] };
  }
  const nameIdx = columns.nameColumn;
  const classIdx = columns.classColumn;
  const XLSX = await loadXLSX();
  for (const f of loadedFiles) {
    const sheetName = f.workbook.SheetNames[0];
    if (!sheetName) continue;
    const rows = XLSX.utils.sheet_to_json(f.workbook.Sheets[sheetName], {
      header: 1,
    }) as unknown[][];
    // 表头行自动检测（兼容标题占行）；列下标以 getFirstSheetHeaders
    // 返回的表头行为准，数据从检测到的表头行之后开始
    const detection = detectSheetColumns(rows);
    const startRow = detection.headerRowIndex !== null ? detection.headerRowIndex + 1 : 1;
    for (let i = startRow; i < rows.length; i++) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      const nameValue = row[nameIdx];
      const classValue = row[classIdx];
      if (
        nameValue !== undefined && nameValue !== null &&
        classValue !== undefined && classValue !== null
      ) {
        const name = String(nameValue).trim();
        const cls = String(classValue).trim();
        if (name && cls) {
          pushStudent(cls, name);
        }
      }
    }
  }
  return { rawClassNames: rawClassNames, studentsByRawClass: studentsByRawClass, notes: [] };
}

/** 班级识别展示状态 */
export type RecognitionState =
  | { mode: 'need-columns'; title: string; tags: string[]; notes: string[]; numbers: Record<string, number> }
  | { mode: 'none'; title: string; tags: string[]; notes: string[]; numbers: Record<string, number> }
  | {
      mode: 'ok';
      title: string;
      tags: string[];
      notes: string[];
      numbers: Record<string, number>;
      normalization: ClassNormalization;
    };

/**
 * 计算班级识别展示状态（原 refreshClassRecognition 的纯函数化）
 * 返回 null 表示无文件，不显示识别框。
 */
export async function computeRecognition(
  loadedFiles: LoadedFile[],
  format: ExcelFormat,
  columns: ColumnSelection,
): Promise<RecognitionState | null> {
  if (!loadedFiles.length) return null;
  if (format === 'single-sheet') {
    if (columns.nameColumn === null || columns.classColumn === null) {
      return {
        mode: 'need-columns',
        title: '文件已加载，请选择姓名列和班级列',
        tags: [],
        notes: [],
        numbers: {},
      };
    }
  }
  const extraction = await extractClassData(loadedFiles, format, columns);
  if (!extraction.rawClassNames.length) {
    return {
      mode: 'none',
      title: '未能识别到班级，请检查文件格式或列选择是否正确',
      tags: [],
      notes: [],
      numbers: {},
    };
  }
  const norm = examNormalizeClassGroups(extraction.rawClassNames);
  const tags: string[] = norm.groups.map((g) => g.display);
  const notes: string[] = [];
  // 数据读取方式说明（表头自动识别情况）排在最前
  extraction.notes.forEach(function (n) {
    notes.push(n);
  });
  norm.merges.forEach(function (m) {
    notes.push('“' + m.forms.join('”、“') + '”是同一班级的不同写法，已合并为“' + m.display + '”');
  });
  norm.notes.forEach(function (n) { notes.push(n); });
  const numbers: Record<string, number> = {};
  norm.groups.forEach(function (g) { numbers[g.display] = g.classNumber; });
  return {
    mode: 'ok',
    title: '已识别 ' + norm.groups.length + ' 个班级（已自动统一写法并按班级号排序）：',
    tags: tags,
    notes: notes,
    numbers: numbers,
    normalization: norm,
  };
}

/**
 * 取第一个文件第一个工作表的表头（用于单工作表格式的列选择）。
 * 表头行自动检测：标题占行时返回真正的表头行。
 */
export async function getFirstSheetHeaders(loadedFiles: LoadedFile[]): Promise<string[]> {
  if (!loadedFiles.length) return [];
  const workbook = loadedFiles[0].workbook;
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet || !worksheet['!ref']) return [];
  const XLSX = await loadXLSX();
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
  if (!rows.length) return [];
  const detection = detectSheetColumns(rows);
  const headerRowIdx = detection.headerRowIndex !== null ? detection.headerRowIndex : 0;
  const firstRow = Array.isArray(rows[headerRowIdx]) ? rows[headerRowIdx] : [];
  return firstRow.map((header) => {
    if (header === undefined || header === null) return '';
    return String(header);
  });
}

/**
 * 表头自动匹配列下标（单工作表格式的预选，人工可改）。
 * 姓名判定与自动检测一致；班级判定用宽松模式（含“级”字）。
 * 返回 {nameIndex, classIndex}，-1 表示未匹配到。
 */
export function autoMatchColumns(columnHeaders: string[]): {
  nameIndex: number;
  classIndex: number;
} {
  const nameIndex = columnHeaders.findIndex((h) => isNameHeaderCell(h));
  const classIndex = columnHeaders.findIndex((h) => isClassHeaderCell(h, true));
  // 防止同一列同时被选为姓名列和班级列（如“班级姓名”这类表头）
  if (classIndex !== -1 && classIndex === nameIndex) {
    return { nameIndex: nameIndex, classIndex: -1 };
  }
  return { nameIndex: nameIndex, classIndex: classIndex };
}
