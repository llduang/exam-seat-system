// 单元测试：座位分配算法 runAssignment（含座位超卖回归）
// 运行：node scripts/test-assign-logic.mjs（Node >= 22.18 内置 TS type stripping）
import {
  runAssignment,
  getUsedSeats,
  getSeatOptionsForRoom,
} from '../src/lib/exam-assign.ts';

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

const CFG = {
  components: [
    { type: 'prefix', enabled: true, value: '806', width: 2 },
    { type: 'class', enabled: true, value: '', width: 2 },
    { type: 'room', enabled: true, value: '', width: 2 },
    { type: 'seat', enabled: true, value: '', width: 2 },
  ],
  separator: '',
};

/** 造数据：{ '1班': ['a','b',...], ... } */
function makeClasses(spec) {
  const classData = {};
  Object.entries(spec).forEach(([cls, n]) => {
    classData[cls] = Array.from({ length: n }, (_, i) => `${cls}-${i + 1}`);
  });
  const classNames = Object.keys(classData);
  const classNameToNumber = {};
  classNames.forEach((c, i) => { classNameToNumber[c] = i + 1; });
  return { classData, classNames, classNameToNumber };
}

console.log('== 1. 座位超卖回归（学生数 > 总座位数） ==');
{
  // 16 班：15×30 + 1×5 = 455 人；10 考场 × 45 座 = 450 座
  const spec = {};
  for (let c = 1; c <= 15; c++) spec[`${c}班`] = 30;
  spec['16班'] = 5;
  const { classData, classNames, classNameToNumber } = makeClasses(spec);
  const out = runAssignment({
    classData, classNames, classNameToNumber,
    classroomCount: 10, seatCount: 45, examConfig: CFG,
  });
  assertTrue(out.assignments.length === 450, `分配数不超过总座位（450），实际 ${out.assignments.length}`);
  assertTrue(out.unassignedQueue.length === 5, `超出学生进入未分配队列（5），实际 ${out.unassignedQueue.length}`);
  assertTrue(out.assignments.every((a) => a.classroom <= 10), '考场号不超上限（无“幽灵考场”）');
  assertTrue(out.assignments.every((a) => a.seat <= 45), '座位号不超上限');
  const seen = new Set();
  let clash = false;
  out.assignments.forEach((a) => {
    const k = `${a.classroom}-${a.seat}`;
    if (seen.has(k)) clash = true;
    seen.add(k);
  });
  assertTrue(!clash, '同考场同座位不重复');
  const perRoom = {};
  out.assignments.forEach((a) => { perRoom[a.classroom] = (perRoom[a.classroom] || 0) + 1; });
  assertEq(perRoom, { 1: 45, 2: 45, 3: 45, 4: 45, 5: 45, 6: 45, 7: 45, 8: 45, 9: 45, 10: 45 }, '每个考场恰好坐满 45 人');
  // 轮询分配：16 班（5 人）在前 5 轮已分完；第一阶段 450 次循环中有 23 次
  // 空转，因此 1-2 班各分 29、3-15 班各分 28，第二阶段补到 450 后，
  // 剩余未分配 = 班 11-15 各 1 人（轮询后段的班级）
  const unassignedByClass = {};
  out.unassignedQueue.forEach((s) => { unassignedByClass[s.class] = (unassignedByClass[s.class] || 0) + 1; });
  assertEq(unassignedByClass, { '11班': 1, '12班': 1, '13班': 1, '14班': 1, '15班': 1 }, '未分配学生来自轮询后段班级（11-15 班各 1 人）');
}

console.log('== 2. 学生数恰好等于总座位数 ==');
{
  const { classData, classNames, classNameToNumber } = makeClasses({ '1班': 50, '2班': 50 });
  const out = runAssignment({
    classData, classNames, classNameToNumber,
    classroomCount: 4, seatCount: 25, examConfig: CFG,
  });
  assertEq(out.assignments.length, 100, '全部分配（100）');
  assertEq(out.unassignedQueue.length, 0, '未分配队列为空');
  const perRoom = {};
  out.assignments.forEach((a) => { perRoom[a.classroom] = (perRoom[a.classroom] || 0) + 1; });
  assertEq(perRoom, { 1: 25, 2: 25, 3: 25, 4: 25 }, '每个考场 25 人');
}

console.log('== 3. 同班学生打散（轮询） ==');
{
  const { classData, classNames, classNameToNumber } = makeClasses({ '1班': 10, '2班': 10 });
  const out = runAssignment({
    classData, classNames, classNameToNumber,
    classroomCount: 2, seatCount: 10, examConfig: CFG,
  });
  const room1 = out.assignments.filter((a) => a.classroom === 1);
  const r1c1 = room1.filter((a) => a.class === '1班').length;
  const r1c2 = room1.filter((a) => a.class === '2班').length;
  assertTrue(r1c1 === 5 && r1c2 === 5, `考场1 两班各 5 人（实际 ${r1c1}/${r1c2}）`);
}

console.log('== 4. 单班跨考场连续排座 ==');
{
  const { classData, classNames, classNameToNumber } = makeClasses({ '1班': 60 });
  const out = runAssignment({
    classData, classNames, classNameToNumber,
    classroomCount: 3, seatCount: 25, examConfig: CFG,
  });
  assertEq(out.assignments.length, 60, '60 人全部分配');
  const seats = out.assignments.filter((a) => a.classroom === 2).map((a) => a.seat);
  assertEq(seats, Array.from({ length: 25 }, (_, i) => i + 1), '考场2 座位号 1..25 连续');
}

console.log('== 5. 考号构成透传 ==');
{
  const { classData, classNames, classNameToNumber } = makeClasses({ '1班': 2 });
  const out = runAssignment({
    classData, classNames, classNameToNumber,
    classroomCount: 1, seatCount: 5, examConfig: CFG,
  });
  assertEq(out.assignments[0].examNumber, '806010101', '考号 = 前缀806+班级01+考场01+座位01');
  assertEq(out.assignments[1].examNumber, '806010102', '第二人座位 02');
}

console.log('== 6. getUsedSeats / getSeatOptionsForRoom ==');
{
  const used = getUsedSeats(
    [
      { name: 'a', classroom: 1, seat: 1, class: '1班', examNumber: 'x' },
      { name: 'b', classroom: 1, seat: 2, class: '1班', examNumber: 'x' },
    ],
    { 1: [26] },
  );
  assertEq(used[1], new Set([1, 2, 26]), '已用座位 = 自动分配 ∪ 手动额外座位');

  const opts = getSeatOptionsForRoom(1, 5, used);
  assertEq(opts.seats, [3, 4, 5], '可选座位排除已占用');
  assertEq(opts.extraFrom, null, '仍有空位时不提供额外座位');

  const full = getSeatOptionsForRoom(1, 5, { 1: new Set([1, 2, 3, 4, 5]) });
  assertEq(full.seats, [6, 7, 8, 9, 10], '考场满员时提供 5 个额外座位');
  assertEq(full.extraFrom, 6, '额外座位从 seatCount+1 开始');
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
