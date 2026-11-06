/**
 * 考场座位分配系统 —— 考场座位表 PDF 生成（v4）
 *
 * v4 目标：对标专业扫描 App（如布丁扫描）的成品观感——
 * 纯白底、锐利黑字、规整细线表格、清晰的标题层级、对称留白。
 *
 * 相对 v3 的关键升级：
 * 1. 渲染倍率 1.5 → 3（A4 下约 288 DPI，达到激光打印精度）；
 * 2. 编码 JPEG(0.85) → 无损 PNG 优先（文本页更小且无振铃噪点），
 *    超过体积阈值才回退 JPEG(0.95)；
 * 3. 版式重排（对标布丁扫描的表格文档观感，经 VLM 三轮评审迭代）：
 *    - 删除与座位号恒等的冗余"序号"列；列宽按内容重新分配；
 *    - 单线文头 + 3% 灰底表头 + 三档线宽（外框/表头下沿 3px、内线 1px）；
 *    - 页顶对齐文档式排版，页脚居中页码"第 n 页 / 共 m 页"；
 * 4. 智能分页与自适应行高：
 *    - 均衡分页（30 人 → 15+15，而非 26+4），末页不再寥寥数行；
 *    - 短页行高自适应拉高（31~88px），配合弹性备注框（监考教师/
 *      考试日期/备注，flex 自动吃掉剩余空间，上限 70mm），
 *      消除"数据几行、纸很大"的空洞；
 * 5. 字体栈补全 Noto Sans SC / PingFang SC / Source Han Sans SC /
 *    WenQuanYi，Windows、macOS、Linux、Android 都能落到正常黑体，
 *    不再依赖 Microsoft YaHei 单一字体；
 * 6. 结构拆分：splitSeatPages（纯函数，Node 可直接单测）、
 *    buildSeatPageDiv（DOM 构建，浏览器可独立预览）、
 *    generateSeatPdf（渲染 + 拼页流水线）；
 * 7. 单元格全部用 DOM API + textContent 构建，Excel 来源的姓名/班级
 *    不进入 innerHTML，杜绝 HTML 注入（v3 起延续）。
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
export const PAGE_W = 210;
export const PAGE_H = 297;

/**
 * 每页最多渲染的学生行数（决定单考场分页数：页数 = ceil(人数/本值)）。
 * 推导（96dpi 基准，1mm ≈ 3.7795px）：
 *   页边距 上16/下12mm → 内容区高 269mm ≈ 1016px；
 *   拼版模型区（见 computeRowHeight）：标题 120 + 表头 42 + 安全余量 32
 *   → 可用 822px；行高下限 31px（标准紧凑行）。
 *   822 / 31 ≈ 26.5 → 取 26。
 * 注意：均衡分页后单页最多 ceil(n/页数) ≤ 26，行高自适应时不会溢出；
 * 各平台字体度量差异与长名字换行余量由 SAFETY 32px 吸收。
 */
export const MAX_ROWS_PER_PAGE = 26;

