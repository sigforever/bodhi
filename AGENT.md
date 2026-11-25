# AGENT.md · BODHI（菩提）项目开发与研习指南

> **不立文字，借指见月。**  
> 本文件为协助维护与扩充「BODHI · 菩提」禅宗与佛学交互阅读 APP 的 AI 代理提供架构红线、审美标准、数据契约与校验规范。

---

## 1. 项目定位与美学准则

- **目标**：一座用于个人长期研习禅宗与大乘佛法至高觉悟的 **Windows 桌面级交互阅读与观照空间**。
- **设计风格**：宋韵极简 × 瑞士网格 × 博物馆典籍级排版。
  - **字体灵魂**：以**思源宋体（Source Han Serif SC / Noto Serif SC）**为核心衬线体，讲求字距、行距、标点挤压与纸墨留白。
  - **三款低饱和主题**：`ink`（玄墨 · 暖炭黑）、`xuan`（宣纸 · 温润古纸白）、`celadon`（松烟青 · 汝窑青灰釉韵）。未手动切换前随系统浅/深色自动匹配（`prefers-color-scheme: light` 对应 `xuan`，其余为 `ink`），手动选择后持久化于 `bodhi-theme`。严禁高饱和霓虹配色或花哨玻璃特效。
  - **内容格调**：忠实于原始佛法、般若中观、瑜伽唯识、如来藏与东土禅宗原典，行文克制、精准、有哲学深度，**严禁流于浅薄心灵鸡汤**。

---

## 2. 目录结构与文件职责

```text
bodhi/
├── AGENT.md                # 本工程与审美规范
├── README.md               # 用户使用手册与 Windows 启动指南
├── index.html              # 主应用入口（7 大视图容器与浮层结构）
├── manifest.json           # PWA 应用清单（Edge 安装桌面应用支持）
├── skills-lock.json        # 项目级 Agent 前端设计技能锁文件（非运行时依赖）
├── .agents/                # 项目级 Agent 技能目录（gemini-frontend-design/SKILL.md，非运行时依赖）
├── 启动菩提.vbs            # Windows 静默独立窗口启动器（必须保持纯 ASCII）
├── 启动菩提.bat            # Windows 批处理启动器（支持 --server 启动本地服务）
├── assets/
│   └── icon.svg            # 宋韵微残圆相与朱砂印「菩提」矢量徽标
├── app/
│   ├── styles.css          # 完整视觉排版与三主题 CSS 系统（禁止 JS 注入覆盖）
│   ├── font-loader.js      # 思源宋体本地探测与国内/海外双源按需加载（暴露 window.BODHI_FONT）
│   ├── app.js              # 零依赖交互引擎、SVG 图谱、全文检索与本地持久化
│   └── data/
│       ├── library.js      # 核心典籍库（挂载 window.BODHI_LIBRARY）
│       └── atlas.js        # 图谱、转智、三段论、十牛图、五家法脉与公案库（挂载 window.BODHI_ATLAS）
├── docs/                   # 独立 Markdown 深度导读文库（00-map.md ~ 05-practice.md）
└── journal/
    └── TEMPLATE.md         # 线下参究手记 Markdown 模板
```

---

## 3. 架构红线与 Windows 约束（务必遵守）

1. **零依赖、无构建链**：
   - 项目位于用户 Dropbox 同步目录，**严禁引入 `npm`、`node_modules`、Webpack/Vite 打包工具或重型框架**。任何改动必须保证纯静态文件可直接运行。
2. **完全兼容 `file://` 协议（零 CORS 报错）**：
   - **严禁在前端使用 ES Module（`import` / `export`）**，也不要对本地 JSON/JS 数据使用 `fetch()`。
   - 所有数据文件必须为经典 `<script>`，在 `index.html` 中按 `library.js` → `atlas.js` → `font-loader.js` → `app.js` 顺序挂载到 `window`。
3. **Windows 启动器编码红线**：
   - `启动菩提.vbs` 必须保持 **100% 纯 ASCII 字节**（严禁写入任何中文字符或全角标点，包括注释），否则中文 Windows 下 `wscript.exe` 按 GBK 解码会直接报错。
   - `启动菩提.bat` 需在首行保留 `@echo off` 与 `chcp 65001 >nul`。
4. **思源宋体加载策略**：
   - `app/styles.css` 中 `--font-serif` 保持本地 `"Source Han Serif SC"`, `"Source Han Serif CN"`, `"思源宋体"` 置顶。
   - 在线回退由 `app/font-loader.js` 负责（优先国内镜像 `fonts.loli.net`，超时回退 `fonts.googleapis.com`），不要在 `index.html` 硬编码阻塞渲染的外部字体 `<link>`。
5. **样式唯一真源**：
   - 所有 UI 样式统一维护在 `app/styles.css`，**严禁在 `app/app.js` 中动态创建 `<style>` 标签注入全局样式覆盖**。
   - 保持 `.reader-toolbar` 位于 `.reader-canvas` 外部上方，否则开启传统竖排书卷模式（`.reader-canvas.is-vertical`）时工具栏会随 `writing-mode: vertical-rl` 旋转错位。

---

## 4. 数据与状态契约

### 4.1 `window.BODHI_LIBRARY`（`app/data/library.js`）
数组，每部典籍包含：
- `id`: 唯一英文标识（如 `"heart"`, `"xinxinming"`, `"cantongqi"`, `"diamond"`, `"platform"`, `"zhengdaoge"`, `"shurangama"`, `"vimalakirti"`）
- `title`, `fullTitle`, `author`, `category`, `completeness`（`"全文精读"` | `"核心精编"`）, `supportsVertical`（`boolean`，韵文/短经为 `true`，长散文经为 `false`）, `summary`, `keyQuote`
- `sections`: 数组，每节含 `{ id, heading, original, translation, commentary, delusion, awakened, contemplation }`

