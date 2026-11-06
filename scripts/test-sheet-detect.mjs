// 单元测试：工作表表头自动检测 detectSheetColumns / autoMatchColumns
// 运行：node scripts/test-sheet-detect.mjs（Node >= 22.18 内置 TS type stripping）
import {
  detectSheetColumns,
  autoMatchColumns,
  computeRecognition,
  loadXLSX,
} from '../src/lib/exam-data.ts';

let passed = 0, failed = 0;
function assertTrue(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label); }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label + '\n      期望: ' + e + '\n      实际: ' + a); }
}

console.log('== 1. 常规表头：序号/姓名/班级（姓名不在第一列） ==');
{
  const rows = [
    ['序号', '姓名', '性别', '班级'],
    ['1', '张三', '男', '3班'],
    ['2', '李四', '女', '3班'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.headerRowIndex, 0, '表头行 = 第 0 行');
  assertEq(d.nameIndex, 1, '姓名列 = 第 1 列（不是第一列）');
  assertEq(d.classIndex, 3, '班级列 = 第 3 列');
  assertEq(d.nameHeader, '姓名', '姓名表头原文');
}

console.log('== 2. 班级列在前、姓名列在后 ==');
{
  const rows = [
    ['班级', '姓名'],
    ['1班', '张三'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.nameIndex, 1, '姓名列 = 第 1 列');
  assertEq(d.classIndex, 0, '班级列 = 第 0 列');
}

console.log('== 3. 标题占行：表头不在第一行 ==');
{
  const rows = [
    ['XX中学2025年期末考试名单'],
    [],
    ['序号', '考生姓名', '班级名称'],
    ['1', '张三', '3班'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.headerRowIndex, 2, '跳过标题行，表头 = 第 2 行');
  assertEq(d.nameIndex, 1, '“考生姓名”含“姓名” → 姓名列 1');
  assertEq(d.classIndex, 2, '“班级名称”含“班级” → 班级列 2');
}

console.log('== 4. 无班级列（仅有姓名列） ==');
{
  const rows = [
    ['学号', '学生姓名', '性别'],
    ['1', '张三', '男'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.headerRowIndex, 0, '识别到表头行');
  assertEq(d.nameIndex, 1, '姓名列 = 1');
  assertEq(d.classIndex, -1, '无班级列 → -1（回退工作表名/文件名分班）');
}

console.log('== 5. 未检测到表头 → 回退旧行为 ==');
{
  const rows = [
    ['张三', '李四', '王五'],
    ['赵六', '孙七'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.headerRowIndex, null, 'headerRowIndex = null');
  assertEq(d.nameIndex, -1, 'nameIndex = -1');
  assertEq(d.classIndex, -1, 'classIndex = -1');
}

console.log('== 6. 英文表头 ==');
{
  const rows = [
    ['No', 'Name', 'Class'],
    ['1', 'Tom', 'G1'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.nameIndex, 1, '“Name” → 姓名列 1');
  assertEq(d.classIndex, 2, '“Class” → 班级列 2');
}

console.log('== 7. “年级”不误判为班级列（静默检测严格模式） ==');
{
  const rows = [
    ['年级', '姓名', '分数'],
    ['高一', '张三', '95'],
  ];
  const d = detectSheetColumns(rows);
  assertEq(d.classIndex, -1, '静默检测不把“年级”当班级列');
}

console.log('== 8. autoMatchColumns（单表格式预选，宽松模式） ==');
{
  assertEq(
    autoMatchColumns(['序号', '姓名', '性别', '班级']),
    { nameIndex: 1, classIndex: 3 },
    '常规：姓名 1、班级 3',
  );
  assertEq(
    autoMatchColumns(['姓名', '名字']),
    { nameIndex: 0, classIndex: -1 },
    '姓名优先匹配第一处',
  );
  // 宽松模式：含“级”字可匹配（如“年级”），供人工确认
  assertEq(
    autoMatchColumns(['姓名', '年级']),
    { nameIndex: 0, classIndex: 1 },
    '宽松模式：单表预选允许“年级”',
  );
  // 同列冲突保护：“班级”既含“级”也含“班”，但不含“姓名”类词 → 只作班级列
  assertEq(
    autoMatchColumns(['姓名', '班级', '学号']),
    { nameIndex: 0, classIndex: 1 },
    '姓名列与班级列各自独立匹配',
  );
  assertEq(
    autoMatchColumns(['学号', '性别']),
    { nameIndex: -1, classIndex: -1 },
    '无匹配 → 均为 -1',
  );
}

console.log('== 9. computeRecognition：学生总人数与各班人数（多工作表） ==');
{
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  // 工作表 1：有“班级”列 → 班级以列内容为准（1班 2 人、2班 1 人）
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['姓名', '班级'],
    ['张三', '1班'],
    ['李四', '1班'],
    ['王五', '2班'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, '名单');
  // 工作表 2：无班级列 → 班级回退工作表名“5班”（2 人）
  const ws2 = XLSX.utils.aoa_to_sheet([['姓名'], ['赵六'], ['孙七']]);
  XLSX.utils.book_append_sheet(wb, ws2, '5班');
  const r = await computeRecognition(
    [{ fileName: '名单.xlsx', workbook: wb }],
    'multi-sheet',
    { nameColumn: null, classColumn: null },
  );
  assertTrue(r !== null, '返回非 null');
  assertTrue(r.mode === 'ok', '识别成功（mode=ok）');
  if (r.mode === 'ok') {
    assertEq(r.totalStudents, 5, '学生总人数 = 5（3+2）');
    assertEq(r.classSizes, { '1班': 2, '2班': 1, '5班': 2 }, '各班人数：1班 2 人、2班 1 人、5班 2 人');
    assertTrue(r.title.includes('3 个班级'), '标题含“3 个班级”');
    assertTrue(r.title.includes('共 5 名学生'), '标题含“共 5 名学生”');
    assertTrue(r.tags.includes('1班（2人）'), '标签含“1班（2人）”');
    assertTrue(r.tags.includes('2班（1人）'), '标签含“2班（1人）”');
    assertTrue(r.tags.includes('5班（2人）'), '标签含“5班（2人）”');
  }
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
