'use client';

/**
 * 上传区：文件选择 + 三种 Excel 格式选择 + 单工作表格式的列映射。
 * 移植自单文件版的文件输入、.format-selector 与 #columnMapping。
 */

import type { ExcelFormat } from '@/lib/exam-data';

const FORMAT_OPTIONS: { id: ExcelFormat; title: string; desc: string }[] = [
  {
    id: 'multi-sheet',
    title: '多工作表格式',
    desc: '每个班级一个工作表；按表头自动识别“姓名”列（不固定第一列），若有“班级”列则以该列内容为准，否则按工作表名分班',
  },
  {
    id: 'single-sheet',
    title: '单工作表格式',
    desc: '一个工作表包含所有学生，有“姓名”和“班级”列，上传后自动匹配列（可手动调整）',
  },
  {
    id: 'multi-file',
    title: '多文件格式',
    desc: '每个班级一个Excel文件；按表头自动识别“姓名”列，若有“班级”列则以该列内容为准，否则班级名从文件名识别（如“02.xlsx”即02班）',
  },
];

interface UploadSectionProps {
  format: ExcelFormat;
  onFormatChange: (format: ExcelFormat) => void;
  columnHeaders: string[];
  nameColumn: number | null;
  classColumn: number | null;
  onNameColumnChange: (value: number | null) => void;
  onClassColumnChange: (value: number | null) => void;
  onFilesSelected: (files: FileList | File[]) => void;
}

export default function UploadSection({
  format,
  onFormatChange,
  columnHeaders,
  nameColumn,
  classColumn,
  onNameColumnChange,
  onClassColumnChange,
  onFilesSelected,
}: UploadSectionProps) {
  return (
    <div className="mb-5">
      <div className="mb-5">
        <label htmlFor="excelFile" className="mb-2 block font-bold text-gray-600">
          上传学生名单Excel文件（可同时选择多个文件）：
        </label>
        <input
          id="excelFile"
          type="file"
          accept=".xlsx, .xls"
          multiple
          className="w-full cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-3 text-base file:mr-3 file:rounded file:border-0 file:bg-blue-500 file:px-4 file:py-1.5 file:text-white hover:file:bg-blue-600"
          onChange={(e) => {
            if (e.target.files?.length) onFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div>
        <label className="mb-2 block font-bold text-gray-600">选择Excel文件格式：</label>
        <div className="flex flex-wrap gap-5">
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.id;
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => onFormatChange(opt.id)}
                className={
                  'min-w-[180px] flex-1 rounded-md border p-4 text-left transition-all ' +
                  (selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:bg-gray-50')
                }
              >
                <h3 className="mt-0 text-base font-bold text-blue-600">{opt.title}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {format === 'single-sheet' && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <label htmlFor="nameColumn" className="flex-1 font-bold text-gray-600">
              姓名列：
            </label>
            <select
              id="nameColumn"
              className="flex-[2] rounded-md border border-gray-300 bg-white px-3 py-2.5"
              value={nameColumn ?? ''}
              onChange={(e) =>
                onNameColumnChange(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">请选择列</option>
              {columnHeaders.map((header, index) => (
                <option key={index} value={index}>
                  {header || `列 ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <label htmlFor="classColumn" className="flex-1 font-bold text-gray-600">
              班级列：
            </label>
            <select
              id="classColumn"
              className="flex-[2] rounded-md border border-gray-300 bg-white px-3 py-2.5"
              value={classColumn ?? ''}
              onChange={(e) =>
                onClassColumnChange(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">请选择列</option>
              {columnHeaders.map((header, index) => (
                <option key={index} value={index}>
                  {header || `列 ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            多个文件同时上传时按第一个文件的列名解析，所有文件需保持相同的列结构
          </p>
        </div>
      )}
    </div>
  );
}
