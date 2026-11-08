# Release v1.4.3: 右键菜单改走原生翻译，补齐 724 条词条

这一版修掉了「右键菜单怎么加词条都不生效」的真根因，并把上一轮 backlog 里可入库的文案
全部补齐。词典从 1320 条涨到 2043 条，规则 320 → 336 条。

## 1. 修复：右键菜单改走原生翻译（此前主进程完全没翻译）

用户连续几轮反馈右键菜单仍是英文，加词典条目怎么都不生效。用 CDP 实测定位到根因：
右键**不在 DOM 里产生菜单**，而是网页通过 IPC 把菜单项发给主进程，由主进程弹
**Electron 原生菜单**：

```js
// app/dist/ipcHandlers.js:294
ipcMain.handle('window:show-context-menu', async (_event, items) => {
  const template = buildContextMenuTemplate(items, ...);   // label 原样使用
  const menu = electron_1.Menu.buildFromTemplate(template); // ← 没有翻译
  menu.popup({ window: win, ... });
});
```

网页侧的词典翻译器**管不到原生菜单**（它不在 DOM 里），而 `MENU_LABELS` 只作用于
`main.js` 建的主菜单，也不覆盖这条 IPC 路径——这正是此前 5 轮反复修却一直没好的原因。

改动：

1. `src/zh-i18n.js` 新增 `translateMenuTemplate(template)`，处理 `Menu.buildFromTemplate`
   的**数组**形态（`translateMenu` 只接受 `{items: []}`）；抽出 `translateMenuLabel`
   共用查表逻辑，两份入口共享同一套 `MENU_LABELS` + 归一化索引，避免规则漂移。
2. `src/native/ipchandlers.replacements.json` 新增替换：
   `buildFromTemplate(template)` → `buildFromTemplate(require('../../zh-patch/zh-i18n').translateMenuTemplate(template))`。
3. `MENU_LABELS` 补 23 条右键菜单项（156 → 179 条）：`Rename` / `Mark Unread` / `Mark Read` /
   `Archive` / `Unpin` / `Pin` / `Share` / `Stop` / `View Debug` / `Restore` /
   `Delete Permanently` / `Telemetry` / `View archived in the sidebar` / `Fork` / `Split` /
   `Conversation ID` / `Conversation Title` / `Copy Conversation Markdown` /
   `Copy Conversation ID` / `Copy Trajectory ID` / `Copy Path` / `More Actions` / `Sign Out`。

> 需要重装 + 重启的只是 **asar 里的替换代码**（`ipchandlers.js` 的注入点）。
> 词典内容本身照样能热载：`npm run sync` 会同步 `resources/zh-patch/` 下的
> `cockpit-zh.json` 与 `zh-i18n.js`，而 `zh-patch/` 在 asar 之外。

## 2. 修复：原生菜单兜底到网页词典

`MENU_LABELS` 只覆盖 Electron 自带菜单和应用自建菜单，但网页右键菜单传下来的 label 有 60+ 条
只存在于 `cockpit-zh.json` 的 `dict` 里（`Conversation Name` / `Split Right` /
`Toggle Sidebar` …）。只查 `MENU_LABELS` 会整片漏译，症状是「同一个词在页面里是中文、
在右键菜单里还是英文」。

查表顺序改为：

```
MENU_LABELS（手写，优先）→ 菜单归一化 → dict 精确 → dict 归一化
```

只查 `dict` 的精确 + 归一化，**不套 `rules`**：规则是给整句兜底的，套到菜单 label 上容易误伤。

`refreshMenuDict()` 按 `cockpit-zh.json` 的 mtime 缓存索引。安装目录里的 `zh-patch/` 在 asar
之外，`npm run sync` 会同时推送该词典与 `zh-i18n.js`，所以**只加词条时可以热载**：下一个
弹出的菜单就是新词，不必重启客户端。索引在整棵菜单开始处刷新一次，不逐项 `statSync`
（一个菜单动辄上百项，逐项 stat 是白花的系统调用）。词典读坏时退回只用 `MENU_LABELS`，
不让菜单炸掉。

