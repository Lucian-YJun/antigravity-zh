# Project: Antigravity-zh Localization Completion

## Architecture
- **双层架构**（指运行时补丁的两个层次）:
  1. **主进程原生补丁层**: 安装器将 `resources/app.asar` 解包到 `resources/app/`，对 `dist/` 下的目标文件应用 `src/native/*.replacements.json` 规则进行静态代码替换，并把原包改名为 `app.asar.orig` 备份（Electron 优先加载 `app.asar`，所以必须让它不在原位，`app/` 才会生效）。`src/zh-i18n.js` 与 `src/cockpit-zh.json` 部署到 `resources/zh-patch/`。
  2. **渲染进程同帧拦截层**: 网页加载完成后动态注入 `src/zh-i18n.js`，基于 `MutationObserver` 与 `TreeWalker` 进行微任务同帧 DOM 文本节点替换，结合 `src/cockpit-zh.json` 的静态字典与正则规则，同时具备 Monaco/Terminal 整树剪枝与 IME 输入法防抖保护。
- **双实现轨道**（指安装器有两套实现，产物一致）:
  - `rust/`（四个 crate）是**当前出货**的安装器：产出 `antigravity-tool.exe`，发布名 `Antigravity-zh.exe`（进入发布 zip，用户无需 Node）。上面第 1 层的安装动作由它执行。
  - `scripts/` + `src/`（Node）为源码检出/开发回退（无 exe 时走 `node scripts/patch.js`），负责完成同一套安装动作；`pkg` 版 `Antigravity-zh-patch.exe` 已不进发布包。
  - **替换语义以 Rust 为准**（单遍、全量、字面量、最左优先）；详见 AGENTS.md 的同名章节。
- **质量门禁体系**:
  - `npm test`: 门禁含集成套件、模块单测、`cargo test`/`clippy`、对抗套件；具体组成以 `package.json` 的 `test` 脚本为准。
  - `patch.js --dry-run`: 预览各 scope 的规则命中/跳过情况。**个别规则未匹配属正常版本差异**
    （一次历史实测：当前客户端 7 个目标文件、30 条规则中，29 条恰好命中一次、1 条为 0 次、0 条多命中；数值随官方版本变化）。
  - `tests/fixtures/dict-baseline-v1.2.1.json`: 1607 条冻结基线，由 `test-dict-normalize.js` 驱动**真实的** `tr()` 逐条比对，防止既有译文被意外改动。

---

## Feature Inventory

> 以下为 M1–M3 阶段的历史记录，保留用于追溯当时补了什么；门禁项数以
> `package.json` 的 `test` 脚本为准，不要按这里的描述核对。

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 权限预设系统汉化 | 汉化 Turbo、Auto (Preview)、Default、Request Review 及说明文案 | M1 | Survey Explorer 2 |
| 2 | Subagent 控制与状态词条 | 汉化 Stop execution、Stop subagent、Subagents、Started、1 subagent running 等 | M1 | Survey Explorer 2 |
| 3 | 对话轮次与交互状态 | 汉化 Conversation Log、No more older messages、Conversation turns、Turn X of Y、Scroll to Bottom 等 | M1 | Survey Explorer 2 |
| 4 | 内置浏览器 Webview 汉化 | 汉化 Embedded web preview、Enter a URL...、Connection is secure、View site information 等 | M1 | Survey Explorer 2 |
| 5 | 高级配置与实验性设置项 | 汉化 Project 4K、Terminal Sandbox、Sounds / Notifications、CDP Port、Chrome Binary 等 | M1 | Survey Explorer 2 |
| 6 | 动态文本正则规则扩充 | 添加子代理运行状态、轮次导航、消息来源、历史消息计数、打开子代理按钮、权限预设选择器等正则 | M1 | Survey Explorer 2 |
| 7 | 主菜单注入锚点修复 | 修复 `src/native/menu.replacements.json` 中因 2.28.1 模块重构导致的规则失效缺陷 | M2 | Survey Explorer 3 |
| 8 | WSL 新特性菜单与托盘汉化 | 在主菜单、系统托盘及 `MENU_LABELS` 中补齐 Connect to WSL、Reopen Locally 等词条 | M2 | Survey Explorer 3 |
| 9 | 原生系统对话框与 Splash | 补全 WSL 发行版丢失、跨系统路径警告、更新检查 detail 等原生弹窗提示 | M2 | Survey Explorer 3 |
| 10 | 斜杠命令与工具交互提示 | 汉化 `/plan`、`/boost`、`/automation`、`/plugin`、`/review` 及 Always allow/Deny 等 | M1 | Survey Explorer 3 |
| 11 | 全量测试回归与语法合规 | 执行 `npm test` 全链路门禁（含词典、主程序、页面翻译、安装流程） | M3 | Survey Explorer 1 |
| 12 | 补丁干运行与规则命中校验 | 执行 `node scripts/patch.js --dry-run` 预览规则命中/跳过情况 | M3 | Survey Explorer 3 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 界面词典与动态规则扩充 | `src/cockpit-zh.json`（静态字典 `dict` + 动态匹配 `rules`） | none | DONE |
| M2 | 原生主进程替换修复与菜单补全 | `src/native/*.replacements.json` 与 `src/zh-i18n.js` | none | DONE |
| M3 | 全量测试验证与补丁干运行校验 | `npm test` 全套测试与 `node scripts/patch.js --dry-run` | M1, M2 | DONE |

