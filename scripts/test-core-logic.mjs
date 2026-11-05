// 单元测试：班级识别与考号构成核心逻辑（纯函数）
// 直接 import src/lib/exam-core.ts —— 与上线的代码完全同源，无需从 HTML 提取。
// 运行：node scripts/test-core-logic.mjs（Node >= 22.18 内置 TS type stripping）
import {
  examParseClassToken,
  examNormalizeClassGroups,
  examComposeNumber,
} from '../src/lib/exam-core.ts';

let passed = 0, failed = 0;
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label + '\n      期望: ' + e + '\n      实际: ' + a); }
}
function assertTrue(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label); }
}

console.log('== 1. 班级名解析 examParseClassToken ==');
let t = examParseClassToken('1');
assertEq({ num: t.num, label: t.label }, { num: 1, label: '' }, '"1" → num=1, label=""');
t = examParseClassToken('02');
assertEq({ num: t.num, label: t.label }, { num: 2, label: '' }, '"02" → num=2, label=""');
t = examParseClassToken('1班');
assertEq({ num: t.num, label: t.label }, { num: 1, label: '班' }, '"1班" → num=1, label="班"');
t = examParseClassToken('高一(3)班');
assertEq({ num: t.num, label: t.label }, { num: 3, label: '高一班' }, '"高一(3)班" → num=3, label="高一班"');
t = examParseClassToken('高一（3）班');
assertEq({ num: t.num, label: t.label }, { num: 3, label: '高一班' }, '"高一（3）班" 全角括号 → num=3, label="高一班"');
t = examParseClassToken('2025级1班');
assertEq({ num: t.num, label: t.label }, { num: 1, label: '2025级班' }, '"2025级1班" 取最后一组数字 → num=1');
t = examParseClassToken('甲班');
assertEq({ num: t.num, label: t.label }, { num: null, label: '甲班' }, '"甲班" 无数字 → num=null');
t = examParseClassToken(1);
assertEq({ num: t.num, label: t.label }, { num: 1, label: '' }, '数字 1（Excel数字单元格） → num=1');
t = examParseClassToken('  02  ');
assertEq({ num: t.num, label: t.label }, { num: 2, label: '' }, '"  02  " 带空格 → trim后 num=2');
assertTrue(examParseClassToken('') === null, '空字符串 → null');
assertTrue(examParseClassToken(null) === null, 'null → null');
t = examParseClassToken('10');
assertEq(t.digitLen, 2, '"10" digitLen=2');
t = examParseClassToken('007');
assertEq({ num: t.num, digitLen: t.digitLen }, { num: 7, digitLen: 3 }, '"007" → num=7, digitLen=3');

console.log('== 2. 班级归一化 examNormalizeClassGroups ==');

// 场景A：用户描述的核心场景 —— 班级列写法不一致（"1" / "02" 混用补零）
let n = examNormalizeClassGroups(['1', '02', '2', '03', '10']);
assertEq(n.groups.map(g => g.display), ['01', '02', '03', '10'], 'A: 合并后班级 01,02,03,10（"2"与"02"合并）');
assertEq(n.groups.map(g => g.classNumber), [1, 2, 3, 10], 'A: 班级号 1,2,3,10');
assertEq(n.merges.map(m => m.forms.slice().sort()), [['02', '2']], 'A: 记录合并 "02"/"2"');
assertEq(n.width, 2, 'A: 补零宽度2位');

// 场景B：字符串排序问题 —— "10" 应排在 "2" 之后
n = examNormalizeClassGroups(['10班', '2班', '1班']);
assertEq(n.groups.map(g => g.display), ['1班', '2班', '10班'], 'B: 数字序 1班,2班,10班（非字符串序）');
assertEq(n.groups.map(g => g.classNumber), [1, 2, 10], 'B: 班级号 1,2,10');

// 场景C：多文件名（01.xlsx / 2.xlsx / 高一(3)班.xlsx）
n = examNormalizeClassGroups(['01', '2', '高一(3)班']);
assertEq(n.groups.map(g => g.display), ['01', '02', '高一(3)班'], 'C: 班级 01,02,高一(3)班');
assertEq(n.groups.map(g => g.classNumber), [1, 2, 3], 'C: 班级号 1,2,3');

// 场景D：无数字班级自动编号
n = examNormalizeClassGroups(['甲班', '乙班']);
assertEq(n.groups.map(g => g.classNumber), [1, 2], 'D: 无数字班级自动编号 1,2');
assertEq(n.groups.map(g => g.paddedNumber), ['01', '02'], 'D: paddedNumber 01,02');

