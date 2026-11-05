/**
 * 考场座位分配系统 —— 考场座位表 PDF 生成
 *
 * 版式规则（v3 重写，修复"满员考场被整页缩小、左右大片留白"的问题）：
 * 1. 每页固定 A4 高 297mm，内容在页内垂直居中 → 短考场不再头重脚轻；
 * 2. 单个考场人数超过单页容量时自动分页（续页重复表头，标题加"续"），
 *    不再做整页等比缩放 → 表格恒为 100% 内容宽度，无左右白边；
 * 3. 考场内按座位号升序排列，便于对照座位找学生；
 * 4. 单元格全部用 DOM API + textContent 构建，Excel 来源的姓名/班级
 *    不再进入 innerHTML，杜绝 HTML 注入。
 */

import type { Assignment } from './exam-assign';

/** PDF 生成上下文 */
export interface PdfContext {
  assignments: Assignment[];
  classroomCount: number;
  seatCount: number;
}

/** 状态回调（原 showStatusMessage） */
export interface PdfHooks {
  onStatus: (message: string, type: 'info' | 'success' | 'error') => void;
}

/** A4 竖版尺寸（mm） */
const PAGE_W = 210;
const PAGE_H = 297;

/**
 * 每页最多渲染的学生行数。
 * 估算：内容区高 297-30=267mm（约 1009px），标题区约 69px、表头约 37px，
 * 每行约 31px → 理论上限约 29 行；取 26 行保留 10% 余量，保证任何
 * 环境字体渲染差异下都不会溢出一页（溢出会被 flex 居中裁切）。
 */
const MAX_ROWS_PER_PAGE = 26;

/** 一页 PDF 的数据（某考场的一片段） */
interface RoomPage {
  roomNum: number;
  /** 本页学生（已按座位号排序） */
  rows: Assignment[];
  /** 考场总人数 */
  total: number;
  /** 本页首行在整个考场中的序号偏移（0 起） */
  offset: number;
  /** 是否续页 */
  continued: boolean;
}

/** 生成考场座位表 PDF（每页一个考场，人数过多时自动分页） */
export async function generateSeatPdf(ctx: PdfContext, hooks: PdfHooks): Promise<void> {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;

  const { assignments, classroomCount } = ctx;

  // 收集有效考场，考场内按座位号升序
  const validRooms: { roomNum: number; rows: Assignment[] }[] = [];
  for (let i = 1; i <= classroomCount; i++) {
    const roomAssignments = assignments
      .filter((a) => a.classroom === i)
      .sort((a, b) => a.seat - b.seat);
    if (roomAssignments.length > 0) {
      validRooms.push({ roomNum: i, rows: roomAssignments });
    }
  }

  if (validRooms.length === 0) {
    hooks.onStatus('没有可用的考场数据来生成PDF', 'error');
    return;
  }

  // 按每页容量切分（序号在考场内连续，不因分页重置）
  const pages: RoomPage[] = [];
  validRooms.forEach((room) => {
    const pageCount = Math.max(1, Math.ceil(room.rows.length / MAX_ROWS_PER_PAGE));
    for (let p = 0; p < pageCount; p++) {
      pages.push({
        roomNum: room.roomNum,
        rows: room.rows.slice(p * MAX_ROWS_PER_PAGE, (p + 1) * MAX_ROWS_PER_PAGE),
        total: room.rows.length,
        offset: p * MAX_ROWS_PER_PAGE,
        continued: p > 0,
      });
    }
  });

  // 创建隐藏的渲染容器
  const renderContainer = document.createElement('div');
  renderContainer.id = 'pdf-render-container';
  renderContainer.style.cssText = 'position:fixed; left:-9999px; top:0; z-index:-1;';
  document.body.appendChild(renderContainer);

  pages.forEach((pageData) => {
    renderContainer.appendChild(buildPageDiv(pageData));
  });

  hooks.onStatus(`正在生成PDF，共 ${pages.length} 页，请稍候...`, 'info');

  // 逐页渲染（html2canvas）→ jsPDF 拼页
  const pdf = new jsPDF('p', 'mm', 'a4');
  let currentPage = 0;

  const renderNextPage = (): void => {
    if (currentPage >= pages.length) {
      // 完成：保存PDF并清理
      pdf.save('考场座位分配表.pdf');
      renderContainer.remove();
      hooks.onStatus(
        `PDF文件已生成并开始下载！共 ${pages.length} 页（人数较多的考场已自动分页）`,
        'success',
      );
      return;
    }

    const page = renderContainer.children[currentPage] as HTMLElement;

    html2canvas(page, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: page.offsetWidth,
      height: page.offsetHeight,
      logging: false,
    })
      .then((canvas) => {
        if (currentPage > 0) {
          pdf.addPage();
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        // 页面恒为整张 A4（div 固定 210×297mm），满幅放置，无需缩放
        pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_W, PAGE_H);

        currentPage++;
        if (currentPage < pages.length) {
          hooks.onStatus(`正在生成PDF：第 ${currentPage + 1}/${pages.length} 页...`, 'info');
        }
        renderNextPage();
      })
      .catch((err: unknown) => {
        renderContainer.remove();
        hooks.onStatus('生成PDF时出错: ' + (err as Error).message, 'error');
      });
  };

  renderNextPage();
}

