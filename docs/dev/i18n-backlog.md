# i18n 渐进补录清单（自动预筛）

> 由 `node scripts/auto-review.js --write-docs` 生成；`--out <path>` 可导出任意结构化 JSON，同源数据见 `docs/dev/i18n-backlog.json`。
> 数据源：`frontend-bundle.json` 的 `uncovered[]` 减去活体 L 集合（`crosscheck-sets.json` 的 `exact.F_minus_L`）。
> 生成时间：2026-11-08T08:06:14.199Z；共 651 条，分 16 类。

## 三态含义 / 怎么勾

| 状态 | 含义 | 人工动作 |
|---|---|---|
| `ACCEPT` | 自动判定为确定 UI 固定文案（强 UI 键名 / 活体 L / 与 dict 同形） | **也要人工过一眼**：确认 `suggest` 译文贴切、品牌词原样保留；把 `checked` 改为 `true` |
| `REJECT` | 自动判定为噪声（品牌名、URL、文件路径、CSS、技术标识符、示例数据、含中文等） | 原则上跳过；若确属误判，改 `state` 为 `REVIEW` 并在 `reasons` 里写明 |
| `REVIEW` | 灰区：缺少键名、长句、含品牌词、疑似片段/动态文案 | **重点看这里**：逐条裁决 `ACCEPT` / `REJECT`，改完把 `checked` 改为 `true` |

每条的 `checked` 初始均为 `false`，并保留源数据的 `src` / `suggest` / `category` / `file` / `loc` / `keys` / `menuOnly` / `inDistPool` / `note` 全部字段。`evidence` 记录判定依据（键名、文件位置、L 集合、同形前缀等），`reasons[]` 是可解释理由，裁决时可直接改 `state` / `suggest` / `reasons`。

## 统计与工作量

| 指标 | 数量 |
|---|---:|
| 总条数（旧流程需逐条人工判断） | 651 |
| `ACCEPT`（自动放行，人工过一眼） | 647 |
| `REJECT`（自动排除） | 1 |
| `REVIEW`（需人工裁决，重点） | 3 |
| 自动消化量 | 648 |

> 人工**深度裁决**从 651 条降到 3 条；`ACCEPT` 不是零成本，仍需抽检译文，但不再需要判断「该不该翻」。

## 勾完怎么走 add-terms

1. 只把 `state` 为 `ACCEPT`（含从 `REVIEW` 改过来的）且 `checked: true` 的条目整理成 `draft.txt`，一行一条 `英文原文 = 译文`。
2. `npm run add-terms draft.txt -- --dry-run` 预览；确认没有 redundant / skipped 异常后 `npm run add-terms draft.txt` 正式写入。
3. `npm test`（以 `package.json` 的 `test` 脚本为准）→ `npm run sync` 推送到已安装客户端，1~2 秒热载生效。
4. 回写本清单：把已入库条目的 `checked` 保持 `true`，在 `reasons` 末尾追加「已入库 vX.Y」；下一轮重跑 `auto-review.js` 时以新 findings 为基准重建。

**硬边界**：`auto-review.js` 绝不自动写 `src/cockpit-zh.json`；哪些该翻最终由人决定，脚本只减少逐条判断量。

## 分类明细