// 场景E：混合 —— 有数字 + 无数字
n = examNormalizeClassGroups(['1', '2', '甲班']);
assertEq(n.groups.map(g => g.classNumber), [1, 2, 3], 'E: 数字班级用真实号，甲班顺延为3');
assertTrue(n.notes.length === 1 && n.notes[0].indexOf('甲班') !== -1, 'E: 提示甲班自动编号');

// 场景F：不同标签同编号（高一1班 vs 高二1班）冲突处理
n = examNormalizeClassGroups(['高一1班', '高二1班']);
assertEq(n.groups.map(g => g.classNumber), [1, 2], 'F: 班级号冲突时顺延 1,2');
assertTrue(n.notes.length === 1 && n.notes[0].indexOf('相同') !== -1, 'F: 提示编号冲突');

// 场景G：三种写法的同一班级
n = examNormalizeClassGroups(['1', '01', '001']);
assertEq(n.groups.length, 1, 'G: "1"/"01"/"001" 合并为一个班级');
assertEq(n.groups[0].classNumber, 1, 'G: 班级号1');
assertEq(n.groups[0].display, '001', 'G: 显示名取位数最长的写法 "001"');
assertEq(n.width, 3, 'G: 补零宽度跟随最大位数3');

// 场景H：完整高中场景（18个班，写法混杂）
n = examNormalizeClassGroups(['1', '02', '03', '4', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18']);
assertEq(n.groups.length, 18, 'H: 18个班');
assertEq(n.groups.map(g => g.display).slice(0, 5), ['01', '02', '03', '04', '05'], 'H: 前5个显示 01-05');
assertEq(n.groups[9].display, '10', 'H: 第10个班显示10');
assertEq(n.merges.length, 0, 'H: 各班级号互不相同，无需合并');

// 场景I：rawToDisplay 映射
n = examNormalizeClassGroups(['1', '02', '2']);
assertEq(n.rawToDisplay, { '1': '01', '02': '02', '2': '02' }, 'I: 原始名→显示名映射');

console.log('== 3. 考号组成 examComposeNumber ==');
// 默认顺序：前缀+班级+考场+座位（与旧版一致）
const defaultComps = [
  { type: 'prefix', enabled: true, value: '806', width: 2 },
  { type: 'class', enabled: true, value: '', width: 2 },
  { type: 'room', enabled: true, value: '', width: 2 },
  { type: 'seat', enabled: true, value: '', width: 2 }
];
assertEq(examComposeNumber(defaultComps, '', 1, 1, 1), '806010101', '默认构成：806010101（与旧版格式一致）');
assertEq(examComposeNumber(defaultComps, '', 12, 18, 25), '806121825', '默认构成：12班18考场25座 → 806121825');

// 调整顺序：班级在前，前缀在后
const reorderedComps = [
  { type: 'class', enabled: true, value: '', width: 2 },
  { type: 'room', enabled: true, value: '', width: 2 },
  { type: 'seat', enabled: true, value: '', width: 2 },
  { type: 'prefix', enabled: true, value: '806', width: 2 }
];
assertEq(examComposeNumber(reorderedComps, '', 3, 2, 15), '030215806', '顺序调整：班级+考场+座位+前缀');

// 去掉某些构成项
const noPrefixComps = defaultComps.map(c => c.type === 'prefix' ? { ...c, enabled: false } : c);
assertEq(examComposeNumber(noPrefixComps, '', 1, 1, 1), '010101', '去掉前缀：010101');

const onlyPrefixSeat = [
  { type: 'prefix', enabled: true, value: '2025', width: 2 },
  { type: 'seat', enabled: true, value: '', width: 3 }
];
assertEq(examComposeNumber(onlyPrefixSeat, '', 5, 2, 7), '2025007', '仅前缀+座位号(3位)：2025007');

// 分隔符
assertEq(examComposeNumber(defaultComps, '-', 1, 1, 1), '806-01-01-01', '分隔符 -：806-01-01-01');

// 位数不足自动补零 / 超位数自然扩展
const width1Comps = [
  { type: 'class', enabled: true, value: '', width: 1 },
  { type: 'room', enabled: true, value: '', width: 1 },
  { type: 'seat', enabled: true, value: '', width: 1 }
];
assertEq(examComposeNumber(width1Comps, '', 1, 2, 3), '123', '1位构成：123');
assertEq(examComposeNumber(width1Comps, '', 12, 3, 4), '1234', '超位数时自然扩展（班级12→"12"）');

// 前缀为空但勾选
const emptyPrefix = [{ type: 'prefix', enabled: true, value: '', width: 2 }, { type: 'class', enabled: true, value: '', width: 2 }];
assertEq(examComposeNumber(emptyPrefix, '', 1, 1, 1), '01', '空前缀跳过：仅班级01');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