/** 构建一页的 DOM（安全：全部 textContent，无 innerHTML） */
function buildPageDiv(page: RoomPage): HTMLElement {
  const pageDiv = document.createElement('div');
  pageDiv.className = 'pdf-page';
  pageDiv.style.cssText = `
    width: ${PAGE_W}mm;
    height: ${PAGE_H}mm;
    padding: 15mm 12mm;
    background: white;
    font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    page-break-after: always;
  `;

  // 考场标题
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = `
    text-align: center;
    margin-bottom: 6mm;
    padding-bottom: 4mm;
    border-bottom: 2px solid #000;
  `;
  const titleText = document.createElement('div');
  titleText.style.cssText = 'font-size: 22px; font-weight: bold; color: #000;';
  titleText.textContent =
    `第${page.roomNum}考场` +
    (page.continued ? '（续）' : '') +
    `（共${page.total}人）`;
  titleDiv.appendChild(titleText);
  pageDiv.appendChild(titleDiv);

  // 表格
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: #000;
    table-layout: fixed;
  `;

  // 表头（百分比列宽，任何缩放下比例稳定）
  const COLS: { label: string; width: string }[] = [
    { label: '序号', width: '10%' },
    { label: '座位号', width: '14%' },
    { label: '考号', width: '36%' },
    { label: '姓名', width: '20%' },
    { label: '班级', width: '20%' },
  ];
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  COLS.forEach((col) => {
    const th = document.createElement('th');
    th.style.cssText = `
      border: 2px solid #000;
      padding: 8px 6px;
      color: #000;
      font-size: 13px;
      font-weight: bold;
      width: ${col.width};
    `;
    th.textContent = col.label;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  // 表体（序号为考场内连续编号，分页不重置）
  const tbody = document.createElement('tbody');
  page.rows.forEach((a, idx) => {
    const tr = document.createElement('tr');
    const cells: { text: string; mono?: boolean }[] = [
      { text: String(page.offset + idx + 1) },
      { text: String(a.seat) },
      { text: a.examNumber, mono: true },
      { text: a.name },
      { text: a.class },
    ];
    cells.forEach((cell) => {
      const td = document.createElement('td');
      td.style.cssText = `
        border: 1px solid #000;
        padding: 6px;
        text-align: center;
        font-weight: bold;
        overflow: hidden;
        word-break: break-all;
        ${cell.mono ? "font-family: 'Courier New', monospace; letter-spacing: 1px;" : ''}
      `;
      td.textContent = cell.text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  pageDiv.appendChild(table);

  return pageDiv;
}
