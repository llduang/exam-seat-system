// 生成浏览器端到端测试用学生名单 xlsx（默认 92 人：1班 46 + 2班 46）
// 单工作表 + “姓名/班级”两列，含表头行，配合“多工作表格式”（班级以列内容为准）。
// 运行：node scripts/gen-e2e-roster.mjs [总人数=92] [输出路径=/tmp/exam-test/roster.xlsx]
import { loadXLSX } from '../src/lib/exam-data.ts';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const total = Number(process.argv[2] || 92);
const out = process.argv[3] || '/tmp/exam-test/roster.xlsx';
const half = Math.ceil(total / 2);
const rows = [['姓名', '班级']];
for (let i = 1; i <= total; i++) {
  rows.push(['学生' + String(i).padStart(3, '0'), i <= half ? '1班' : '2班']);
}
const XLSX = await loadXLSX();
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '名单');
mkdirSync(dirname(out), { recursive: true });
XLSX.writeFile(wb, out);
console.log('已生成 ' + out + '：共 ' + total + ' 人（1班 ' + half + ' 人 + 2班 ' + (total - half) + ' 人）');
