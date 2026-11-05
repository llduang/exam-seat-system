# exam-seat-system

考场座位分配系统（纯前端静态应用，数据不出浏览器）。

基于 **Next.js 16 静态导出**（`output: "export"`）+ Tailwind CSS 4，部署在 Cloudflare Pages。
按 free-deploy-webapp skill 的场景 A（纯前端工具）架构组织：
无后端 Functions、无数据库、无鉴权，全部计算在浏览器完成。

## 功能

- 上传学生名单，自动轮流分配考场与座位（同班学生尽量打散到不同考场）
- 三种名单格式：
  - **多工作表格式**：每个班级一个工作表，第一列为学生姓名（支持同时上传多个文件，工作表自动合并）
  - **单工作表格式**：一个工作表包含所有学生，选择“姓名”和“班级”列（上传后自动匹配列）
  - **多文件格式**：每个班级一个 Excel 文件，班级名从文件名识别（如 `02.xlsx` 即 02 班）
- 班级写法自动识别与归一化：`1` / `01` / `02` / `2` 等同一班级的不同写法自动合并；按班级号数字排序（`10` 排在 `2` 之后）；考号中的班级编号取班级名中的真实数字；无数字或编号冲突的班级自动顺延编号
- 考号构成可配置：前缀、班级、考场、座位号四项可任意调整顺序、单独启用/停用、设置编号位数，支持可选分隔符，并实时预览考号示例与位数预警
- 座位不足时逐个手动处理未分配学生（含“额外座位”，或跳过）
- 下载：总表、各班级分配表、各考场分配表、座位表打印、完整分配表（包含所有工作表）、考场座位表 PDF（每页一个考场）
- 班级人数统计与图表（Chart.js 堆叠柱状图 + 分配率提示）

## 项目结构

```
├── src/
│   ├── app/                  # Next.js App Router（layout / page / globals.css）
│   ├── components/           # UI 组件（上传、识别、设置、考号配置、结果、模态框、图表）
│   ├── hooks/
│   │   └── use-exam-system.ts  # 全局状态与动作（单一状态源）
│   └── lib/                  # 纯逻辑层（可独立测试）
│       ├── exam-core.ts      #   班级识别 / 考号构成（纯函数，45 个单元测试）
│       ├── exam-data.ts      #   Excel 读取与班级/学生提取
│       ├── exam-assign.ts    #   两阶段轮询分配算法（20 个单元测试，含座位超卖回归）
│       ├── exam-export.ts    #   Excel 导出（xlsx-js-style）
│       ├── exam-pdf.ts       #   PDF 导出（html2canvas + jsPDF，分页 + 垂直居中版式）
│       └── xlsx-print.ts     #   xlsx 打印设置注入（fflate，横向/居中/按宽缩放）
├── scripts/
│   ├── test-core-logic.mjs   # 核心逻辑单元测试（node scripts/test-core-logic.mjs）
│   └── test-assign-logic.mjs # 分配算法单元测试（node scripts/test-assign-logic.mjs）
├── next.config.ts            # output: "export" 等静态导出配置
└── package.json
```

依赖库均通过 npm 引入（构建时打包，运行时不再依赖 CDN）：
`xlsx-js-style`、`jspdf`、`html2canvas`、`chart.js`、`fflate`（用于向导出的 xlsx 注入打印设置）。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 产物输出到 out/（静态导出）
node scripts/test-core-logic.mjs    # 核心逻辑单元测试（45 项）
node scripts/test-assign-logic.mjs  # 分配算法单元测试（20 项）
```

## 部署（Cloudflare Pages）

GitHub 仓库连接到 Cloudflare Pages，**推送到 main 自动重新部署**。

构建设置（Settings → Build & deployments）：

| 配置项 | 值 |
|--------|-----|
| Framework preset | Next.js (Static HTML Export) |
| Build command | `npx next build` |
| Build output directory | `out` |
| 环境变量 `NODE_VERSION` | `22` |

## 已知边界

- 座位号展示色块最多渲染 300 个（输入过大座位数时显示总数提示），不影响分配逻辑。
- 预览表最多渲染 500 行（提示下载总表查看完整名单），不影响分配与导出。

## 打印说明

- **座位表打印.xlsx**：已内置打印设置（A4 横向、水平居中、按宽度缩放到一页宽）。
  xlsx-js-style 本身不写出 `!pageSetup`/`!printOptions`（Pro 功能），因此导出后由
  `src/lib/xlsx-print.ts` 用 fflate 解包重写工作表 XML 注入上述节点，Excel/WPS
  打开即可直接打印，无需手动调整方向。
- **考场座位表 PDF**：每页一个考场（A4 竖向，内容垂直居中）；人数超过单页容量
  （约 26 人）的考场自动分页，续页重复表头，序号在考场内连续。