界线在这里，三者别混：

| 改什么 | 怎么生效 |
|---|---|
| `cockpit-zh.json` 的 `dict`（加词条） | `npm run sync` **热载**，下一个菜单就是新词 |
| `zh-i18n.js`（`MENU_LABELS`、兜底顺序、`translateMenuTemplate`） | `npm run sync` + **重启客户端** |
| asar 里的注入点（`ipchandlers.js` 的 `buildFromTemplate` 替换） | **重装**（重新注入）+ 重启 |

## 3. 修复：中文前缀 + 英文尾巴同处一个文本节点

用户反复反馈「本地权限 同时包含全局权限 when working in these conversations」一直没好。
排查后定位到根因在翻译引擎，不是词典缺词。

React 把中文标签和英文句子拼进了同一个 TextNode：

```html
<span>Also includes</span>
<span>Global Permissions</span>
" when working " + L + "."
```

「同时包含全局权限」是词典已有的译文，但它和后面的英文尾巴构成同一个节点：
`同时包含全局权限 when working in these conversations.`

而 `tr()` 的逻辑是「首字符是中文 → return null」，为的是性能（绝大多数节点已汉化，早退避免
查表）和正确性（中文里夹的 `Token` / `MCP` 不该被误译）。所以这半截英文永远不译。

改法：中文快路径保留，但先尝试切出「结尾的连续英文片段」；仅当尾巴**以字母开头且 ≥3 个单词**
时才翻译，避免把「使用 Boost 模式」「这是 Token 的数量」这类切坏；尾巴译不出则原样返回 `null`
（不删半截英文）；结果写进 `mixedCache`（上限 500）避免同一串反复扫描。

顺带修了 `setData` 热载只清 `normHit` / `missCurr` / `nodeMap` 却漏了 `mixedCache` 的问题——
`npm run sync` 后新增英文尾巴会继续返回旧结果，必须重启窗口才生效，与热更新契约不一致。

## 4. 补齐 724 条词条

词典 **1320 → 2043 条**（新增 724、删除 1），规则 **320 → 336 条**。按来源分：

| 类别 | 典型内容 |
|---|---|
| 语音与回溯 | 语音设置、回溯确认、外观分区的漏译 |
| 快捷键面板 | 63 条命令名、无障碍与宽度选项 |
| 企业网关 | 网关相关文案（上一轮整块未覆盖） |
| 扩展市场 | 分组 / 市场 / 插件相关文案 |
| 空状态 | 文件夹、资源、成果（Artifacts）的空状态 |
| 动态拼句 | `when working` / `in these conversations` / `N question(s)` / `Asked` / `Asking` / `Running` |
| 原生菜单 | `Unpin` / `Telemetry` / `Copy Conversation Markdown` 等 |
| 运行时计数 | `N browser steps` / `N models selected` / `N Files With Changes` / `N attachment(s)` / `N tasks running` 等 15 条规则 |

## 5. 术语统一

按用户定的口径统一，冻结基线里 26 条也跟着更新（已在 `tests/fixtures/dict-baseline-v1.2.1.json`
的 `note` 里注明变更范围和理由）：

| 原 | 现 |
|---|---|
| Artifact 制品 / 产物 | **成果** |
| Sandbox 沙箱 | **沙盒** |
| Subagent 子代理 | **子智能体** |
| Fork Conversation 复制对话 | **派生对话** |
| Marketplace 市场 | **扩展市场** |
| Sidecar 伴生进程 | **侧边视图** |
| Token | 保留英文 |

`rules` 数组里 4 条漏改的「子代理 / Agent」也一并修正（上一轮只改了词典，没改规则层）。

## 6. 新增：审计脚本 `scripts/audit-i18n.js`

`bundle.includes("Project deleted")` 返回 `false`，不等于界面不会出现这句——渲染层大量文案是
拼出来的。脚本对每条词条走**四条路**判定，任何一条命中就算存在：

