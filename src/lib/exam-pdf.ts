/**
 * 考场座位分配系统 —— 考场座位表 PDF 生成
 *
 * 移植自单文件版 generatePDF（每页一个考场，适合打印），
 * 使用 html2canvas 逐页渲染 + jsPDF 拼页，逻辑逐行等价。
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

/** 生成考场座位表 PDF（每页一个考场） */
export async function generateSeatPdf(ctx: PdfContext, hooks: PdfHooks): Promise<void> {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;

  const { assignments, classroomCount } = ctx;

  // 收集有效考场
  const validRooms: { roomNum: number; assignments: Assignment[] }[] = [];
  for (let i = 1; i <= classroomCount; i++) {
    const roomAssignments = assignments.filter((a) => a.classroom === i);
    if (roomAssignments.length > 0) {
      validRooms.push({ roomNum: i, assignments: roomAssignments });
    }
  }

  if (validRooms.length === 0) {
    hooks.onStatus('没有可用的考场数据来生成PDF', 'error');
    return;
  }

  // 创建隐藏的渲染容器
  const renderContainer = document.createElement('div');
  renderContainer.id = 'pdf-render-container';
  renderContainer.style.cssText = 'position:fixed; left:-9999px; top:0; z-index:-1;';
  document.body.appendChild(renderContainer);

  // 为每个考场创建HTML内容
  validRooms.forEach((room) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.style.cssText = `
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 12mm;
      background: white;
      font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
      position: relative;
      box-sizing: border-box;
      page-break-after: always;
    `;

    // 考场标题（简洁版）
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = `
      text-align: center;
      margin-bottom: 6mm;
      padding-bottom: 4mm;
      border-bottom: 2px solid #000;
    `;
    titleDiv.innerHTML = `
      <div style="font-size: 22px; font-weight: bold; color: #000;">第${room.roomNum}考场</div>
    `;
    pageDiv.appendChild(titleDiv);

    // 表格
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      color: #000;
    `;

    // 表头
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="border: 2px solid #000; padding: 8px 6px; color: #000; font-size: 13px; width: 40px; font-weight: bold;">序号</th>
        <th style="border: 2px solid #000; padding: 8px 6px; color: #000; font-size: 13px; width: 50px; font-weight: bold;">座位号</th>
        <th style="border: 2px solid #000; padding: 8px 6px; color: #000; font-size: 13px; font-weight: bold;">考号</th>
        <th style="border: 2px solid #000; padding: 8px 6px; color: #000; font-size: 13px; width: 70px; font-weight: bold;">姓名</th>
        <th style="border: 2px solid #000; padding: 8px 6px; color: #000; font-size: 13px; font-weight: bold;">班级</th>
      </tr>
    `;
    table.appendChild(thead);

    // 表体
    const tbody = document.createElement('tbody');
    room.assignments.forEach((a, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">${a.seat}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-family: 'Courier New', monospace; letter-spacing: 1px; font-weight: bold;">${a.examNumber}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">${a.name}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">${a.class}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    pageDiv.appendChild(table);

    renderContainer.appendChild(pageDiv);
  });

  // 显示加载提示
  hooks.onStatus('正在生成PDF，请稍候...', 'info');

  // 使用html2canvas逐页渲染并生成PDF
  const pages = renderContainer.querySelectorAll('.pdf-page');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = 210;
  const pdfHeight = 297;

  let currentPage = 0;

  const renderNextPage = (): void => {
    if (currentPage >= pages.length) {
      // 完成：保存PDF并清理
      pdf.save('考场座位分配表.pdf');
      renderContainer.remove();
      hooks.onStatus('PDF文件已生成并开始下载！每页包含一个考场的座位分配信息', 'success');
      return;
    }

    const page = pages[currentPage] as HTMLElement;

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

        // 计算图片在PDF中的尺寸（保持宽高比）
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // 如果内容超过一页，需要缩放
        if (imgHeight > pdfHeight) {
          const scale = pdfHeight / imgHeight;
          const scaledWidth = imgWidth * scale;
          const xOffset = (pdfWidth - scaledWidth) / 2;
          pdf.addImage(imgData, 'JPEG', xOffset, 0, scaledWidth, pdfHeight);
        } else {
          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        }

        currentPage++;
        renderNextPage();
      })
      .catch((err: unknown) => {
        renderContainer.remove();
        hooks.onStatus('生成PDF时出错: ' + (err as Error).message, 'error');
      });
  };

  renderNextPage();
}