/** 一页 PDF 的数据（某考场的一片段） */
export interface RoomPage {
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

/**
 * 把分配结果切成"页"：跳过空考场，考场内按座位号升序；
 * 单考场超过单页容量时**均衡分页**（30 人 → 15+15 而非 26+4），
 * 避免末页只有寥寥几行、下半页大片空洞（VLM 评审第 2 轮修正）。
 * 纯函数，无 DOM 依赖，Node 中可直接单元测试。
 */
export function splitSeatPages(
  assignments: Assignment[],
  classroomCount: number,
): RoomPage[] {
  const validRooms: { roomNum: number; rows: Assignment[] }[] = [];
  for (let i = 1; i <= classroomCount; i++) {
    const roomAssignments = assignments
      .filter((a) => a.classroom === i)
      .sort((a, b) => a.seat - b.seat);
    if (roomAssignments.length > 0) {
      validRooms.push({ roomNum: i, rows: roomAssignments });
    }
  }

  const pages: RoomPage[] = [];
  validRooms.forEach((room) => {
    const pageCount = Math.max(1, Math.ceil(room.rows.length / MAX_ROWS_PER_PAGE));
    // 均衡分布：前 (n % p) 页各多 1 行，任一页不超过容量
    const base = Math.floor(room.rows.length / pageCount);
    const extra = room.rows.length % pageCount;
    let offset = 0;
    for (let p = 0; p < pageCount; p++) {
      const count = base + (p < extra ? 1 : 0);
      pages.push({
        roomNum: room.roomNum,
        rows: room.rows.slice(offset, offset + count),
        total: room.rows.length,
        offset,
        continued: p > 0,
      });
      offset += count;
    }
  });
  return pages;
}

/** 全文档页码信息（页脚"第 n 页 / 共 m 页"） */
export interface PageFooter {
  index: number;
  total: number;
}

/**
 * 生成考场座位表 PDF（每页一个考场，人数过多时自动分页）。
 * 渲染流水线：DOM 页 → html2canvas(scale 3) → PNG/JPEG → jsPDF 满幅 A4。
 */
export async function generateSeatPdf(ctx: PdfContext, hooks: PdfHooks): Promise<void> {
  const { assignments, classroomCount } = ctx;

  const pages = splitSeatPages(assignments, classroomCount);
  if (pages.length === 0) {
    hooks.onStatus('没有可用的考场数据来生成PDF', 'error');
    return;
  }

  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;

  // 创建隐藏的渲染容器（远离视口，避免 1px 取整偏移）
  const renderContainer = document.createElement('div');
  renderContainer.id = 'pdf-render-container';
  renderContainer.style.cssText = 'position:fixed; left:-99999px; top:0; z-index:-1;';
  document.body.appendChild(renderContainer);

  hooks.onStatus(`正在生成PDF，共 ${pages.length} 页（高清渲染，稍等）...`, 'info');

  try {
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({
      title: '考场座位表',
      subject: `${classroomCount} 个考场的座位分配明细`,
      creator: '考场座位分配系统',
    });

    for (let i = 0; i < pages.length; i++) {
      const footer: PageFooter = { index: i + 1, total: pages.length };
      const pageDiv = buildSeatPageDiv(pages[i], footer);
      renderContainer.appendChild(pageDiv);

      const canvas = await html2canvas(pageDiv, {
        scale: 3, // A4 下约 288 DPI，打印级清晰度
        useCORS: true,
        backgroundColor: '#ffffff',
        width: pageDiv.offsetWidth,
        height: pageDiv.offsetHeight,
        logging: false,
      });

      if (i > 0) pdf.addPage();
      const { dataUrl, format } = encodeCanvas(canvas);
      // 页面恒为整张 A4（div 固定 210×297mm），满幅放置，无需缩放
      pdf.addImage(dataUrl, format, 0, 0, PAGE_W, PAGE_H);

      pageDiv.remove();
      if (i + 1 < pages.length) {
        hooks.onStatus(`正在生成PDF：第 ${i + 1}/${pages.length} 页...`, 'info');
        // 让出主线程，状态文案有机会绘制
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    pdf.save('考场座位表.pdf');
    hooks.onStatus(
      `PDF已生成并开始下载！共 ${pages.length} 页，288 DPI 高清版式` +
        '（人数较多的考场已自动分页）',
      'success',
    );
  } catch (err) {
    hooks.onStatus('生成PDF时出错: ' + (err as Error).message, 'error');
  } finally {
    renderContainer.remove();
  }
}

/**
 * 画布编码：无损 PNG 优先（黑字白底文本页体积小、无 JPEG 振铃），
 * PNG 超过阈值（约 1.1MB 二进制）时与 JPEG(0.95) 比较取更小者。
 */
function encodeCanvas(canvas: HTMLCanvasElement): { dataUrl: string; format: 'PNG' | 'JPEG' } {
  const png = canvas.toDataURL('image/png');
  if (png.length <= 1_500_000) return { dataUrl: png, format: 'PNG' };
  const jpg = canvas.toDataURL('image/jpeg', 0.95);
  return jpg.length < png.length
    ? { dataUrl: jpg, format: 'JPEG' }
    : { dataUrl: png, format: 'PNG' };
}

/** 跨平台中文黑体栈：Windows / macOS / Linux / Android 均有命中 */
const CJK_FONT_STACK =
  "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', " +
  "'Source Han Sans CN', 'WenQuanYi Micro Hei', 'SimHei', sans-serif";

/**
 * 表格列定义（VLM 两轮评审修正）：
 * 1) 删掉与座位号恒等的冗余"序号"列（轮询分配下行号 == 座位号）；
 * 2) 考号 9~14 位数字仅需 ~30mm，收窄至 22%；
 * 3) 姓名/班级是变宽中文字段，加宽至 33%/35%，长名与"高一(10)班"从容放下。
 */
const SEAT_COLS: { label: string; width: string }[] = [
  { label: '座位号', width: '10%' },
  { label: '考号', width: '22%' },
  { label: '姓名', width: '33%' },
  { label: '班级', width: '35%' },
];

// ── 拼版模型（96dpi 基准，用于行高自适应；推导见 MAX_ROWS_PER_PAGE） ──
/** 内容区高：297mm − 上边距 16 − 下边距 12 = 269mm */
const CONTENT_H = 1016;
/** 标题区模型高（标题 39 + 副行 15+22 + 单线 15+2 + 下距 27） */
const TITLE_H = 120;
/** 表头行模型高（padding 24 + 15px×1.2 行高） */
const HEADER_H = 42;
/** 签收栏模型高（7mm 上距 + 12.5px×1.5 一行） */
const SIGN_H = 46;
/** 字体度量漂移 + 长名字换行的安全余量 */
const SAFETY = 32;
/** 行高下限（标准紧凑行，约 8.2mm） */
const ROW_MIN = 31;
/** 行高上限（约 23.3mm，短页拉高行距填满页面，像表单而非稀疏表格） */
const ROW_MAX = 88;

/**
 * 行高自适应：短页把行距拉高到接近表单单元格的感觉，避免"数据几行、
 * 纸很大"的空洞（VLM 第 2 轮"严重"项）。行数多时回到紧凑 31px。
 * 结果恒满足：标题 + 表头 + 行数×行高 + [签收栏] ≤ 内容区 − SAFETY。
 */
function computeRowHeight(rowCount: number, hasSign: boolean): number {
  const avail = CONTENT_H - TITLE_H - HEADER_H - (hasSign ? SIGN_H : 0) - SAFETY;
  const ideal = Math.floor(avail / Math.max(rowCount, 1));
  return Math.max(ROW_MIN, Math.min(ROW_MAX, ideal));
}

/**
 * 构建一页的 DOM（安全：全部 textContent，无 innerHTML）。
 * 独立导出，便于在浏览器中单独预览/测试版式。
 */
export function buildSeatPageDiv(page: RoomPage, footer: PageFooter): HTMLElement {
  const pageDiv = document.createElement('div');
  pageDiv.className = 'pdf-page';
  pageDiv.style.cssText = `
    width: ${PAGE_W}mm;
    height: ${PAGE_H}mm;
    padding: 16mm 15mm 12mm;
    background: #ffffff;
    font-family: ${CJK_FONT_STACK};
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  `;

  // ── 标题区：大标题 + 人数副行 + 单线（VLM 评审：双线改单线更朴素，
  //    副行加重，避免“畏缩”） ──
  const header = document.createElement('div');
  header.style.cssText = 'text-align: center; margin-bottom: 7mm;';

  const title = document.createElement('div');
  title.style.cssText =
    'font-size: 28px; font-weight: 700; color: #000; letter-spacing: 3px; line-height: 1.4;';
  title.textContent = `第${page.roomNum}考场座位表${page.continued ? '（续）' : ''}`;

  const subline = document.createElement('div');
  subline.style.cssText =
    'font-size: 14.5px; line-height: 1.5; color: #222; margin-top: 4mm; letter-spacing: 2px;';
  subline.textContent = `本考场共 ${page.total} 人`;

  const rule = document.createElement('div');
  rule.style.cssText = 'margin-top: 4mm; border-top: 2px solid #000;';

  header.appendChild(title);
  header.appendChild(subline);
  header.appendChild(rule);
  pageDiv.appendChild(header);

  // ── 座位表 ────────────────────────────────────────────────────
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 3px solid #000;
    color: #000;
    font-family: ${CJK_FONT_STACK};
  `;

  // 表头行：3% 灰底强化层级（VLM 轻微项），下沿加重线，行高显式定死
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  SEAT_COLS.forEach((col) => {
    const th = document.createElement('th');
    th.style.cssText = `
      border: 1px solid #000;
      border-bottom: 3px solid #000;
      padding: 12px 6px;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 700;
      color: #000;
      background: #f2f2f2;
      width: ${col.width};
    `;
    th.textContent = col.label;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  // 数据行：行高自适应（短页拉高行距像表单；满页紧凑）。
  // 是否带签收栏须先算出——它参与行高预算。
  const isRoomLastPage = page.offset + page.rows.length >= page.total;
  const hasSign = isRoomLastPage && page.rows.length <= 20;
  const rowH = computeRowHeight(page.rows.length, hasSign);

  const tbody = document.createElement('tbody');
  page.rows.forEach((a) => {
    const tr = document.createElement('tr');
    const cells: string[] = [String(a.seat), a.examNumber, a.name, a.class];
    cells.forEach((text) => {
      const td = document.createElement('td');
      td.style.cssText = `
        border: 1px solid #000;
        height: ${rowH}px;
        padding: 0 6px;
        text-align: center;
        vertical-align: middle;
        font-size: 13.5px;
        line-height: 1.35;
        font-weight: 700;
        color: #000;
        overflow: hidden;
        word-break: break-all;
      `;
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  pageDiv.appendChild(table);

  // ── 签收栏：仅当本页是考场末页且行数较少时追加，行高预算已计入。
  //    弹性盒设计（flex:1 + max-height 70mm）：自动吃掉页面剩余空间，
  //    消除短页下半页空洞（VLM"严重"项）；满页时自动缩为单行，不溢出。
  if (hasSign) {
    const signBox = document.createElement('div');
    signBox.style.cssText = `
      margin-top: 7mm;
      flex: 1 1 auto;
      min-height: 46px;
      max-height: 264px;
      border: 1px solid #000;
      padding: 4mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 12.5px;
      line-height: 1.5;
      color: #222;
    `;
    const line1 = document.createElement('div');
    line1.style.cssText =
      'display: flex; justify-content: space-between; letter-spacing: 1px;';
    const l1a = document.createElement('span');
    l1a.textContent = '监考教师：________________';
    const l1b = document.createElement('span');
    l1b.textContent = '考试日期：________________';
    line1.appendChild(l1a);
    line1.appendChild(l1b);

    const line2 = document.createElement('div');
    line2.style.cssText = 'letter-spacing: 1px;';
    line2.textContent = '备注：________________________';

    signBox.appendChild(line1);
    signBox.appendChild(line2);
    pageDiv.appendChild(signBox);
  }

  // ── 页脚：居中页码 ────────────────────────────────────────────
  const footerDiv = document.createElement('div');
  footerDiv.style.cssText = `
    position: absolute;
    bottom: 7mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11.5px;
    color: #333;
    letter-spacing: 2px;
  `;
  footerDiv.textContent = `第 ${footer.index} 页 / 共 ${footer.total} 页`;
  pageDiv.appendChild(footerDiv);

  return pageDiv;
}
