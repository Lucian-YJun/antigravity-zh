# Release v1.4.4: 扩充 15 个原生模块替换规则，加固回环安全并补全界面文案

本版主要扩充原生模块汉化替换表（覆盖全部 27 个原生目标），加固 Sidecar 回环地址端口校验，
并补全浏览器设置、Project 4K 布局卡片及权限预设等界面遗留英文。
词典规模由 2043 条扩充至 2928 条，规则由 336 条扩充至 475 条。

## 1. 扩充：15 个原生模块替换规则（覆盖 27 个原生替换目标）

原生模块替换文件从 12 个大幅扩充至 27 个，实现对主进程与核心服务原生逻辑的深度覆盖：

- 新增原生替换目标：桌面配对（`desktopPairing`）、设备选择（`deviceChooser`）、
  远程连接断开通知（`remoteDisconnected`）、远程会话管理器（`remoteManager`）、
  登录回调处理（`signInCallback`）、页面截取（`capturePage`）、电脑控制悬浮层（`computerOverlay`）、
  弹窗安全策略（`webviewPopupSecurity`）。
- 补全 SSH 链路全流程提示：SSH 参数解析（`sshArgs`）、SSH 桥接（`sshBridge`）、
  SSH 配置文件主机解析（`sshConfigHosts`）、SSH 连接与重试（`sshConnection`）、
  SSH 目标选择（`sshDestination`）、SSH 报错文本（`sshErrorText`）、SSH 交互式认证提示（`sshPrompts`）。
- 替换语义严格对齐 Rust Aho-Corasick 引擎契约：单遍扫描、全量替换、字面量安全替换，
  杜绝多重扫描与替换副作用。

## 2. 安全修复：加固 Sidecar 回环地址校验，防止本地开发服务被误注入

此前逻辑在判定非 isolated WebContents 时，若 URL 为回环地址（`localhost` / `127.0.0.1`）
可能会将普通弹窗加载的本地应用误判为 Sidecar 视图，导致翻译脚本注入到用户的本地开发页面。

本版在 `src/zh-i18n.js` 中加固了回环端口校验逻辑：
- 回环地址恒定要求端口必须命中 `customScheme.extensionAuthorities` 中注册的已知 Sidecar 端口。
- 严密防范普通弹窗加载本地服务时的误判与误注入，确保只有合法的 Antigravity 侧边视图被汉化。

## 3. 补全：浏览器设置、Project 4K 布局卡片与权限文案

根据最新客户端界面反馈，集中补齐了此前遗漏的交互文案：

- **浏览器设置**：补齐设置副标题（`Configure built-in browser, link opening, and browser subagent preferences.`）、
  下载路径修改动作（`Change...` / `Change…`）、浏览历史清除说明（`Clear visited URLs and autocomplete suggestions from the built-in browser.`）、
  以及浏览器子智能体操控规则说明。
- **界面布局**：补齐 Project 4K 模式下的工作区卡片（`Knowledge Work` 知识工作 与 `Software Engineering` 软件工程 标题与描述）。
- **连接器与权限**：补齐服务连接器操作徽标（`Set up` 设置、`Log in` 登录）、权限预设文案（`Your This Computer setting` / `Your Remote setting`）。
- **语音设置**：补齐音量调节描述（`How loud Antigravity's voice is.`）与音色名称。

## 4. 规范与测试体系完善

- **遵循词典维护规范**：遵循 `AGENTS.md` 要求，移除了测试套件中对词典条目绝对数量的硬编码门禁，
  以「精确匹配 + 归一化去重」作为词典质量的严密验收标准，避免因正常文案迭代被迫调整测试阈值。
- **发布说明体积守卫**：新增 `tests/test-release-notes.js` 测试，全面拦截发布说明中写死包体积与字节数的写法，
  保证发布说明与生成的 Release 资产清单解耦，彻底避免校验互锁。

## 验证

- `npm test` 全绿：集成套件、页面翻译器、原生替换引擎、词典归一化、TreeWalker 对抗用例及 Rust workspace 单测与 clippy 全部门禁通过。
- `verify-release` 报告 **35/35 条目与当前源码逐字节一致**。
- 安装器 `--version` 输出 `antigravity-tool 1.4.4`。
- 发布包 `Antigravity-zh-patch-v1.4.4.zip`（内含安装器、三份 `.bat`、词典与 27 份 native 替换表；条目清单与体积以 Release 页面资产为准）。

## 升级方式

下载本版 zip 解压，先运行 `一键还原.bat`（清除旧版部署）再运行 `一键安装.bat`。
涉及原生替换与 asar 注入的代码需要重装并重启客户端生效；
日常词条更新可通过 `快速同步词典.bat` 热载。

## 已知边界

- 若本机 Antigravity 正在运行，安装器会拒绝执行并提示先退出（不强制关进程）。
- 词典热同步的「实时推送」需要客户端开着 DevTools 端口；不满足时只会更新文件，
  下次切换视图或重启生效。
- 原生替换规则与 asar 注入在安装阶段写入，需重装 + 重启客户端生效。