---

## Interface Contracts

### 词典数据契约 (`src/cockpit-zh.json`)
- **Key-Value 规范**:
  - 禁止包含重复 Key。
  - 必须完全执行 `trim()`，首尾禁止出现空格或换行。
  - 禁止出现空 Key 或空 Value。
- **Rules 规范**:
  - Pattern 必须是合法正则表达式。
  - Replacement 中的引用（如 `$1`, `$2`）编号必须严格 `<=` Pattern 中的捕获组数量。

### 原生替换规则契约 (`src/native/*.replacements.json`)
- 必须是二维数组 `[[targetString, replacementString], ...]`；Rust 侧额外接受
  `{"search": ..., "replace": ...}` 结构体形态，Node 侧已同步支持。
- 同一文件内 `targetString` 不得重复。
- `targetString` 必须在解包后的 `dist/` 对应 JS 文件中严格存在且唯一匹配；
  命中多于一次时会打印 `multiMatch` 警告（仍按全量替换处理）。
- `replacementString` 是**字面量**：其中的 `$&` / `$$` / `` $` `` / `$'` 不具有
  任何特殊含义。Node 侧必须用 `String.replace(old, () => new)` 的函数形式保证这一点。

---

## Code Layout
> 目录职责一览。文件数量与测试套件组成会随官方版本、迭代变化，
> 一律以各目录实际内容和 `package.json` 的脚本为准，不在此写死计数。

- `src/cockpit-zh.json`: 前端 DOM 翻译核心字典（`dict`）与动态正则规则（`rules`，形如 `[正则, 替换, flags?]` 的数组）
- `src/zh-i18n.js`: 核心注入器、菜单翻译字典 (`MENU_LABELS`) 与同帧拦截器
- `src/native/`: 各原生进程替换表 JSON（数量随官方新增目标文件增减，以目录实际内容为准）
- `scripts/patch.js`: Node 回退实现的安装与还原入口（`--dry-run` / `--revert` / `--close` / `--relaunch`）
- `scripts/lib/`: 模块化实现（env / process-manager / backup-manager / replacement-engine / deployer / cdp-client / dict-manager / zip）
- `scripts/sync-dict.js`: 词典热同步（复制到 `zh-patch/` 后经 CDP 推送到活动窗口）
- `scripts/add-terms.js` / `scripts/clean-dict-variants.js`: 词典维护工具（后者默认 dry-run，需 `--write`）
- `scripts/scan-ui.js` / `scripts/auto-review.js`: 界面漏译扫描与三态自动预筛
- `scripts/package-release.js` / `scripts/publish-release.js`: 发布打包与 GitHub Release
- `tests/`: 自动化测试、对抗套件、性能基准 + `fixtures/dict-baseline-v1.2.1.json` 冻结基线（套件组成以 `package.json` 为准）
- `rust/`: 四个 crate 的原生实现（asar / replacer / installer / cli），为当前出货安装器
- `docs/`: 维护文档（`i18n-backlog.*` 漏译基准、`pr-assets/` 截图、`archive/` 历史留存）
- `docs/archive/patches/`: 历史留存的独立补丁，已合入主线，勿再 `git apply`
- `README.md` / `RELEASE_NOTES.md`: 随发布 zip 交付的说明文档（被发布脚本按文件名硬编码，勿移出根目录）
- `AGENTS.md`: 词典维护规范，并约定「AI 不得自行合并 PR」（工具约定在根目录）
