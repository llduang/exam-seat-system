/**
 * 考场座位分配系统 —— Excel 文件读取与班级/学生数据提取
 *
 * 移植自单文件版 readFilesAsWorkbooks / extractClassDataFromLoaded /
 * refreshClassRecognition / populateColumnSelects，逻辑逐行等价。
 * XLSX 运行库按需动态加载（浏览器端首屏不打包进主 bundle）。
 */

import type { WorkBook } from 'xlsx-js-style';
import { examNormalizeClassGroups, type ClassNormalization } from './exam-core';

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
              loadXLSX().then((XLSX) => {
                try {
                  const workbook = XLSX.read(data, { type: 'array' });
                  resolve({ fileName: file.name, workbook: workbook });
                } catch (err) {
                  reject(new Error('文件 “' + file.name + '” 读取失败: ' + (err as Error).message));
                }
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

/** 读取工作表第一列的学生姓名（第一行为表头） */
async function readStudentNamesFromSheet(worksheet: unknown): Promise<string[]> {
  const XLSX = await loadXLSX();
  const rows = XLSX.utils.sheet_to_json(worksheet as never, { header: 1 }) as unknown[][];
  const students: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    if (row.length > 0 && row[0] !== undefined && row[0] !== null) {
      const studentName = String(row[0]).trim();
      if (studentName) students.push(studentName);
    }
  }
  return students;
}

/** 班级/学生提取结果 */
export interface ClassExtraction {
  rawClassNames: string[];
  studentsByRawClass: Record<string, string[]>;
  /** 单工作表格式但尚未选择列 */
  needColumns?: boolean;
}

/**
 * 按当前格式从已加载文件中提取班级与学生
 * （原 extractClassDataFromLoaded，参数由 DOM 读取改为显式传参）
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

  if (format === 'multi-sheet') {
    // 多工作表格式：所有文件的所有工作表，每个工作表一个班级
    for (const f of loadedFiles) {
      for (const sheetName of f.workbook.SheetNames) {
        addClass(sheetName);
        studentsByRawClass[sheetName] = studentsByRawClass[sheetName].concat(
          await readStudentNamesFromSheet(f.workbook.Sheets[sheetName]),
        );
      }
    }
  } else if (format === 'multi-file') {
    // 多文件格式：每个文件一个班级，班级名取自文件名，读取第一个工作表
    for (const f of loadedFiles) {
      const raw = examFileBaseName(f.fileName);
      addClass(raw);
      const sheetName = f.workbook.SheetNames[0];
      if (sheetName) {
        studentsByRawClass[raw] = studentsByRawClass[raw].concat(
          await readStudentNamesFromSheet(f.workbook.Sheets[sheetName]),
        );
      }
    }
  } else {
    // 单工作表格式：每个文件的第一个工作表，按所选列读取
    if (columns.nameColumn === null || columns.classColumn === null) {
      return { needColumns: true, rawClassNames: [], studentsByRawClass: {} };
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
      for (let i = 1; i < rows.length; i++) {
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
            addClass(cls);
            studentsByRawClass[cls].push(name);
          }
        }
      }
    }
  }
  return { rawClassNames: rawClassNames, studentsByRawClass: studentsByRawClass };
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

/** 取第一个文件第一个工作表的表头（用于单工作表格式的列选择） */
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
  const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
  return firstRow.map((header) => {
    if (header === undefined || header === null) return '';
    return String(header);
  });
}

/**
 * 表头自动匹配列下标（原 populateColumnSelects 中的自动匹配逻辑）
 * 返回 {nameIndex, classIndex}，-1 表示未匹配到。
 */
export function autoMatchColumns(columnHeaders: string[]): {
  nameIndex: number;
  classIndex: number;
} {
  const nameIndex = columnHeaders.findIndex((h) => {
    if (!h) return false;
    const headerStr = String(h).toLowerCase();
    return headerStr.includes('姓名') || headerStr.includes('名字') || headerStr.includes('name');
  });
  const classIndex = columnHeaders.findIndex((h) => {
    if (!h) return false;
    const headerStr = String(h).toLowerCase();
    return headerStr.includes('班级') || headerStr.includes('级') || headerStr.includes('class');
  });
  return { nameIndex: nameIndex, classIndex: classIndex };
}