### 其它 UI 文案（107 条：ACCEPT 106 / REJECT 1 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Changes | 更改 | key:title · norm-covered · main.js:1436952 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reject Step | 拒绝此步骤 | key:label · norm-covered · main.js:1861257 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Start Voice Recording | 开始录音 | key:label · norm-covered · main.js:1861507 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stop Voice Recording | 停止录音 | key:label · norm-covered · main.js:1861593 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mute Voice Mic | 静音麦克风 | key:label · norm-covered · main.js:1861768 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mute Voice Speaker | 静音扬声器 | key:label · norm-covered · main.js:1861855 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restart Main Language Server | 重启主语言服务器 | key:label · norm-covered · main.js:1867213 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Zoom | 缩放 | key:label · weak:zoom · norm-covered · menuOnly · main.js:2983065 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Zoom in (+) | 放大 (+) | key:label · norm-covered · main.js:2983840 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REJECT` | Sample GDoc | 示例 Google 文档 | main.js:3406956 | 示例数据（国家名 / 模型名 / 示例仓库名），不是固定 UI 文案 |
|   | `ACCEPT` | Taking longer than usual to load | 加载时间比平常长 | norm-covered · main.js:3409763 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cut | 剪切 | key:label · norm-covered · menuOnly · main.js:3480841 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Paste | 粘贴 | key:label · norm-covered · menuOnly · main.js:3481185 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Valid until | 有效期至 | norm-covered · main.js:4328671 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reload | 重新加载 | key:title · norm-covered · menuOnly · main.js:4344160 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose Region | 选择区域 | norm-covered · main.js:4428083 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Device Name | 设备名称 | key:label · norm-covered · main.js:4543329 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Validate | 验证 | norm-covered · main.js:4591491 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Setup script ran successfully. | 初始化脚本运行成功。 | norm-covered · main.js:4592149 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Screen Reader Mode | 屏幕阅读器模式 | key:label · norm-covered · main.js:4611127 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Console Telemetry | 控制台遥测 | norm-covered · main.js:4623972 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Print telemetry to the console | 将遥测输出到控制台 | key:label · norm-covered · main.js:4624043 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | When enabled, the values below replace the auto-detected OS, host, and user type used for feature gating. | 启用后，下面的值将替代用于功能开关的自动检测操作系统、主机和用户类型。 | key:description · norm-covered · main.js:4631312 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Operating System | 操作系统 | key:label · norm-covered · main.js:4631528 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Host Environment | 主机环境 | key:label · norm-covered · main.js:4631808 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | User Type | 用户类型 | key:label · norm-covered · main.js:4632163 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What is missing in your workflow | 你的工作流中缺少什么 | norm-covered · main.js:4663587 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | How this feature would help you and other users | 此功能会如何帮助你和其他用户 | norm-covered · main.js:4663742 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Whether it never connects or is intermittent/flaky | 是始终无法连接，还是时好时坏 | norm-covered · main.js:4664743 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Did restarting the desktop app help? | 重启桌面应用是否有帮助？ | norm-covered · main.js:4664823 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Ask questions, report issues, and discuss features | 提问、反馈问题、讨论功能 | norm-covered · main.js:4667908 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Input device for voice mode and dictation. | 语音模式和听写所用的输入设备。 | key:description · norm-covered · main.js:4778989 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Only stored on your machine. | 仅保存在你的设备上。 | key:description · norm-covered · main.js:4779786 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | All tools (*) | 所有工具 (*) | key:label · norm-covered · main.js:4881653 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Hook will trigger if any tool is executed. | 执行任意工具时都会触发此 Hook。 | key:description · norm-covered · main.js:4881681 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Paste code | 粘贴代码 | key:placeholder · norm-covered · main.js:4933826 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stored and mounted in your cloud environment | 存储并挂载在你的云环境中 | key:title · norm-covered · main.js:4987526 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Amend succeeded | 修订提交成功 | key:title · norm-covered · main.js:5539666 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Inline Widget | 内联微件 | key:title · norm-covered · main.js:6333985 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Create | 创建 | norm-covered · main.js:6387838 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Undo to Here | 撤销到此处 | key:label · norm-covered · main.js:6426410 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Capture Console Logs | 捕获控制台日志 | key:title · norm-covered · main.js:6441076 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Daily environment time used | 今日环境使用时长已用尽 | key:title · norm-covered · main.js:6558691 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Click to learn more about sources | 点击了解有关来源的更多信息 | key:content · norm-covered · main.js:6625893 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show more | 显示更多 | norm-covered · main.js:6628824 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Send command input? | 发送命令输入？ | key:promptText · norm-covered · main.js:6689027 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Pricing is based on public API pricing | 定价基于公开 API 价格 | norm-covered · main.js:6716295 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | (Specific to this client's truncation and pagination) | （特定于此客户端的截断与分页） | norm-covered · main.js:6729647 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Run Now | 立即运行 | norm-covered · main.js:6743426 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Terms of Service & Data Use | 服务条款与数据使用 | norm-covered · main.js:6849860 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Set the rules, define the boundaries. | 设定规则，划定边界。 | key:title · norm-covered · main.js:6854970 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Get started | 开始使用 | norm-covered · main.js:6857477 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Manifest Changes | 清单更改 | key:label · norm-covered · main.js:7172419 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Could not load | 无法加载 | norm-covered · main.js:7199911 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No | 否 | key:writeInLabel · norm-covered · main.js:7320038 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Needs reconnect | 需要重新连接 | norm-covered · main.js:7338118 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | App update required | 需要更新应用 | key:label · norm-covered · main.js:7343343 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Host Endpoint | 主机端点 | norm-covered · main.js:7369607 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Previous match | 上一个匹配项 | key:title · norm-covered · main.js:7577251 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reload Window | 重新加载窗口 | norm-covered · main.js:7606099 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restore | 恢复 | key:label · norm-covered · main.js:7624784 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | More cloud environments | 更多云环境 | key:title · norm-covered · main.js:7655814 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Instructions and tools | 指令与工具 | key:label · norm-covered · main.js:7694513 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Don't show this for 2 days | 2 天内不再显示 | key:label · norm-covered · main.js:7714816 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | See Plans | 查看方案 | key:label · norm-covered · main.js:7740092 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Snooze for 24 Hours | 延后 24 小时 | norm-covered · main.js:7753588 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Text attachment | 文本附件 | key:text · norm-covered · main.js:7835366 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Switch mic | 切换麦克风 | norm-covered · main.js:7849148 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chief of Staff voice mode is active | Chief of Staff 语音模式已启用 | key:title · norm-covered · main.js:7872444 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Send Now | 立即发送 | key:tooltip · norm-covered · main.js:7897168 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The full developer experience with code and tooling. | 包含代码与工具的完整开发体验。 | key:description · norm-covered · main.js:7962244 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Learn more by visiting our | 详情请访问我们的 | norm-covered · main.js:7992367 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Build with Google | 使用 Google 构建 | norm-covered · main.js:7998425 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Debug and fix | 调试并修复 | key:title · norm-covered · main.js:8000299 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Automatically reproduce bugs, trace causes, test fixes. | 自动复现缺陷、追踪原因、验证修复。 | key:description · norm-covered · main.js:8000327 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Draft documents, emails, and notes that sound like you. | 起草符合你语气风格的文档、邮件和笔记。 | key:description · norm-covered · main.js:8000578 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Runs remotely | 远程运行 | key:label · norm-covered · main.js:8033327 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Runs on this computer | 在此计算机上运行 | key:label · norm-covered · main.js:8035493 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | See more results | 查看更多结果 | key:label · norm-covered · main.js:8090621 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Switch Roles | 切换角色 | key:title · norm-covered · main.js:8209109 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show details | 显示详情 | norm-covered · main.js:8271787 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show or Hide Extensions | 显示或隐藏扩展 | norm-covered · main.js:8324943 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mount Directory | 挂载目录 | norm-covered · main.js:8330571 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use Existing | 使用现有项 | norm-covered · main.js:8347849 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sent to Chief of Staff | 已发送给 Chief of Staff | key:title · norm-covered · main.js:8504797 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chief of Staff voice mode stopped | Chief of Staff 语音模式已停止 | key:title · norm-covered · main.js:8505229 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Repeat every | 重复间隔 | norm-covered · main.js:8571573 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Change schedule | 更改计划 | key:label · norm-covered · main.js:8586413 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | All runs | 所有运行记录 | norm-covered · main.js:8590827 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Last run | 上次运行 | norm-covered · main.js:8622875 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What should it do? | 它应该做什么？ | key:label · norm-covered · main.js:8655449 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | For example: Morning bug summary | 例如：晨间缺陷汇总 | key:placeholder · norm-covered · main.js:8655705 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Where should it run? | 它应该在哪里运行？ | norm-covered · main.js:8655887 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | When should it run? | 它应该何时运行？ | norm-covered · main.js:8657076 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | A new version is available. | 有新版本可用。 | norm-covered · main.js:10365708 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Start it again. | 重新启动它。 | norm-covered · main.js:10366094 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reload this window. | 重新加载此窗口。 | norm-covered · main.js:10366139 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unrecognized Unicode character " | 无法识别的 Unicode 字符 " | key:errorMsg · norm-covered · main.js:10726145 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fit Mode | 适应模式 | key:label · weak:fitMode · norm-covered · main.js:10793998 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Target text in PDF... | 在 PDF 中定位文本... | key:placeholder · norm-covered · main.js:10932934 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Include unstaged changes | 包含未暂存的更改 | key:label · norm-covered · main.js:11182111 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The change was pushed to Gerrit. | 更改已推送到 Gerrit。 | key:message · norm-covered · main.js:11185921 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Push succeeded | 推送成功 | key:title · norm-covered · main.js:11186072 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unstage change | 取消暂存更改 | key:tooltip · norm-covered · main.js:11186743 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stage change | 暂存更改 | key:tooltip · norm-covered · main.js:11186946 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Discard | 丢弃 | key:label · norm-covered · main.js:11187096 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Discard unstaged changes | 丢弃未暂存的更改 | key:tooltip · norm-covered · main.js:11187126 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 菜单/操作（88 条：ACCEPT 88 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Equalize Split Panes | 均分拆分窗格 | key:label · norm-covered · main.js:1863298 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Command Palette | 打开命令面板 | key:label · norm-covered · main.js:1863806 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Quote Selection | 引用所选内容 | key:label · norm-covered · main.js:1864345 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Comment on Selection | 对所选内容添加评论 | key:label · norm-covered · main.js:1864525 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Go Back in Pane | 在窗格中后退 | key:label · norm-covered · main.js:1865108 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Go Forward in Pane | 在窗格中前进 | key:label · norm-covered · main.js:1865195 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select All | 全选 | key:label · norm-covered · menuOnly · main.js:1868397 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel Generation | 取消生成 | key:label · norm-covered · main.js:1868519 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Aborted due to condition callback returning false. | 因条件回调返回 false 而中止。 | key:message · norm-covered · main.js:1903370 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Move to New Group | 移动到新分组 | key:label · norm-covered · main.js:1931211 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove from Group | 从分组中移除 | key:label · norm-covered · main.js:1931306 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Trajectory Debug View | 打开轨迹调试视图 | key:label · norm-covered · main.js:1931402 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Trajectory ID | 复制轨迹 ID | key:label · norm-covered · main.js:1931596 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Clear | 清除 | key:tooltip · norm-covered · main.js:2735764 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Side Panel | 在侧边面板中打开 | key:label · norm-covered · main.js:3120365 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove from list | 从列表中移除 | key:title · norm-covered · main.js:4342653 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Image Address | 复制图片地址 | key:label · norm-covered · main.js:4398870 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select License | 选择许可 | norm-covered · main.js:4428749 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Delete All Data | 删除所有数据 | norm-covered · main.js:4443158 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select | 选择 | weak:name · norm-covered · main.js:4569222 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What you would like to see to address this gap in your workflow | 你希望看到什么来弥补工作流中的这一缺口 | norm-covered · main.js:4663649 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Attaching logs requires an email address | 附加日志需要填写邮箱地址 | norm-covered · main.js:4672178 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Thank you! Your feedback has been submitted successfully. | 谢谢！你的反馈已成功提交。 | key:message · norm-covered · main.js:4673434 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Running processes are killed. This cannot be undone. | 正在运行的进程将被终止。此操作无法撤销。 | norm-covered · main.js:4704227 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stop Editing | 停止编辑 | key:tooltip · norm-covered · main.js:4714818 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset to Default | 恢复默认 | key:label · norm-covered · main.js:4717216 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset All to Defaults | 全部恢复默认 | key:tooltip · norm-covered · main.js:4728840 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Save audio recordings | 保存录音 | key:label · norm-covered · main.js:4779750 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Delete all recordings? | 删除所有录音？ | key:title · norm-covered · main.js:4781183 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | + Add Hook | + 添加 Hook | norm-covered · main.js:4894143 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Filter resources... | 筛选资源... | key:placeholder · norm-covered · main.js:4979030 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Manage and delete your data anytime | 随时管理和删除你的数据 | key:title · norm-covered · main.js:4987984 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy as Markdown | 复制为 Markdown | norm-covered · main.js:5844222 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Confirmation required to execute this step | 执行此步骤需要确认 | norm-covered · main.js:6436750 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Playback available | 可回放 | norm-covered · main.js:6445175 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel Step | 取消此步骤 | norm-covered · main.js:6455390 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy command | 复制命令 | key:title · norm-covered · main.js:6503234 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | [Dev Mode] View full search results | [开发模式] 查看完整搜索结果 | norm-covered · main.js:6632085 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in side pane | 在侧边窗格中打开 | key:tooltip · norm-covered · main.js:6649702 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open extracted DOM in editor | 在编辑器中打开提取的 DOM | norm-covered · main.js:6674089 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View network requests | 查看网络请求 | norm-covered · main.js:6675443 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View network request | 查看网络请求 | norm-covered · main.js:6676505 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Click to view more | 点击查看更多 | norm-covered · main.js:6718255 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View Logs | 查看日志 | norm-covered · main.js:6743735 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search for commands... | 搜索命令... | key:placeholder · norm-covered · main.js:6833467 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in New Window | 在新窗口中打开 | key:tooltip · norm-covered · main.js:7105596 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Drag to select a region to comment | 拖动选择要评论的区域 | norm-covered · main.js:7116187 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View could not be opened | 无法打开该视图 | norm-covered · main.js:7152380 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Submit comment | 提交评论 | norm-covered · main.js:7155504 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel All Tasks | 取消所有任务 | key:tooltip · norm-covered · main.js:7222119 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel Task | 取消任务 | key:content · norm-covered · main.js:7224026 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Side Pane UI Available | 侧边窗格界面可用 | norm-covered · main.js:7366429 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Side Pane | 在侧边窗格中打开 | norm-covered · main.js:7366762 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | UI view does not exist. | 该界面视图不存在。 | norm-covered · main.js:7560261 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Next match | 下一个匹配项 | key:title · norm-covered · main.js:7577766 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Send Feedback | 发送反馈 | norm-covered · main.js:7606004 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View Debug | 查看调试信息 | key:label · norm-covered · main.js:7625424 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Drag to resize, double-click to reset | 拖动调整大小，双击重置 | key:title · norm-covered · main.js:7701543 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy debug info | 复制调试信息 | key:label · norm-covered · main.js:7735224 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Research, writing, and everyday tasks, without code. | 研究、写作与日常任务，无需代码。 | key:description · norm-covered · main.js:7962351 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Continue with Google | 使用 Google 继续 | key:title · norm-covered · main.js:7964139 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Continue with Google Cloud | 使用 Google Cloud 继续 | key:title · norm-covered · main.js:7964172 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Hand off a feature and come back to working code. | 交出一项功能，回来时已是可用代码。 | key:description · norm-covered · main.js:8000212 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Research anything | 研究任何主题 | key:title · norm-covered · main.js:8000426 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Ask about your code or any topic, get clear answers. | 询问你的代码或任何主题，获得清晰的解答。 | key:description · norm-covered · main.js:8000458 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Write and edit docs | 撰写和编辑文档 | key:title · norm-covered · main.js:8000544 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add All | 全部添加 | norm-covered · main.js:8024447 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This cannot be undone. | 此操作无法撤销。 | norm-covered · main.js:8040917 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Hub | 在 Hub 中打开 | norm-covered · main.js:8184348 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Antigravity IDE | 在 Antigravity IDE 中打开 | norm-covered · main.js:8194795 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Trajectory Debug View | 轨迹调试视图 | key:tooltip · norm-covered · main.js:8199451 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open side-by-side view | 打开并排视图 | key:title · norm-covered · main.js:8226239 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Address CLs needing attention | 处理需要关注的 CL | key:title · norm-covered · main.js:8261418 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Click to Open Docs | 点击打开文档 | norm-covered · main.js:8315522 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show in Sidebar | 在侧边栏中显示 | norm-covered · main.js:8325242 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Rename Group | 重命名分组 | key:renameLabel · norm-covered · main.js:8370074 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close Panel | 关闭面板 | norm-covered · main.js:8411424 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Next run | 下次运行 | norm-covered · main.js:8565467 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add filter | 添加筛选条件 | norm-covered · main.js:8598141 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Your changes were not saved. Please try again. | 你的更改未保存，请重试。 | key:message · norm-covered · main.js:8611577 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset State | 重置状态 | key:title · norm-covered · main.js:10359265 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Delete Data Directory | 删除数据目录 | norm-covered · main.js:10359763 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Go to the machine you are controlling and quit Antigravity. It installs pending updates the next time it starts. | 前往你正在控制的计算机并退出 Antigravity。下次启动时会安装待处理的更新。 | norm-covered · main.js:10365951 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset to preset | 恢复为预设 | key:content · norm-covered · main.js:10447847 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Search | 打开搜索 | key:title · norm-covered · main.js:10962436 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open a pull request | 发起拉取请求 | key:linkLabel · norm-covered · main.js:11185606 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open a merge request | 发起合并请求 | key:linkLabel · norm-covered · main.js:11185738 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open the change | 打开此更改 | key:linkLabel · norm-covered · main.js:11185966 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 对话/消息（82 条：ACCEPT 82 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Continue Response | 继续生成回复 | key:label · norm-covered · main.js:1862893 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Split Conversation Vertically | 纵向拆分对话 | key:label · norm-covered · main.js:1863087 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Split Conversation Horizontally | 横向拆分对话 | key:label · norm-covered · main.js:1863193 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Conversation History | 打开对话历史 | key:label · norm-covered · main.js:1865514 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Conversation | 打开对话 | key:label · norm-covered · main.js:1866157 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mark as Unread | 标记为未读 | key:label · norm-covered · main.js:1866335 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Archive / Restore | 归档 / 恢复 | key:label · norm-covered · main.js:1866511 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Terminal: Add to Chat | 终端：添加到对话 | key:label · norm-covered · main.js:1866623 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Conversation Markdown | 复制对话 Markdown | key:label · norm-covered · main.js:1867117 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Archive This Conversation | 归档此对话 | key:label · norm-covered · main.js:1867354 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Pin This Conversation | 置顶此对话 | key:label · norm-covered · main.js:1867481 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unpin This Conversation | 取消置顶此对话 | key:label · norm-covered · main.js:1867604 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mark This Conversation as Read | 将此对话标记为已读 | key:label · norm-covered · main.js:1930908 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mark This Conversation as Unread | 将此对话标记为未读 | key:label · norm-covered · main.js:1931010 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Rename This Conversation | 重命名此对话 | key:label · norm-covered · main.js:1931123 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Conversation ID | 复制对话 ID | key:label · norm-covered · main.js:1931502 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove from history (Shift+Delete) | 从历史记录中移除（Shift+Delete） | key:title · norm-covered · main.js:3486205 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chat Width | 对话宽度 | key:title · norm-covered · main.js:4603775 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chat Input | 对话输入框 | key:title · norm-covered · main.js:4604106 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Send messages with the keyboard's Enter key instead of starting a new line. | 使用键盘的 Enter 键发送消息，而不是换行。 | key:description · norm-covered · main.js:4606554 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Conversation Steps | 对话步骤 | key:label · norm-covered · main.js:4610674 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose how much detail is shown during a conversation. | 选择对话过程中显示的详细程度。 | key:description · norm-covered · main.js:4610707 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Background tasks and terminals agents left running, across all conversations. | 所有对话中由智能体遗留运行的后台任务与终端。 | key:description · norm-covered · main.js:4702165 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Conversation in New Tab | 在新标签页中打开对话 | key:label · norm-covered · main.js:4723066 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browsing History | 浏览历史 | key:label · norm-covered · main.js:4856076 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Which workspace the New Conversation button and keyboard shortcut start you in. | 「新建对话」按钮和快捷键会在哪个工作区中开始。 | key:description · norm-covered · main.js:4857559 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to revert conversation | 无法还原对话 | key:title · norm-covered · main.js:5450906 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Creating projects for your conversations | 正在为你的对话创建项目 | norm-covered · main.js:5546247 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This conversation is not on disk. Delete it to remove it from your sidebar. | 此对话未保存在磁盘上。删除它即可从侧边栏移除。 | key:message · norm-covered · main.js:5564109 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The conversation was compacted to fit within the context window. | 对话已压缩，以适应上下文窗口。 | norm-covered · main.js:6362895 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The conversation was compacted while generating this response. | 生成此回复时对话已被压缩。 | key:text · norm-covered · main.js:6362996 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel Sending Message | 取消发送消息 | key:tooltip · norm-covered · main.js:6379829 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Message | 复制消息 | key:label · norm-covered · main.js:6426261 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to send side question | 发送支线问题失败 | key:title · norm-covered · main.js:6564067 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to start side question | 启动支线问题失败 | key:title · norm-covered · main.js:6564506 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Conversation Unarchived | 对话已取消归档 | key:title · norm-covered · main.js:6587151 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to rename conversation | 重命名对话失败 | key:title · norm-covered · main.js:6588052 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to delete conversation | 删除对话失败 | key:title · norm-covered · main.js:6588385 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to stop conversation | 停止对话失败 | key:title · norm-covered · main.js:6588952 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to start conversation | 启动对话失败 | key:title · norm-covered · main.js:6591391 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fork in Shared Workspace | 在共享工作区中派生 | key:label · norm-covered · main.js:6704395 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fork in New Workspace | 在新工作区中派生 | key:label · norm-covered · main.js:6704450 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to fork conversation | 派生对话失败 | key:title · norm-covered · main.js:6707158 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Disk is full. Search will no longer match in conversation bodies until you clear up space and restart. | 磁盘已满。清理空间并重启之前，搜索将不再匹配对话正文。 | norm-covered · main.js:6825729 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Only Unread | 仅未读 | norm-covered · main.js:6829002 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Only Archived | 仅已归档 | norm-covered · main.js:6829177 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search for conversations... | 搜索对话... | key:placeholder · norm-covered · main.js:6836410 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Couldn't mark conversations as read | 无法将对话标记为已读 | key:title · norm-covered · main.js:6846817 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Conversation unavailable | 对话不可用 | key:title · norm-covered · main.js:6862369 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The conversation could not be loaded because its data was not found. | 无法加载该对话，因为找不到其数据。 | key:message · norm-covered · main.js:6862404 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This conversation grew too large, so the history before this point may be missing or incomplete. | 此对话变得过长，此前的历史记录可能缺失或不完整。 | norm-covered · main.js:7285705 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Rename Conversation | 重命名对话 | key:title · norm-covered · main.js:7613208 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fork | 派生 | key:label · norm-covered · main.js:7625659 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restore Conversation | 恢复对话 | key:content · norm-covered · main.js:7641871 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This prompt is straightforward and does not need alternative comparisons. | 此提示很直接，无需进行备选对比。 | key:title · norm-covered · main.js:7711443 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | I prefer an immediate single response to prioritize productivity right now. | 我现在更希望立即得到单一回复，以优先保证效率。 | key:title · norm-covered · main.js:7711657 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Tip: Complex tasks get better results with multiple responses. | 提示：复杂任务使用多个回复效果更好。 | norm-covered · main.js:7715103 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This conversation is also open in another app. Sending messages from both may cause conflicts. | 此对话也在另一个应用中打开。两边同时发送消息可能产生冲突。 | key:message · norm-covered · main.js:7731961 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sending transcribed message... | 正在发送转写后的消息... | norm-covered · main.js:7876124 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Number of responses | 回复数量 | norm-covered · main.js:7881423 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Trigger multiple response variants from the same prompt. | 从同一提示触发多个回复变体。 | norm-covered · main.js:7882693 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Couldn't edit queued message | 无法编辑排队中的消息 | key:title · norm-covered · main.js:7927167 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chat anyways | 仍然开始对话 | norm-covered · main.js:7941546 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to load shared conversation | 加载共享对话失败 | norm-covered · main.js:8104850 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Importing shared conversation... | 正在导入共享对话... | norm-covered · main.js:8105335 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View archived in the sidebar | 在侧边栏中查看归档 | norm-covered · main.js:8114499 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Error: Artifacts from remote conversations are not available here. | 错误：此处无法查看远程对话的产物。 | norm-covered · main.js:8213671 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Check pending conversations in the last 3 days that require action from me. | 检查最近 3 天内需要我处理的待办对话。 | weak:prompt · norm-covered · main.js:8261320 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Check CLs that require my attention and fix them in their respective conversations. | 检查需要我关注的 CL，并在各自的对话中修复它们。 | weak:prompt · norm-covered · main.js:8261457 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Learn from my conversation history to write a personalized set of rules for future agentic interactions. | 从我的对话历史中学习，为今后的智能体交互编写一套个性化规则。 | weak:prompt · norm-covered · main.js:8261608 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use my conversation history to tell me which skills and plugins would be helpful for me. | 利用我的对话历史，告诉我哪些技能和插件对我有帮助。 | weak:prompt · norm-covered · main.js:8261784 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Conversation copied as Markdown to clipboard | 对话已作为 Markdown 复制到剪贴板 | key:title · norm-covered · main.js:8265145 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close split view and go to forked conversation | 关闭拆分视图并前往派生对话 | key:title · norm-covered · main.js:8306043 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading conversations... | 正在加载对话... | norm-covered · main.js:8326346 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show temporary and forked workspaces | 显示临时和派生工作区 | norm-covered · main.js:8358236 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Ask a side question without interrupting the main conversation | 提出支线问题，不打断主对话 | norm-covered · main.js:8453729 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stop Side Question | 停止支线问题 | norm-covered · main.js:8455338 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chief of Staff voice message failed | Chief of Staff 语音消息发送失败 | key:title · norm-covered · main.js:8504918 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Prompt to run when triggered... | 触发时运行的提示... | key:placeholder · norm-covered · main.js:8603085 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here. | 按计划运行提示，例如每天早上汇总昨天的变更。运行记录会显示在这里。 | norm-covered · main.js:8663936 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fork conversation in this folder | 在此文件夹中派生对话 | key:label · norm-covered · main.js:11113857 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Rewinds the conversation only. Files in this folder stay as they are now. | 仅回退对话。此文件夹中的文件保持当前状态。 | key:historicalTooltip · norm-covered · main.js:11113969 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 项目/工作区/文件/终端（64 条：ACCEPT 64 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Open Workspace Selector | 打开工作区选择器 | key:label · norm-covered · main.js:1864075 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Commit Graph | 打开提交图 | key:label · norm-covered · main.js:1865419 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Folder | 打开文件夹 | key:label · norm-covered · main.js:1874862 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show in folder | 在文件夹中显示 | key:title · norm-covered · main.js:4341835 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Contact your administrator to set up Gemini Enterprise for this project | 请联系管理员为此项目设置 Gemini Enterprise | norm-covered · main.js:4429816 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Optimize the interface and terminal output for screen readers. | 为屏幕阅读器优化界面和终端输出。 | key:description · norm-covered · main.js:4611160 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Terminal Placement | 终端位置 | key:label · norm-covered · main.js:4611648 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose where terminal sessions appear. | 选择终端会话出现的位置。 | key:description · norm-covered · main.js:4611681 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use full VCS clones for Best of N | Best of N 使用完整 VCS 克隆 | key:label · norm-covered · main.js:4617421 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use full Git clones for Best of N | Best of N 使用完整 Git 克隆 | key:label · norm-covered · main.js:4617813 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Simulate running on a different OS. | 模拟在其他操作系统上运行。 | key:description · norm-covered · main.js:4631559 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Simulate a different user cohort (Google, External, Enterprise). | 模拟其他用户群组（Google、外部、企业）。 | key:description · norm-covered · main.js:4632187 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Workspaces | 工作区 | key:title · norm-covered · main.js:4858032 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Your administrator has disabled MCP servers for this workspace. | 管理员已为此工作区停用 MCP 服务器。 | norm-covered · main.js:4877917 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Folder doesn't exist | 文件夹不存在 | key:content · norm-covered · main.js:4984475 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cannot parse folder URI. | 无法解析文件夹 URI。 | key:content · norm-covered · main.js:4984739 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Connected Google Drive and GitHub resources | 已连接的 Google Drive 与 GitHub 资源 | key:title · norm-covered · main.js:4987765 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Files, folders, and repositories you connect are accessible to your agent in this project, including during background or scheduled runs. | 你连接的文件、文件夹和仓库可供此项目中的智能体访问，包括后台或定时运行期间。 | key:description · norm-covered · main.js:4987823 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Files and resources in cloud workspaces | 云工作区中的文件与资源 | key:title · norm-covered · main.js:4989737 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | All Workspaces | 所有工作区 | norm-covered · main.js:5012949 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Diff | 查看差异 | norm-covered · main.js:6385309 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Revert file changes | 还原文件更改 | key:label · norm-covered · main.js:6387289 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | File Diff Comments | 文件差异评论 | norm-covered · main.js:6411424 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | File Comments | 文件评论 | norm-covered · main.js:6411726 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Could not create project | 无法创建项目 | key:title · norm-covered · main.js:6558261 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Inspected commit | 已检查的提交 | norm-covered · main.js:6660932 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Folders these agents can access. | 这些智能体可访问的文件夹。 | key:description · norm-covered · main.js:6740290 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Commands and files these agents can use. | 这些智能体可使用的命令和文件。 | key:description · norm-covered · main.js:6740420 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search file contents... | 搜索文件内容... | key:placeholder · norm-covered · main.js:6789106 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search projects... | 搜索项目... | key:placeholder · norm-covered · main.js:6838208 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | True changes vs the parent workspace | 相对父工作区的真实更改 | key:subtitle · norm-covered · main.js:7172447 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add Terminal | 添加终端 | norm-covered · main.js:7180921 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | File explorer | 文件资源管理器 | key:text · norm-covered · main.js:7197807 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | File Tree Component is not loaded. | 文件树组件未加载。 | norm-covered · main.js:7201214 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Terminal | 打开终端 | key:content · norm-covered · main.js:7239823 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Uses your local clone, | 使用你的本地克隆， | norm-covered · main.js:7686438 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search branches | 搜索分支 | key:placeholder · norm-covered · main.js:7786604 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Worktrees are a git feature. This folder is shared as is. | 工作树是 Git 的功能。此文件夹按原样共享。 | key:content · norm-covered · main.js:7787846 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Work in a New Worktree | 在新工作树中工作 | norm-covered · main.js:7791659 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Keeps your checkout untouched | 保持当前检出不变 | norm-covered · main.js:7791761 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select Worktree | 选择工作树 | norm-covered · main.js:7795325 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Run in your current workspace | 在当前工作区中运行 | key:description · norm-covered · main.js:7839731 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Run in a new worktree | 在新工作树中运行 | key:description · norm-covered · main.js:7839824 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Clone current workspace into a new independent workspace | 将当前工作区克隆到新的独立工作区 | key:description · norm-covered · main.js:7839913 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enter Google Cloud Project Details | 输入 Google Cloud 项目详情 | norm-covered · main.js:7993247 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy the folder elsewhere first if you might want it back. | 如果以后可能还需要，请先把文件夹复制到别处。 | norm-covered · main.js:8040943 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enter project name... | 输入项目名称... | key:placeholder · norm-covered · main.js:8350092 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | A project with this name already exists. | 同名项目已存在。 | norm-covered · main.js:8350349 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search workspaces... | 搜索工作区... | key:placeholder · norm-covered · main.js:8352838 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unmount workspace | 卸载工作区 | key:tooltip · norm-covered · main.js:8356944 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remount workspace | 重新挂载工作区 | key:tooltip · norm-covered · main.js:8357309 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Delete workspace | 删除工作区 | key:tooltip · norm-covered · main.js:8357670 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Are you sure you want to delete the workspace | 确定要删除工作区吗 | norm-covered · main.js:8359727 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Kill Terminal | 终止终端 | key:label · norm-covered · main.js:8404884 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Resume it to open a new terminal. Anything that was running in this one has stopped. | 恢复它以打开新终端。此前在其中运行的内容均已停止。 | key:description · norm-covered · main.js:8407064 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add files | 添加文件 | key:content · norm-covered · main.js:8522242 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select workspace | 选择工作区 | norm-covered · main.js:8637001 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Create a project first. | 请先创建一个项目。 | norm-covered · main.js:8650290 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Read access to code, refs, commits, and other repository contents. | 对代码、引用、提交和其它仓库内容的读取权限。 | norm-covered · main.js:10389050 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Grant create, update, or delete access to specific branches. | 授予对特定分支的创建、更新或删除权限。 | norm-covered · main.js:10393729 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Current workspace | 当前工作区 | key:label · norm-covered · main.js:11138544 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Commit succeeded | 提交成功 | key:title · norm-covered · main.js:11183622 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The branch was pushed to GitLab. | 分支已推送到 GitLab。 | key:message · norm-covered · main.js:11185693 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Created a new branch on Origin. | 已在 Origin 上创建新分支。 | key:message · norm-covered · main.js:11185795 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 内置浏览器/预览/下载（52 条：ACCEPT 51 / REJECT 0 / REVIEW 1）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Close Tab | 关闭标签页 | key:label · norm-covered · menuOnly · main.js:1862744 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close Terminal Tab | 关闭终端标签页 | key:label · norm-covered · main.js:1863387 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Previous Side Panel Tab | 上一个侧边面板标签页 | key:label · norm-covered · main.js:1868023 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Next Side Panel Tab | 下一个侧边面板标签页 | key:label · norm-covered · main.js:1868110 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Tab | 在标签页中打开 | key:label · norm-covered · main.js:2958186 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | Many external websites (such as Google Search, GitHub, or Wikipedia) restrict iframe embedding via | 许多外部网站（例如 Google 搜索、GitHub 或 Wikipedia）通过以下方式限制 iframe 嵌入 | main.js:3408437 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：GitHub）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Attackers might be able to see the images you're looking at on this site and trick you by modifying them. | 攻击者可能看到你在此网站浏览的图片，并通过篡改图片来欺骗你。 | key:description · norm-covered · main.js:3428626 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open the page in system browser | 在系统浏览器中打开此页面 | norm-covered · main.js:3945016 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel download | 取消下载 | key:title · norm-covered · main.js:4342240 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Link in New Tab | 在新标签页中打开链接 | key:label · norm-covered · main.js:4398175 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Link in External Browser | 在外部浏览器中打开链接 | key:label · norm-covered · main.js:4398329 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Link Address | 复制链接地址 | key:label · norm-covered · main.js:4398482 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Image in New Tab | 在新标签页中打开图片 | key:label · norm-covered · main.js:4398716 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Built-in Browser | 在内置浏览器中打开 | key:label · norm-covered · main.js:4409351 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Continue your work from another device with Remote Control. Scan the QR code or open the link below. | 通过远程控制从其它设备继续工作。扫描二维码或打开下方链接。 | key:description · norm-covered · main.js:4544843 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable Browser Tools | 启用浏览器工具 | key:label · norm-covered · main.js:4612991 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Download Location | 下载位置 | key:label · norm-covered · main.js:4854762 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Folder where files downloaded in the built-in browser are saved. | 内置浏览器下载文件的保存文件夹。 | norm-covered · main.js:4854898 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Upload Files | 上传文件 | key:label · norm-covered · main.js:4981833 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Here's how uploaded files, attachments, and connected resources work in your cloud environment | 下面说明上传文件、附件和已连接资源在云环境中的工作方式 | norm-covered · main.js:4989986 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Uploaded files and connected resources are mounted in your cloud environment. | 上传的文件和已连接的资源会挂载到你的云环境中。 | norm-covered · main.js:4992455 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Upload Debug Bundle | 上传调试包 | norm-covered · main.js:5021121 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This link wants to open an app on your device. | 此链接想要打开你设备上的应用。 | norm-covered · main.js:5572324 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open link | 打开链接 | key:linkLabel · norm-covered · main.js:5573402 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mention Page | 提及页面 | key:title · norm-covered · main.js:6440747 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Capture Screenshot | 截取屏幕截图 | key:title · norm-covered · main.js:6440905 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Launching the browser... | 正在启动浏览器... | norm-covered · main.js:6446301 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The agent will wait for you to install the browser extension. | 智能体会等待你安装浏览器扩展。 | norm-covered · main.js:6446354 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Antigravity would like to use the browser. | Antigravity 想要使用浏览器。 | norm-covered · main.js:6446445 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Denied Sites | 被拒绝的网站 | norm-covered · main.js:6449992 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The agent was prevented from accessing some sites | 智能体被阻止访问某些网站 | norm-covered · main.js:6450151 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent can retrieve console logs from the browser and return it for further processing. | 智能体可以从浏览器获取控制台日志并返回以作进一步处理。 | norm-covered · main.js:6453166 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser Use | 浏览器使用 | key:label · norm-covered · main.js:6487827 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | View Page | 查看页面 | key:title · norm-covered · main.js:6665879 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser actions | 浏览器操作 | key:label · norm-covered · main.js:6732237 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Uploaded to Google Drive | 已上传到 Google Drive | key:title · norm-covered · main.js:7105176 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Link copied to clipboard. | 链接已复制到剪贴板。 | key:message · norm-covered · main.js:7105211 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Error loading Browser recording | 加载浏览器录制失败 | norm-covered · main.js:7145498 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading Browser recording... | 正在加载浏览器录制... | norm-covered · main.js:7145809 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unable to resolve audio source URL | 无法解析音频源网址 | norm-covered · main.js:7146610 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Click to copy URL | 点击复制网址 | key:title · norm-covered · main.js:7765536 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser control is gated in remote sessions. | 远程会话中浏览器控制受限。 | norm-covered · main.js:7765968 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Google Chrome on the machine running Antigravity. | 在运行 Antigravity 的计算机上打开 Google Chrome。 | norm-covered · main.js:7766598 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Couldn't load Google Drive link title | 无法加载 Google Drive 链接标题 | key:title · norm-covered · main.js:7948391 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close Tabs to the Left | 关闭左侧标签页 | key:label · norm-covered · main.js:8479712 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close Tabs to the Right | 关闭右侧标签页 | key:label · norm-covered · main.js:8479853 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Download this site as an app to get notified when the agent needs your attention or completes a task. | 将此站点下载为应用，以便智能体需要你关注或完成任务时收到通知。 | key:message · norm-covered · main.js:10372832 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Previous Page | 上一页 | key:title · norm-covered · main.js:10787485 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Next Page | 下一页 | key:title · norm-covered · main.js:10788179 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser tools are not available in the Antigravity Android desktop app. | Antigravity Android 桌面应用中不提供浏览器工具。 | key:gatingMessage · norm-covered · main.js:11115365 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser tools are disabled in the Antigravity Android desktop app. | 浏览器工具已在 Antigravity Android 桌面应用中停用。 | key:settingsGatingMessage · norm-covered · main.js:11115461 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The remote shared a link for this push. | 远端分享了此次推送的链接。 | key:message · norm-covered · main.js:11185994 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 模型/代理/配额（41 条：ACCEPT 41 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Embedding Limitations | 嵌入限制 | norm-covered · main.js:3408328 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select Billing Model | 选择计费模式 | norm-covered · main.js:4433106 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Context and Quota Indicator | 上下文与配额指示器 | key:label · norm-covered · main.js:4612274 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show how full the context window is next to the send button. Click it for a breakdown and to see your model quota. | 在发送按钮旁显示上下文窗口占用情况。点击可查看明细和模型配额。 | key:description · norm-covered · main.js:4612316 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What quota or feature is being incorrectly limited | 哪项配额或功能被错误地限制了 | norm-covered · main.js:4664089 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No quota information available. | 暂无配额信息。 | norm-covered · main.js:4680444 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading token usage... | 正在加载 token 用量... | norm-covered · main.js:4743919 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No token data available. | 暂无 token 数据。 | norm-covered · main.js:4744345 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Daily conversation limit reached | 已达到每日对话上限 | key:title · norm-covered · main.js:6558897 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Conversation limit reached | 已达到对话上限 | key:title · norm-covered · main.js:6559001 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No model specified for Battle Mode, falling back to use current selected model | 未为 Battle 模式指定模型，将回退到当前所选模型 | key:title · norm-covered · main.js:6573985 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Models Tab | 模型标签页 | norm-covered · main.js:6623552 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | AI Credits Used to Generate Response | 生成此回复所用的 AI 额度 | key:text · norm-covered · main.js:6623604 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Parent workspace not found for this battle. | 找不到此 battle 的父工作区。 | key:error · norm-covered · main.js:7168092 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The current trigger rate is too high. | 当前触发率过高。 | key:title · norm-covered · main.js:7711369 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This request is not well-suited for parallel Best-of-N generation. | 此请求不太适合并行的 Best-of-N 生成。 | key:title · norm-covered · main.js:7711562 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Why are you opting out of auto-triggered Best-of-N? | 你为什么选择退出自动触发的 Best-of-N？ | key:title · norm-covered · main.js:7713301 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable Best-of-2 | 启用 Best-of-2 | norm-covered · main.js:7715232 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | You can prompt the model to try again or start a new conversation if the error persists. | 可以让模型重试；如果错误仍然存在，请开始新对话。 | norm-covered · main.js:7737828 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Insufficient AI Credits | AI 额度不足 | key:title · norm-covered · main.js:7739910 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Purchase Credits | 购买额度 | key:label · norm-covered · main.js:7739967 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Model quota reached | 模型配额已用尽 | key:title · norm-covered · main.js:7740618 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select another model | 选择其他模型 | key:label · norm-covered · main.js:7740671 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Baseline model quota reached | 基准模型配额已用尽 | key:title · norm-covered · main.js:7741199 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable Overages | 启用超额用量 | key:label · norm-covered · main.js:7741262 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select Model to Send Message | 选择模型以发送消息 | key:title · norm-covered · main.js:7743264 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select a model using the model selector in the input box | 使用输入框中的模型选择器选择模型 | key:message · norm-covered · main.js:7743304 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Migrate with Agent | 使用智能体迁移 | norm-covered · main.js:7748698 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Edit Model | 编辑模型 | norm-covered · main.js:7818434 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add Model | 添加模型 | norm-covered · main.js:7819458 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Custom models are only supported on Linux machines. | 自定义模型仅在 Linux 计算机上受支持。 | norm-covered · main.js:7819756 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Harness per Response | 每个回复的测试框架 | norm-covered · main.js:7879270 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Curated sets of plugins for common workflows and roles. | 为常见工作流和角色精选的插件集合。 | norm-covered · main.js:8088798 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Generate personalized rules | 生成个性化规则 | key:title · norm-covered · main.js:8261571 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | New models have been enabled for you! | 已为你启用新模型！ | key:title · norm-covered · main.js:8311972 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browser is currently being operated by this conversation in another Hub window | 此浏览器正由另一个 Hub 窗口中的该对话操作 | norm-covered · main.js:8489785 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Change model | 更改模型 | key:label · norm-covered · main.js:8586681 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | GitHub Personal Access Token | GitHub 个人访问令牌 | key:title · norm-covered · main.js:10380301 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | A comma-separated list like repo-a, repo-b, or * for all. | 逗号分隔的列表，如 repo-a、repo-b，或用 * 表示全部。 | norm-covered · main.js:10388580 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | A comma-separated list like org-a, org-b, or * for all. | 逗号分隔的列表，如 org-a、org-b，或用 * 表示全部。 | norm-covered · main.js:10397968 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to Generate Commit Message | 生成提交信息失败 | key:title · norm-covered · main.js:11183194 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 权限/安全/沙箱（40 条：ACCEPT 39 / REJECT 0 / REVIEW 1）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `REVIEW` | Intended primarily for previewing local development servers (e.g., | 主要用于预览本地开发服务器（例如 | main.js:3407808 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `ACCEPT` | Security | 安全 | norm-covered · main.js:4331407 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content. | 智能体从不请求审查。这最大化了自主性，但智能体处理不安全或被注入的产物内容时风险也最高。 | key:description · norm-covered · main.js:4603061 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Specifies the agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience. | 指定智能体就产物请求审查时的行为；产物是它创建的文档，用于带来更丰富的对话体验。 | key:description · norm-covered · main.js:4609545 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Configure workspace-specific permissions, resources, and customizations. | 配置工作区专属的权限、资源和自定义项。 | key:description · norm-covered · main.js:4759516 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | These allowed domain rules are set by your organization's administrator and cannot be removed. | 这些允许的域名规则由组织管理员设置，无法移除。 | norm-covered · main.js:4789457 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allowed Domains | 允许的域名 | norm-covered · main.js:4789744 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow/deny agent read access to specific files or directories. | 允许 / 拒绝智能体读取特定文件或目录。 | key:description · norm-covered · main.js:4836209 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow/deny agent write access to specific files or directories. | 允许 / 拒绝智能体写入特定文件或目录。 | key:description · norm-covered · main.js:4836525 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow/deny agent read access to specific URLs or domains. | 允许 / 拒绝智能体读取特定网址或域名。 | key:description · norm-covered · main.js:4836826 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow/deny agent command execution outside the sandbox. | 允许 / 拒绝智能体在沙箱外执行命令。 | key:description · norm-covered · main.js:4837443 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restricts agent tools to a secure, isolated local sandbox. | 将智能体工具限制在安全、隔离的本地沙箱中。 | key:description · norm-covered · main.js:4843375 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Controls permissions for remote conversations. | 控制远程对话的权限。 | key:description · norm-covered · main.js:4847610 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Permission Details | 权限详情 | key:title · norm-covered · main.js:4849979 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | These MCP allowlist rules are enforced by your organization's administrator. | 这些 MCP 允许列表规则由组织管理员强制执行。 | norm-covered · main.js:4880383 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Uploaded project files and in-chat attachments are stored on Google servers and mounted into your cloud sandbox so your agent can read and work with them. | 上传的项目文件和对话内附件存储在 Google 服务器上，并挂载到你的云沙箱，供智能体读取和处理。 | key:description · norm-covered · main.js:4987585 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Site Allowlist | 网站允许列表 | norm-covered · main.js:6450979 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The Agent attempted to interact with some sites that are not allowlisted | 智能体尝试与某些不在允许列表中的网站交互 | norm-covered · main.js:6451124 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add them to allow future interactions | 添加它们以允许后续交互 | norm-covered · main.js:6451664 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open allowlist | 打开允许列表 | norm-covered · main.js:6451832 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This command ran in the sandbox. | 此命令已在沙箱中运行。 | norm-covered · main.js:6630916 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Unsandboxed commands | 沙箱外命令 | key:label · norm-covered · main.js:6732028 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This extension has no declared permissions requiring user input. | 此扩展没有声明需要用户输入的权限。 | norm-covered · main.js:6737413 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Resolving permissions... | 正在解析权限... | norm-covered · main.js:6740197 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Security Notice & Data Use | 安全须知与数据使用 | norm-covered · main.js:6851419 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Review plans and walkthroughs | 审查计划与演练 | key:title · norm-covered · main.js:6854818 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | By default, agents work in folders you choose and ask before sensitive changes. Adjust this anytime in Settings. | 默认情况下，智能体在你选择的文件夹中工作，进行敏感更改前会先询问。可随时在设置中调整。 | key:description · norm-covered · main.js:6855022 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Inline PDF preview is not available in this environment. | 此环境中不支持内联 PDF 预览。 | key:message · norm-covered · main.js:7143029 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Preview is not available for this file type. | 此文件类型不支持预览。 | key:message · norm-covered · main.js:7149457 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Blocked, needs input | 已阻塞，需要输入 | norm-covered · main.js:7236751 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | "Allow remote debugging for this browser instance" | 「允许对此浏览器实例进行远程调试」 | norm-covered · main.js:7767696 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Confirm the command is safe to run outside of the sandbox with full network and disk access. | 确认该命令在沙箱外以完整网络和磁盘权限运行是安全的。 | norm-covered · main.js:8271179 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow creating issues and grant access to specific issues. | 允许创建 issue，并授予对特定 issue 的访问权限。 | norm-covered · main.js:10389939 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle this on to allow creating new issues. | 开启此项以允许创建新 issue。 | norm-covered · main.js:10390310 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow opening pull requests and grant access to specific PRs. | 允许发起拉取请求，并授予对特定 PR 的访问权限。 | norm-covered · main.js:10391778 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle this on to allow creating new pull requests. | 开启此项以允许创建新的拉取请求。 | norm-covered · main.js:10392159 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Grant read access to workflow runs and allow dispatching workflows on specific files and refs. | 授予工作流运行的读取权限，并允许对特定文件和引用触发工作流。 | norm-covered · main.js:10395140 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Allow reading workflow runs (list, view, watch) across the whole repository. | 允许读取整个仓库的工作流运行（列表、查看、监视）。 | norm-covered · main.js:10395547 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable fine-grained GitHub permissions and define the org, repository, and resource-level access the agent is allowed to use. | 启用细粒度 GitHub 权限，并定义允许智能体使用的组织、仓库和资源级访问权限。 | key:subtitle · norm-covered · main.js:10405747 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Manage fine-grained permissions for GitHub. | 管理 GitHub 的细粒度权限。 | key:description · norm-covered · main.js:10406917 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 登录/账号/权限验证（38 条：ACCEPT 37 / REJECT 0 / REVIEW 1）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers. | 请勿在此网站输入任何敏感信息（例如密码或信用卡号），攻击者可能窃取这些信息。 | key:description · norm-covered · main.js:3427488 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Your Antigravity use will be associated with provided project. | 你对 Antigravity 的使用将与所提供的项目关联。 | norm-covered · main.js:4427522 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Verify that these licenses were provided by your administrator and that you trust the project ID before proceeding. Account activity and data may be logged by your organization. | 继续前请确认这些许可由管理员提供，且你信任该项目 ID。你的组织可能会记录账号活动和数据。 | norm-covered · main.js:4428839 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Your Antigravity use will be associated with provided project. Make sure you trust the project ID before proceeding. Account activity and data may be logged by your organization. | 你对 Antigravity 的使用将与所提供的项目关联。继续前请确认你信任该项目 ID。你的组织可能会记录账号活动和数据。 | norm-covered · main.js:4430568 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Auto-assignment not configured | 未配置自动分配 | key:errorMessage · norm-covered · main.js:4438024 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What functionality you expect your account tier to have available that is missing | 你认为自己的账号等级应有哪些功能却缺失了 | norm-covered · main.js:4664169 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Paste auth code | 粘贴授权码 | key:placeholder · norm-covered · main.js:4866037 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Services this plugin connects to on your behalf. Credentials stay on this machine and are only sent to the domains listed. | 此插件代表你连接的服务。凭据仅保存在本机，且只发送到列出的域名。 | norm-covered · main.js:4924168 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Needs re-auth | 需要重新授权 | norm-covered · main.js:4927325 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add account | 添加账号 | norm-covered · main.js:4928934 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Paste the code shown after you sign in. | 粘贴登录后显示的代码。 | norm-covered · main.js:4933375 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Connect your account to browse | 连接账号以浏览 | norm-covered · main.js:4975791 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Authentication Required | 需要身份验证 | norm-covered · main.js:6858700 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sign in needed | 需要登录 | norm-covered · main.js:7316244 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sign-in required | 需要登录 | key:title · norm-covered · main.js:7323204 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enter authorization code... | 输入授权码... | key:placeholder · norm-covered · main.js:7328247 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Account connected. | 账号已连接。 | key:message · norm-covered · main.js:7394680 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This plugin requires authentication before the agent can use its tools. | 此插件需要先完成身份验证，智能体才能使用其工具。 | key:message · norm-covered · main.js:7394819 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Set up authentication | 设置身份验证 | key:label · norm-covered · main.js:7395131 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sign in required. | 需要登录。 | key:message · norm-covered · main.js:7397318 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Password Prompt Blocked | 密码输入提示已被阻止 | norm-covered · main.js:7546422 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Verification required | 需要验证 | key:title · norm-covered · main.js:7736557 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Please verify your account to continue using | 请验证你的账号以继续使用 | norm-covered · main.js:7736618 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Complete verification | 完成验证 | key:label · norm-covered · main.js:7736949 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Authentication expired | 身份验证已过期 | key:title · norm-covered · main.js:7737243 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | There was an unexpected issue setting up your account. | 设置账号时出现意外问题。 | norm-covered · main.js:7989884 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sorry, this account is ineligible to use | 抱歉，此账号不符合使用条件 | norm-covered · main.js:7990541 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | Please verify your account, then sign in again to continue. Learn more by visiting our | 请验证你的账号，然后重新登录以继续。详情请访问我们的 | main.js:7990707 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Connect an account so the agent can use this app. | 连接账号，以便智能体使用此应用。 | key:message · norm-covered · main.js:8097822 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | There was an error with your authentication. To log in, click | 身份验证出错。要登录，请点击 | key:message · norm-covered · main.js:8257011 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | To use the agent, please login | 请先登录以使用智能体 | key:message · norm-covered · main.js:8257222 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Log in to use the agent | 登录后才能使用智能体 | key:message · norm-covered · main.js:8257316 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Refreshed credentials for all automations. | 已刷新所有自动化的凭据。 | key:title · norm-covered · main.js:8257791 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to refresh credentials | 刷新凭据失败 | key:title · norm-covered · main.js:8257946 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Connect an account so the agent can run automations. | 连接账号，以便智能体运行自动化。 | key:message · norm-covered · main.js:8258678 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Refresh all credentials | 刷新所有凭据 | norm-covered · main.js:8260906 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What should the agent do on each run? For example: summarize new bugs assigned to me and anything that changed overnight. | 每次运行时智能体应该做什么？例如：汇总分配给我的新缺陷以及夜间发生的变化。 | key:placeholder · norm-covered · main.js:8653023 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | For example: every morning, summarize new bugs assigned to me and anything that changed overnight. | 例如：每天早上汇总分配给我的新缺陷以及夜间发生的变化。 | key:placeholder · norm-covered · main.js:8655482 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 设置（33 条：ACCEPT 33 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Toggle File Viewer | 切换文件查看器 | key:label · norm-covered · main.js:1862022 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Project Selector | 切换项目选择器 | key:label · norm-covered · main.js:1862119 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Environment Selector | 切换环境选择器 | key:label · norm-covered · main.js:1862225 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Maximize Side Panel | 最大化 / 还原侧边面板 | key:label · norm-covered · main.js:1862409 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to parse settings. Fix and restart. | 设置解析失败。请修复后重启。 | norm-covered · main.js:4416111 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | These settings can only be changed on the computer running the app, not from a remote session. | 这些设置只能在运行本应用的计算机上更改，无法从远程会话更改。 | norm-covered · main.js:4542776 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Feature Environment Override | 功能环境覆盖 | norm-covered · main.js:4631187 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Override feature environment | 覆盖功能环境 | key:label · norm-covered · main.js:4631269 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | For Antigravity Business consumption options, see | 有关 Antigravity Business 的用量方案，请参阅 | norm-covered · main.js:4682844 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Configure GitHub access policies. | 配置 GitHub 访问策略。 | key:description · norm-covered · main.js:4839207 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent Hooks Configuration | 智能体 Hooks 配置 | norm-covered · main.js:4894039 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search for MCP servers to add to your configuration | 搜索要添加到配置中的 MCP 服务器 | norm-covered · main.js:4904845 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Configure hooks that run on agent lifecycle events. | 配置在智能体生命周期事件上运行的 Hook。 | key:description · norm-covered · main.js:4906747 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select the workspace type that will be used for new conversations started with the New Workspace option. | 选择通过「新建工作区」发起新对话时使用的工作区类型。 | key:description · norm-covered · main.js:4912962 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove individual uploaded files or connected resources in Project Settings, or delete a project or conversation to remove its stored files. | 可在项目设置中移除单个上传文件或已连接资源，也可删除项目或对话以移除其存储的文件。 | key:description · norm-covered · main.js:4988035 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | A shell setup script run before every command the agent executes in this project. Overrides the global script. | 在此项目中，智能体执行每条命令前运行的 shell 初始化脚本。会覆盖全局脚本。 | key:description · norm-covered · main.js:5013230 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Settings Unavailable | 设置不可用 | key:title · norm-covered · main.js:5037899 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | When Turbo mode is on, the agent will automatically capture screenshots in the Browser without explicit user input. You can toggle this setting in Antigravity's settings. | 开启 Turbo 模式后，智能体无需用户明确输入即会自动在浏览器中截取屏幕截图。你可以在 Antigravity 设置中切换此选项。 | norm-covered · main.js:6454380 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select an option... | 选择一个选项... | norm-covered · main.js:6491271 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enter the configuration values this MCP server needs. Saving restarts the server with them. | 输入此 MCP 服务器所需的配置值。保存后会用这些值重启服务器。 | key:description · norm-covered · main.js:7399752 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Telemetry is disabled in Settings | 遥测已在设置中停用 | key:title · norm-covered · main.js:7619446 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable telemetry in Settings before changing per-conversation telemetry. | 请先在设置中启用遥测，再更改单个对话的遥测。 | key:message · norm-covered · main.js:7619490 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | (Optional) Tell us more or type your reason... | （可选）告诉我们更多，或输入你的原因... | key:placeholder · norm-covered · main.js:7714680 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use Global Settings | 使用全局设置 | norm-covered · main.js:7765061 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use theme to be imported with settings | 导入设置时同时使用主题 | key:label · norm-covered · main.js:8004519 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Config File Path | 复制配置文件路径 | key:label · norm-covered · main.js:8054857 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Terminal Panel | 切换终端面板 | norm-covered · main.js:8123539 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | (Optional, defaults to main) | （可选，默认为 main） | norm-covered · main.js:8331256 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open project settings | 打开项目设置 | key:label · norm-covered · main.js:8586568 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Notification Preferences | 通知偏好设置 | key:title · norm-covered · main.js:10369508 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Preferences | 打开偏好设置 | key:label · norm-covered · main.js:10369685 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle this on to enable read access on contents. | 开启此项以启用对内容的读取权限。 | norm-covered · main.js:10389425 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Thumbnails | 切换缩略图 | key:title · norm-covered · main.js:10786986 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 插件/技能/MCP/智能体（28 条：ACCEPT 28 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Delete All Remote Agents Data | 删除所有远程智能体数据 | key:label · norm-covered · main.js:4442810 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Set the volume of agent sounds. | 设置智能体提示音的音量。 | key:description · norm-covered · main.js:4683391 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | When enabled, the agent will include default customizations, including default skills. | 启用后，智能体会包含默认自定义项（含默认技能）。 | key:description · norm-covered · main.js:4905953 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Artifact Comments | 产物评论 | norm-covered · main.js:6411143 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Build with one agent or a team | 使用一个智能体或一个团队来构建 | key:title · norm-covered · main.js:6854656 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Comment on the plan before your agent starts, and get a walkthrough when it finishes. | 在智能体开始前对计划发表意见，完成后获得演练讲解。 | key:description · norm-covered · main.js:6854862 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Artifact updated by agent | 产物已由智能体更新 | norm-covered · main.js:7088622 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select text in the artifact to add a comment | 在产物中选择文本以添加评论 | norm-covered · main.js:7156737 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Artifacts like Google Docs, PDFs, Office documents (Word, Excel, PowerPoint), etc. Everything else the agent creates is under Artifacts. | 产物包括 Google 文档、PDF、Office 文档（Word、Excel、PowerPoint）等。智能体创建的其它内容都归在「产物」下。 | norm-covered · main.js:7229685 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stop All Subagents | 停止所有子智能体 | key:tooltip · norm-covered · main.js:7237744 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | User cancelled agent execution. | 用户已取消智能体执行。 | norm-covered · main.js:7272261 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Ask the agent to diagnose and fix this server | 让智能体诊断并修复此服务器 | key:tooltip · norm-covered · main.js:7322881 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Fix with Agent | 使用智能体修复 | norm-covered · main.js:7323031 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Plugin update required | 需要更新插件 | key:label · norm-covered · main.js:7343449 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Managed by plugin | 由插件管理 | norm-covered · main.js:7372046 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Install this plugin to see the commands it adds, along with its skills, agents and MCP servers. | 安装此插件即可查看它添加的命令，以及技能、智能体和 MCP 服务器。 | norm-covered · main.js:7399416 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Search connectors | 搜索连接器 | key:placeholder · norm-covered · main.js:7719673 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Browse Connectors | 浏览连接器 | norm-covered · main.js:7721580 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sends after agent finishes working | 在智能体完成工作后发送 | norm-covered · main.js:7898282 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Plugins are packaged collections of skills and MCPs to help the Agent | 插件是技能与 MCP 的打包集合，用于协助智能体 | norm-covered · main.js:7998546 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | This skill came from the marketplace, so you can add it again whenever you need it. | 此技能来自市场，需要时可随时重新添加。 | norm-covered · main.js:8040454 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Enable Recommended Skills | 启用推荐技能 | norm-covered · main.js:8042134 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | More Plugins | 更多插件 | key:displayName · norm-covered · main.js:8082895 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Subagent ended | 子智能体已结束 | key:text · norm-covered · main.js:8450468 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What should the agent do on each run? | 每次运行时智能体应该做什么？ | key:placeholder · norm-covered · main.js:8590055 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Get notified when the agent needs your attention or completes a task. | 智能体需要你关注或完成任务时接收通知。 | key:message · norm-covered · main.js:10374891 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent can | 智能体可以 | norm-covered · main.js:10384614 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent can run | 智能体可以运行 | norm-covered · main.js:10385777 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 错误/失败提示（25 条：ACCEPT 25 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Failed to read file | 读取文件失败 | key:message · norm-covered · main.js:3276456 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Something went wrong! | 出错了！ | norm-covered · main.js:3499972 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | An error was thrown. | 抛出了错误。 | norm-covered · main.js:4253372 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Couldn't delete your data. Try again. | 无法删除你的数据，请重试。 | norm-covered · main.js:4443782 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | An error occurred while submitting your feedback. Please try again. | 提交反馈时出错，请重试。 | key:message · norm-covered · main.js:4673745 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No project selected or project management not available. | 未选择项目，或项目管理不可用。 | norm-covered · main.js:5011012 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to create terminal | 创建终端失败 | key:title · norm-covered · main.js:5636428 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Too many requests, please try again in a bit! | 请求过多，请稍后重试！ | key:message · norm-covered · main.js:5851053 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Error while editing notebook | 编辑笔记本时出错 | norm-covered · main.js:6372537 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Error while reading notebook | 读取笔记本时出错 | norm-covered · main.js:6372761 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Too many environments running | 运行中的环境过多 | key:title · norm-covered · main.js:6558789 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Custom agents are not available in Best of N mode. | Best of N 模式下无法使用自定义智能体。 | key:title · norm-covered · main.js:6572583 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to start Best of N mode | 启动 Best of N 模式失败 | key:title · norm-covered · main.js:6574324 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Task not found | 找不到任务 | norm-covered · main.js:7256395 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to create remote project | 创建远程项目失败 | key:title · norm-covered · main.js:7662242 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to stop agent | 停止智能体失败 | key:title · norm-covered · main.js:7706923 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Too many surveys | 调查过多 | key:label · norm-covered · main.js:7711344 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Your session has expired. Please log back in to continue. | 你的会话已过期。请重新登录以继续。 | key:message · norm-covered · main.js:7737276 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Agent terminated due to error | 智能体因错误而终止 | key:title · norm-covered · main.js:7737458 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to create worktree | 创建工作树失败 | key:title · norm-covered · main.js:7771685 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | It was already sent or couldn't be removed from the queue. | 它已发送，或无法从队列中移除。 | key:message · norm-covered · main.js:7927206 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Invalid Media | 媒体文件无效 | key:title · norm-covered · main.js:7937118 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No internet. Agent features may not work. | 无网络连接。智能体功能可能无法使用。 | norm-covered · main.js:8545239 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Sidecar feature is not available. | Sidecar 功能不可用。 | norm-covered · main.js:8613382 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | " not found. | " 未找到。 | norm-covered · main.js:8613617 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 状态/进度提示（19 条：ACCEPT 19 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Loading media... | 正在加载媒体... | norm-covered · main.js:3035292 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading licenses... | 正在加载许可... | norm-covered · main.js:4438379 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading workspace customizations... | 正在加载工作区自定义项... | norm-covered · main.js:4756946 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading hooks... | 正在加载 Hooks... | norm-covered · main.js:4893666 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Installing | 正在安装 | norm-covered · main.js:4899920 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading resources... | 正在加载资源... | norm-covered · main.js:4975612 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Waiting for user input | 等待用户输入 | norm-covered · main.js:6365934 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Rendering playback | 正在渲染回放 | norm-covered · main.js:6444814 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading logs... | 正在加载日志... | norm-covered · main.js:7359706 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stream and control | 串流与控制 | norm-covered · main.js:7366534 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading events... | 正在加载事件... | norm-covered · main.js:7370389 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Creating terminal... | 正在创建终端... | norm-covered · main.js:7557212 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading worktrees... | 正在加载工作树... | norm-covered · main.js:7796613 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Finalizing transcription... | 正在完成转写... | norm-covered · main.js:7874899 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading customizations... | 正在加载自定义项... | norm-covered · main.js:8052121 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading available plugins... | 正在加载可用插件... | norm-covered · main.js:8093239 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading apps... | 正在加载应用... | key:label · norm-covered · main.js:8101961 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading Notebook View... | 正在加载笔记本视图... | norm-covered · main.js:8433811 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Loading subagent... | 正在加载子智能体... | key:text · norm-covered · main.js:8450340 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 空状态（15 条：ACCEPT 15 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | No matching project folders. Apply to use the custom URI. | 没有匹配的项目文件夹。应用以使用自定义 URI。 | norm-covered · main.js:4659423 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Nothing is running right now | 当前没有正在运行的内容 | norm-covered · main.js:4703558 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No keyboard shortcuts found matching your filter. | 没有符合筛选条件的键盘快捷键。 | norm-covered · main.js:4729308 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Try out early-stage features before they ship. These may be changed or removed at any time. These features are experimental, and we make no guarantees about performance or functionality. | 提前体验尚未正式发布的功能。这些功能随时可能变更或移除，属于实验性质，我们不对性能或功能作任何保证。 | key:subtitle · norm-covered · main.js:4858403 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Nothing said yet | 还没有内容 | norm-covered · main.js:5106026 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No content available for this resource | 此资源没有可用内容 | norm-covered · main.js:6651313 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No workspaces open. | 没有打开的工作区。 | norm-covered · main.js:7200747 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No active terminals. Click + to create one. | 没有活动终端。点击 + 新建一个。 | norm-covered · main.js:7557019 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No plugins available. | 没有可用插件。 | key:message · norm-covered · main.js:7998922 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No customizations match your search. | 没有符合搜索条件的自定义项。 | norm-covered · main.js:8053860 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No repositories found. Type to enter a custom path. | 找不到仓库。可输入自定义路径。 | norm-covered · main.js:8344020 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No instructions. | 暂无指令。 | norm-covered · main.js:8588383 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No events recorded. | 没有记录到事件。 | norm-covered · main.js:8607559 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | No instances yet. | 还没有实例。 | norm-covered · main.js:10779542 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Keeps working in this folder. Nothing is copied. | 继续在此文件夹中工作，不复制任何内容。 | key:tooltip · norm-covered · main.js:11113900 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 向导/引导（10 条：ACCEPT 10 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Complete Onboarding Step | 完成引导步骤 | key:label · norm-covered · main.js:1865296 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose the experience that fits how you work. | 选择适合你工作方式的体验。 | key:description · norm-covered · main.js:4730177 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Yes, I'd like to receive product updates, tips, and promotions from Google | 是的，我希望接收 Google 的产品更新、技巧和促销信息 | norm-covered · main.js:6852813 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Getting started with Google Antigravity | 开始使用 Google Antigravity | key:title · norm-covered · main.js:6855851 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Here's how you and your agents work together | 下面介绍你与智能体如何协同工作 | norm-covered · main.js:6856087 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | We'll tailor the experience to you. | 我们会为你量身定制体验。 | norm-covered · main.js:8002714 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Welcome to your Chief of Staff | 欢迎使用 Chief of Staff | norm-covered · main.js:8262540 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Pick a suggestion below to get started, or ask me anything. | 选择下方建议开始，或随便问我点什么。 | norm-covered · main.js:8262647 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Announcements and tips | 公告与提示 | key:label · norm-covered · main.js:8321121 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset Onboarding | 重置引导流程 | norm-covered · main.js:10359558 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 快捷键（8 条：ACCEPT 8 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Enter to Send | 按 Enter 发送 | key:label · norm-covered · main.js:4606526 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Press keys... | 请按键... | norm-covered · main.js:4714741 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Edit Shortcut | 编辑快捷键 | key:label · norm-covered · main.js:4716887 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add Shortcut | 添加快捷键 | key:label · norm-covered · main.js:4716985 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove Shortcut | 移除快捷键 | key:label · norm-covered · main.js:4717087 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Describe what you want. Your agent plans and builds it, and brings in other agents when needed. | 描述你想要什么。智能体会规划并构建，需要时还会引入其他智能体。 | key:description · norm-covered · main.js:6854701 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use Regular Expression (.*) | 使用正则表达式 (.*) | norm-covered · main.js:7575729 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | What best describes you? | 哪项最符合你的情况？ | norm-covered · main.js:8002617 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

### 通知（1 条：ACCEPT 1 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Dismiss service announcement | 关闭服务公告 | key:title · norm-covered · main.js:8207478 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |

