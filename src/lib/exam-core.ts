/**
 * 考场座位分配系统 —— 班级识别与考号构成核心逻辑（纯函数）
 *
 * 移植自单文件版 index.html 的 [EXAM-CORE-START]/[EXAM-CORE-END] 区块，
 * 逻辑与原版逐行等价，供单元测试对照（scripts/test-core-logic.mjs）。
 */

/** 考号构成项类型 */
export type ExamComponentType = 'prefix' | 'class' | 'room' | 'seat';

/** 考号构成项 */
export interface ExamComponent {
  type: ExamComponentType;
  /** 是否启用 */
  enabled: boolean;
  /** 前缀内容（type === 'prefix' 时使用） */
  value: string;
  /** 编号位数（class/room/seat 时使用） */
  width: number;
}

/** 考号构成配置 */
export interface ExamNumberConfig {
  components: ExamComponent[];
  /** 分隔符，空串表示直接相连 */
  separator: string;
}

/** 单个班级名的解析结果 */
export interface ClassToken {
  raw: string;
  /** 班级号（名称中最后一组数字），无数字时为 null */
  num: number | null;
  /** 去掉班级号后的文字标签 */
  label: string;
  /** 班级号原始位数 */
  digitLen: number;
}

/**
 * 解析单个班级名称：提取班级号（取最后一组数字）与文字标签
 * "1"→(num=1,label='') "02"→(2,'') "1班"→(1,'班') "高一(3)班"→(3,'高一班') "甲班"→(null,'甲班')
 */
export function examParseClassToken(raw: string | number | null | undefined): ClassToken | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const groups = s.match(/\d+/g);
  let digitLen = 0;
  let num: number | null = null;
  let label = s;
  if (groups && groups.length > 0) {
    const digitStr = groups[groups.length - 1];
    digitLen = digitStr.length;
    num = parseInt(digitStr, 10);
    const idx = s.lastIndexOf(digitStr);
    label = s.slice(0, idx) + s.slice(idx + digitStr.length);
  }
  label = label.replace(/[（(]\s*[）)]/g, '');
  label = label.replace(/\s+/g, '');
  return { raw: s, num: num, label: label, digitLen: digitLen };
}

/** 归一化后的班级组 */
export interface ClassGroup {
  /** 显示名（统一写法） */
  display: string;
  /** 班级号（用于考号） */
  classNumber: number;
  /** 补零后的班级号 */
  paddedNumber: string;
  /** 该班级出现过的所有原始写法 */
  rawForms: string[];
}

/** 班级归一化结果 */
export interface ClassNormalization {
  groups: ClassGroup[];
  /** 班级号统一补零位数（至少 2） */
  width: number;
  /** 被合并的不同写法 */
  merges: { display: string; forms: string[] }[];
  /** 自动编号等提示 */
  notes: string[];
  /** 原始写法 → 显示名 */
  rawToDisplay: Record<string, string>;
}

/**
 * 班级名称归一化：
 * 1. "1"与"01"、"02"与"2"这类同一班级的不同写法自动合并
 * 2. 按文字标签+班级号排序（"10"排在"2"之后，而不是字符串序）
 * 3. 班级号优先取名称中的真实数字；无数字或编号冲突时自动顺延
 */
export function examNormalizeClassGroups(
  rawNames: (string | number)[] | null | undefined,
): ClassNormalization {
  const groupsMap: Record<string, {
    label: string; num: number | null; forms: Record<string, number>;
    maxDigitLen: number; firstRaw: string;
  }> = {};
  const orderKeys: string[] = [];
  (rawNames || []).forEach(function (name) {
    const token = examParseClassToken(name);
    if (!token) return;
    const key = token.num === null ? '~' + token.raw : token.label + '#' + token.num;
    if (!groupsMap[key]) {
      groupsMap[key] = {
        label: token.label, num: token.num, forms: {},
        maxDigitLen: 0, firstRaw: token.raw,
      };
      orderKeys.push(key);
    }
    const g = groupsMap[key];
    g.forms[token.raw] = (g.forms[token.raw] || 0) + 1;
    if (token.digitLen > g.maxDigitLen) g.maxDigitLen = token.digitLen;
  });

  const groupList = orderKeys.map(function (k) { return groupsMap[k]; });

  // 统一补零位数：至少2位
  let width = 2;
  groupList.forEach(function (g) {
    if (g.num !== null && g.maxDigitLen > width) width = g.maxDigitLen;
  });

  // 排序：先按文字标签，再按数字大小；无数字的排最后
  groupList.sort(function (a, b) {
    const aHasNum = a.num !== null;
    const bHasNum = b.num !== null;
    if (aHasNum && bHasNum) {
      if (a.label !== b.label) return a.label.localeCompare(b.label, 'zh');
      return (a.num as number) - (b.num as number);
    }
    if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
    return a.firstRaw.localeCompare(b.firstRaw, 'zh');
  });

  let maxNum = 0;
  groupList.forEach(function (g) {
    if (g.num !== null && (g.num as number) > maxNum) maxNum = g.num as number;
  });

  const usedNumbers: Record<number, boolean> = {};
  const numberOwner: Record<number, string> = {};
  const merges: { display: string; forms: string[] }[] = [];
  const notes: string[] = [];
  const groups = groupList.map(function (g) {
    const formKeys = Object.keys(g.forms);
    // 显示名：纯数字班级显示补零后的编号；带文字的班级保留原始写法（多种写法时取出现最多、位数最长的）
    let display: string;
    if (g.num === null) {
      display = formKeys[0];
    } else if (g.label === '') {
      display = String(g.num).padStart(width, '0');
    } else {
      display = formKeys.slice().sort(function (x, y) {
        const diff = (g.forms[y] || 0) - (g.forms[x] || 0);
        if (diff !== 0) return diff;
        return (examParseClassToken(y) as ClassToken).digitLen - (examParseClassToken(x) as ClassToken).digitLen;
      })[0];
    }
    // 班级号
    let classNumber: number;
    if (g.num !== null && !usedNumbers[g.num as number]) {
      classNumber = g.num as number;
    } else {
      if (g.num !== null) {
        notes.push('“' + display + '”与“' + numberOwner[g.num as number] + '”的班级号相同（' + g.num + '），已自动改为 ' + (maxNum + 1));
      } else {
        notes.push('“' + display + '”名称中不含数字，已自动编号为 ' + (maxNum + 1));
      }
      maxNum += 1;
      classNumber = maxNum;
    }
    usedNumbers[classNumber] = true;
    numberOwner[classNumber] = display;
    if (formKeys.length > 1) {
      merges.push({ display: display, forms: formKeys });
    }
    return {
      display: display,
      classNumber: classNumber,
      paddedNumber: String(classNumber).padStart(width, '0'),
      rawForms: formKeys,
    };
  });

  const rawToDisplay: Record<string, string> = {};
  groups.forEach(function (g) {
    g.rawForms.forEach(function (r) { rawToDisplay[r] = g.display; });
  });
  return { groups: groups, width: width, merges: merges, notes: notes, rawToDisplay: rawToDisplay };
}