1. 字面量子串出现
2. 大小写变体（引擎归一化会命中）
3. 可由 `${...}` 模板生成（变量取 `Project` / `Workspace` 等真实取值）
4. 可由 `+` 拼接生成

背景：此前只用第 1 条，把 `Project deleted` 判成死条目并准备删除（真实源码是
`` `${w.capitalized} deleted` ``），又按「看起来应该有」补了 4 条永远不可能命中的死条目。
**误杀真条目会让界面漏译，留着一条死条目只是无害冗余。**

脚本只读，绝不写 `src/cockpit-zh.json`。用法：

```bash
npm run audit:i18n                      # 全量报告（需要 bundle）
npm run audit:i18n -- --quality         # 只查词典自身（不需要 bundle）
npm run audit:i18n -- --bundle <dir>    # 指定渲染层 bundle 目录
npm run audit:i18n -- --out <file>      # 导出结构化 JSON
```

## 7. 修复：三个 `.bat` 启动器支持源码目录

此前只找根目录的 `Antigravity-zh.exe`（发布包里的名字），在源码目录双击必然报
「未找到 Antigravity-zh.exe」。现在按场景自动挑选：

- 发布包 → `Antigravity-zh.exe`
- 源码目录 → `dist\antigravity-tool.exe`

两者都找不到时给出分场景提示。顺带修正两处被既有测试拦下的问题：行尾全部转为 CRLF
（`.gitattributes` 要求 `*.bat` 是 `text eol=crlf`），`rem` 行改回纯 ASCII
（仓库历史上踩过「rem 行被当命令执行」）。

## 8. 清理

- 消除唯一一处写法冗余：`Build With Google Plugins` / `Build with Google Plugins`
  （改为词典删一条、由 `^build with google plugins$` 的 `i` 规则兜底）。这是本版相对
  v1.4.2 唯一净删除的条目。
- 纠正一条误判：`Project deleted` 曾被审计脚本判成死条目并准备删除，复核后确认是真条目
  （源码写作 `` `${w.capitalized} deleted` ``），已保留并补全同批模板拼接文案。

## 验证

- `npm test` 全绿：页面翻译器 372、混排串回归 19、词典压缩回归 166、词典热同步 38、
  安装流程集成 50、审计脚本回归 17、开发工具脚本副作用边界 14、TreeWalker 对抗 128、
  M2 边缘用例 66，其余套件 0 失败；cargo test + clippy 无告警。
- `verify-release` 报告 **20/20 条目与当前源码逐字节一致**。
- 安装器 `--version` 输出 `antigravity-tool 1.4.3`。
- 发布包 `Antigravity-zh-patch-v1.4.3.zip`（内含安装器、三份 `.bat`、词典与 native 替换表；
  条目清单与体积以 Release 页面资产为准。本文件本身就在 zip 内，写死字节数会随自身长度
  漂移，`tests/test-release-notes.js` 会拦下这类写法）。

## 升级方式

下载本版 zip 解压，先运行 `一键还原.bat`（清除旧版部署）再运行 `一键安装.bat`。
原生菜单的**注入代码**（asar 里的 `buildFromTemplate` 替换）需要重装并重启才生效；
菜单词条本身可以只靠 `快速同步词典.bat` 热载。

只想更新词典、不想动安装目录的，可以直接双击 `快速同步词典.bat`。

## 已知边界

- 若本机 Antigravity 正在运行，安装器会拒绝执行并提示先退出（不强制关进程）。
- 词典热同步的「实时推送」需要客户端开着 DevTools 端口；不满足时只会更新文件，
  下次切换视图或重启生效。
- 原生菜单的三档生效方式见第 2 节表格：改 `dict` 可热载；改 `zh-i18n.js`（含
  `MENU_LABELS`）需 sync + 重启；改 asar 里的注入点需重装 + 重启。最容易踩的坑是把
  这三档混成一档，然后误以为「加了词条却没反应」是词典没生效。
