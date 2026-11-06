// 单元测试：座位表 PDF 分页纯函数 splitSeatPages（v4 拆出，与上线代码同源）
// 运行：node scripts/test-seat-pages.mjs（Node >= 22.18 内置 TS type stripping）
import {
  splitSeatPages,
  MAX_ROWS_PER_PAGE,
  PAGE_W,
  PAGE_H,
} from '../src/lib/exam-pdf.ts';

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

/** 造指定考场的分配数据：人数 n，座位 1..n */
function makeRoom(room, n, className = '1班') {
  return Array.from({ length: n }, (_, i) => ({
    name: `学生${room}_${i + 1}`,
    classroom: room,
    seat: i + 1,
    class: className,
    examNumber: `8060${room}${String(i + 1).padStart(2, '0')}`,
  }));
}

console.log('== splitSeatPages：基础行为 ==');

// 1. 空数据
assertEq(splitSeatPages([], 10), [], '无分配数据 → 0 页');

// 2. 空考场跳过（只有第 2 考场有人）
{
  const pages = splitSeatPages(makeRoom(2, 5), 10);
  assertEq(pages.length, 1, '仅第2考场有人 → 1 页');
  assertEq(pages[0].roomNum, 2, '页归属考场 2');
  assertEq(pages[0].total, 5, '考场总人数 = 5');
  assertTrue(!pages[0].continued, '首页非续页');
}

// 3. 座位号升序
{
  const shuffled = [
    { name: '甲', classroom: 1, seat: 7, class: '1班', examNumber: '8060107' },
    { name: '乙', classroom: 1, seat: 2, class: '1班', examNumber: '8060102' },
    { name: '丙', classroom: 1, seat: 5, class: '1班', examNumber: '8060105' },
  ];
  const pages = splitSeatPages(shuffled, 1);
  assertEq(pages[0].rows.map((r) => r.seat), [2, 5, 7], '考场内按座位号升序');
}

console.log('== splitSeatPages：分页边界 ==');

// 4. 恰好一页容量
{
  const pages = splitSeatPages(makeRoom(1, MAX_ROWS_PER_PAGE), 1);
  assertEq(pages.length, 1, `${MAX_ROWS_PER_PAGE} 人恰好 1 页`);
}

// 5. 超一页 → **均衡分页**（26+3=29 → 15+14，而非 26+3），续页标记 + 偏移连续
{
  const n = MAX_ROWS_PER_PAGE + 3;
  const pages = splitSeatPages(makeRoom(1, n), 1);
  assertEq(pages.length, 2, `${n} 人 → 2 页`);
  assertEq(pages[0].rows.length, 15, '首页 15 行（均衡分布前半）');
  assertEq(pages[1].rows.length, 14, '次页 14 行（均衡分布后半）');
  assertTrue(pages[0].continued === false, '首页非续页');
  assertTrue(pages[1].continued === true, '次页为续页');
  assertEq(pages[1].offset, 15, '次页偏移 = 首页行数');
  assertEq(pages[1].rows[0].seat, 16, '次页首行座位号衔接（序号连续）');
  // 每页 total 都是考场总人数
  assertTrue(pages.every((p) => p.total === n), '每页 total = 考场总人数');
  // 任一页都不超过单页容量
  assertTrue(pages.every((p) => p.rows.length <= MAX_ROWS_PER_PAGE), '任一页 ≤ 单页容量');
}

// 5b. 均衡分页保证末页不空洞：大考场逐个检查
{
  for (const n of [27, 40, 52, 53, 78]) {
    const pages = splitSeatPages(makeRoom(1, n), 1);
    const last = pages[pages.length - 1];
    const first = pages[0];
    // 末页行数 ≥ 首页行数 − 1（均衡），且永远 ≥ 总人数/页数的下取整
    assertTrue(last.rows.length >= first.rows.length - 1, `${n} 人 ${pages.length} 页：末页不比首页少 1 行以上`);
    assertTrue(pages.every((p) => p.rows.length <= MAX_ROWS_PER_PAGE), `${n} 人：任一页 ≤ 容量`);
    const sum = pages.reduce((s, p) => s + p.rows.length, 0);
    assertEq(sum, n, `${n} 人分页后总数守恒`);
  }
}

// 6. 两个考场交错时互不干扰
{
  const data = [
    ...makeRoom(1, 10, '1班'),
    ...makeRoom(2, 8, '2班'),
  ];
  const shuffled = [data[9], ...data.slice(0, 9), ...data.slice(10)]; // 乱序输入
  const pages = splitSeatPages(shuffled, 2);
  assertEq(pages.length, 2, '两考场 → 2 页');
  assertEq(pages.map((p) => p.roomNum), [1, 2], '按考场号升序出页');
  assertEq(pages[0].rows.every((r) => r.classroom === 1), true, '页内不混考场');
}

console.log('== 常量完整性 ==');
assertEq(PAGE_W, 210, 'A4 宽 210mm');
assertEq(PAGE_H, 297, 'A4 高 297mm');
assertTrue(MAX_ROWS_PER_PAGE >= 24 && MAX_ROWS_PER_PAGE <= 28, '每页行数在 24–28 安全区间');

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