/** 按构成项拼接考号各部分 */
export function examComposeParts(
  components: ExamComponent[] | null | undefined,
  classNumber: number,
  room: number,
  seat: number,
): string[] {
  const parts: string[] = [];
  (components || []).forEach(function (comp) {
    if (!comp || !comp.enabled) return;
    if (comp.type === 'prefix') {
      if (comp.value) parts.push(comp.value);
    } else if (comp.type === 'class') {
      parts.push(String(classNumber).padStart(comp.width, '0'));
    } else if (comp.type === 'room') {
      parts.push(String(room).padStart(comp.width, '0'));
    } else if (comp.type === 'seat') {
      parts.push(String(seat).padStart(comp.width, '0'));
    }
  });
  return parts;
}

/** 生成考号 */
export function examComposeNumber(
  components: ExamComponent[] | null | undefined,
  separator: string | null | undefined,
  classNumber: number,
  room: number,
  seat: number,
): string {
  return examComposeParts(components, classNumber, room, seat).join(separator || '');
}

/** 考号示例预览信息 */
export interface ExamPreviewInfo {
  /** 预览文本 */
  text: string;
  /** 位数预警列表 */
  warnings: string[];
}

/**
 * 计算考号示例与位数预警（原 updateExamNumberPreview 的纯函数化）。
 * classNameToNumber 为空时跳过班级号预警（与原版一致：仅在已识别/已生成班级后预警）。
 */
export function examPreviewInfo(
  config: ExamNumberConfig,
  classroomCount: number,
  seatCount: number,
  classNameToNumber: Record<string, number>,
): ExamPreviewInfo {
  const parts = examComposeParts(config.components, 1, 1, 1);
  let text: string;
  if (parts.length === 0) {
    text = '（未选择任何构成项）';
  } else {
    const visual = parts.join(config.separator || ' ');
    const final = parts.join(config.separator);
    text = visual + '  →  ' + final;
  }

  const warnings: string[] = [];
  const findComp = function (type: ExamComponentType) {
    return (config.components || []).find(function (c) { return c.type === type && c.enabled; });
  };
  const roomComp = findComp('room');
  if (roomComp) {
    const roomMax = Math.pow(10, roomComp.width) - 1;
    if (classroomCount > roomMax) {
      warnings.push('考场数 ' + classroomCount + ' 已超过 ' + roomComp.width + ' 位数，考号中考场编号将以 ' + String(classroomCount).length + ' 位显示');
    }
  }
  const seatComp = findComp('seat');
  if (seatComp) {
    const seatMax = Math.pow(10, seatComp.width) - 1;
    if (seatCount > seatMax) {
      warnings.push('座位数 ' + seatCount + ' 已超过 ' + seatComp.width + ' 位数，考号中座位编号将以 ' + String(seatCount).length + ' 位显示');
    }
  }
  const classComp = findComp('class');
  if (classComp && Object.keys(classNameToNumber).length > 0) {
    const numbers = Object.values(classNameToNumber);
    const maxClassNumber = Math.max.apply(null, numbers);
    const classMax = Math.pow(10, classComp.width) - 1;
    if (maxClassNumber > classMax) {
      warnings.push('最大班级号 ' + maxClassNumber + ' 已超过 ' + classComp.width + ' 位数，考号中班级编号将以 ' + String(maxClassNumber).length + ' 位显示');
    }
  }
  return { text: text, warnings: warnings };
}

/**
 * 推荐每个考场座位数：总人数 ÷ 考场数，向下取整（92.1、92.8 均推荐 92）。
 * 商不足 1 时按 1 计（每个考场至少 1 个座位，否则无法安排任何学生）；
 * 总人数或考场数无效（≤ 0 / 非有限数）时返回 0，表示暂无推荐值。
 */
export function examRecommendSeatsPerRoom(totalStudents: number, roomCount: number): number {
  if (!Number.isFinite(totalStudents) || !Number.isFinite(roomCount)) return 0;
  if (totalStudents <= 0 || roomCount <= 0) return 0;
  return Math.max(1, Math.floor(totalStudents / roomCount));
}
