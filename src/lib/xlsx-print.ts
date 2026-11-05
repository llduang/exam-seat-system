/**
 * 考场座位分配系统 —— XLSX 打印设置注入
 *
 * 背景：xlsx-js-style（SheetJS 社区分支）不支持写出 `!pageSetup` /
 * `!printOptions`（Pro 版功能），生成的 xlsx 在 Excel/WPS 中打开时
 * 恒为默认竖向打印、内容靠左，4 列宽表会被拆页，观感"歪"。
 *
 * 方案：用 fflate（约 8KB gzip）解开 xlsx 的 zip 包，向每个工作表 XML
 * 注入符合 OOXML schema 顺序的打印设置节点，再重新打包：
 *   <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>   ← 使 fitToWidth 生效
 *   <printOptions horizontalCentered="1"/>            ← 打印水平居中
 *   <pageMargins .../>                                ← 页边距（英寸）
 *   <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
 *
 * 节点顺序遵循 CT_Worksheet 序列：sheetPr 在最前（dimension 之前），
 * printOptions → pageMargins → pageSetup 在 </worksheet> 之前。
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

/** 打印设置 */
export interface PrintSetup {
  /** 纸张方向 */
  orientation: 'portrait' | 'landscape';
  /** 打印时水平居中 */
  horizontalCentered?: boolean;
  /** 缩放：宽度适应页数（0 = 不限） */
  fitToWidth?: number;
  /** 缩放：高度适应页数（0 = 不限） */
  fitToHeight?: number;
  /** 纸张大小（9 = A4） */
  paperSize?: number;
}

/** 在 xlsx 二进制中注入打印设置，返回新的二进制 */
export function injectPrintSetup(xlsxBytes: Uint8Array, setup: PrintSetup): Uint8Array {
  const files = unzipSync(xlsxBytes);
  const sheetNames = Object.keys(files).filter(
    (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );

  sheetNames.forEach((name) => {
    const xml = strFromU8(files[name]);
    files[name] = strToU8(patchSheetXml(xml, setup));
  });

  return zipSync(files, { level: 6 });
}

/** 向单个工作表 XML 注入打印设置节点 */
export function patchSheetXml(xml: string, setup: PrintSetup): string {
  let out = xml;

  // 1. sheetPr（fitToPage 总开关）：插入到 <worksheet ...> 开标签之后。
  //    若已存在 sheetPr 且含 pageSetUpPr 则不重复注入。
  if (!out.includes('<pageSetUpPr')) {
    const sheetPr = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
    const opened = out.match(/<worksheet[^>]*>/);
    if (opened) {
      out = out.replace(opened[0], opened[0] + sheetPr);
    }
  }

  // 2. 移除已有的 printOptions / pageMargins / pageSetup（防御，SheetJS 不写这些）
  out = out
    .replace(/<printOptions[^>]*\/?>(?:<\/printOptions>)?/g, '')
    .replace(/<pageMargins[^>]*\/?>(?:<\/pageMargins>)?/g, '')
    .replace(/<pageSetup[^>]*\/?>(?:<\/pageSetup>)?/g, '');

  // 3. 摘出 ignoredErrors：按 OOXML CT_Worksheet 顺序它排在 pageSetup 之后，
  //    而 SheetJS 把它写在 </worksheet> 前——若留在原位，注入的打印节点
  //    会排在它之前造成元素乱序（LibreOffice 等严格解析器会忽略打印设置）。
  let ignoredErrors = '';
  const ie = out.match(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/);
  if (ie) {
    ignoredErrors = ie[0];
    out = out.replace(ignoredErrors, '');
  }

  // 4. 在 </worksheet> 前按 schema 顺序插入：printOptions → pageMargins → pageSetup → ignoredErrors
  const tail =
    '<printOptions horizontalCentered="' +
    (setup.horizontalCentered ? '1' : '0') +
    '"/>' +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="' +
    (setup.paperSize ?? 9) +
    '" orientation="' +
    setup.orientation +
    '" fitToWidth="' +
    (setup.fitToWidth ?? 1) +
    '" fitToHeight="' +
    (setup.fitToHeight ?? 0) +
    '"/>' +
    ignoredErrors;
  out = out.replace('</worksheet>', tail + '</worksheet>');

  return out;
}

/** 触发浏览器下载二进制文件 */
export function saveBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