### 4.2 `window.BODHI_ATLAS`（`app/data/atlas.js`）
对象，包含：
- `epigraphs`: `[{ quote, source }]`
- `mapNodes` / `mapEdges`: 五重转进全景星图（节点坐标适配 `viewBox="0 0 730 390"`）
- `eightConsciousnesses`: 唯识八识转四智 4 组转化数据
- `diamondTriads`: 《金刚经》「A，即非A，是名A」三段论拆解
- `oxStages`: 廓庵十牛图完整 10 阶
- `lineageNodes`: 11 节点传灯与一花五叶法脉（坐标适配 `viewBox="0 0 820 370"`）
- `koans`: 经典公案数组（含 `doubt` 疑情与 `insight` 透脱眼）
- `huatou`: 参禅话头字符串数组
- **跨库引用完整性**：凡包含 `relatedBookId` 的条目，其值必须严格存在于 `window.BODHI_LIBRARY` 的 `id` 列表中。

### 4.3 DOM 状态与本地存储键
- **主题属性**：`<html data-theme="ink | xuan | celadon">`
- **排版 CSS 变量**：`--reader-size`、`--reader-leading`、`--reader-measure`
- **关键状态类**：`.is-active`、`.is-collapsed`、`.is-pure`、`.is-vertical`、`.is-selected`、`.is-noted`、`.is-open`、`body.is-zen-fullscreen`、`.is-visible`、`html.is-theme-switching`、`html.is-theme-fallback`、`html.is-zen-transitioning`、`aside.sidebar.is-leaving`、`.is-armed`
- **`localStorage` 键名**（扩充功能时请勿破坏既有用户数据格式）：
  - `bodhi-journal-v1`（统一存放手记 `entries` 与收藏 `bookmarks`）
  - `bodhi-theme`
  - `bodhi-last-reading`
  - `bodhi-sit-count`
  - `bodhi-reader-size` / `bodhi-reader-leading` / `bodhi-reader-measure`
  - `bodhi-book-positions` / `bodhi-reader-mode` / `bodhi-last-view` / `bodhi-sidebar-collapsed` / `bodhi-sit-prefs` / `bodhi-ui-state`
- **手记持久化与导出契约**：写入 `bodhi-journal-v1` 统一经由事务性的 `commitJournal()`（存储写入失败时不得修改内存状态或清除 `dirty` 标记）；Markdown 导出/导入采用无损 `<!-- bodhi:entry:v2 ... -->` 与 `<!-- bodhi:field:*:start/end -->` 标记（转义正文中的字面量标记），同时保留围栏代码块感知的旧版 Markdown 导入兼容。

---

## 5. 原典校对与扩充规范

- 新增或修改原典全文（尤其是经偈、祖师铭文）时，**必须逐字核对权威传世定本，不得臆造、漏字或擅自改写原典字句**。
- 扩充新经典时，若正文为整齐偈颂或短经可设 `supportsVertical: true`；若为长段散文对话体应设 `supportsVertical: false`，并确保 `app/app.js` 无需修改即可通过契约自动渲染。
- 修改交互逻辑时，需保持快捷键（`Ctrl+K` 全局检索、`Ctrl+S` 立即本地保存、`1–7` 视图切换、藏经精读 `↑/↓` 与 `j/k`、十牛图/公案 `←/→`、观息静室 `Space` 起止、`Esc` 关闭浮层/抽屉或退出全屏）与无障碍契约（IME `isComposing` 守卫、检索弹窗开启时背景 `.app-shell` 设 `inert`、各 `radiogroup`/`tablist` 的 roving `tabindex` 与方向键/`Home`/`End` 导航、视图 `<h1 class="section-title" tabindex="-1">` 焦点迁移、`aria-pressed`、`aria-current`）完整可用。

---

## 6. 提交前必跑核验命令

任何代码或数据修改完成后，请在项目根目录执行以下核验：

```bash
# 1. JS 语法检查
node --check app/data/library.js && node --check app/data/atlas.js && node --check app/font-loader.js && node --check app/app.js

# 2. 验证 VBS 纯 ASCII、JSON 合法性与跨库 ID 对齐
node -e '
const fs = require("fs"), vm = require("vm");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync("app/data/library.js", "utf8"), ctx);
vm.runInNewContext(fs.readFileSync("app/data/atlas.js", "utf8"), ctx);
const bookIds = new Set(ctx.window.BODHI_LIBRARY.map(b => b.id));
for (const k of ["mapNodes", "oxStages", "lineageNodes", "koans"]) {
  for (const x of ctx.window.BODHI_ATLAS[k]) {
    if (x.relatedBookId && !bookIds.has(x.relatedBookId)) throw new Error("Bad relatedBookId: " + x.relatedBookId);
  }
}
const html = fs.readFileSync("index.html", "utf8");
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const app = fs.readFileSync("app/app.js", "utf8");
for (const m of app.matchAll(/\$\(["'\'']#([a-zA-Z0-9_-]+)["'\'']\)/g)) {
  if (!ids.has(m[1])) throw new Error("Missing HTML ID: " + m[1]);
}
for (const b of fs.readFileSync("启动菩提.vbs")) {
  if (b > 127) throw new Error("Non-ASCII byte in 启动菩提.vbs");
}
JSON.parse(fs.readFileSync("manifest.json", "utf8"));
console.log("OK");
'
```
