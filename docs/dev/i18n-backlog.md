# i18n 渐进补录清单（自动预筛）

> 由 `node scripts/auto-review.js --write-docs` 生成；`--out <path>` 可导出任意结构化 JSON，同源数据见 `docs/dev/i18n-backlog.json`。
> 数据源：`frontend-bundle.json` 的 `uncovered[]` 减去活体 L 集合（`crosscheck-sets.json` 的 `exact.F_minus_L`）。
> 生成时间：2026-11-08T05:55:11.576Z；共 651 条，分 16 类。

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
| `ACCEPT`（自动放行，人工过一眼） | 471 |
| `REJECT`（自动排除） | 1 |
| `REVIEW`（需人工裁决，重点） | 179 |
| 自动消化量 | 472 |

> 人工**深度裁决**从 651 条降到 179 条；`ACCEPT` 不是零成本，仍需抽检译文，但不再需要判断「该不该翻」。

## 勾完怎么走 add-terms

1. 只把 `state` 为 `ACCEPT`（含从 `REVIEW` 改过来的）且 `checked: true` 的条目整理成 `draft.txt`，一行一条 `英文原文 = 译文`。
2. `npm run add-terms draft.txt -- --dry-run` 预览；确认没有 redundant / skipped 异常后 `npm run add-terms draft.txt` 正式写入。
3. `npm test`（以 `package.json` 的 `test` 脚本为准）→ `npm run sync` 推送到已安装客户端，1~2 秒热载生效。
4. 回写本清单：把已入库条目的 `checked` 保持 `true`，在 `reasons` 末尾追加「已入库 vX.Y」；下一轮重跑 `auto-review.js` 时以新 findings 为基准重建。

**硬边界**：`auto-review.js` 绝不自动写 `src/cockpit-zh.json`；哪些该翻最终由人决定，脚本只减少逐条判断量。

## 分类明细

### 其它 UI 文案（107 条：ACCEPT 75 / REJECT 1 / REVIEW 31）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Changes | 更改 | key:title · main.js:1436952 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Reject Step | 拒绝此步骤 | key:label · norm-covered · main.js:1861257 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Start Voice Recording | 开始录音 | key:label · norm-covered · main.js:1861507 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Stop Voice Recording | 停止录音 | key:label · norm-covered · main.js:1861593 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mute Voice Mic | 静音麦克风 | key:label · norm-covered · main.js:1861768 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Mute Voice Speaker | 静音扬声器 | key:label · norm-covered · main.js:1861855 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restart Main Language Server | 重启主语言服务器 | key:label · norm-covered · main.js:1867213 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Zoom | 缩放 | key:label · weak:zoom · norm-covered · menuOnly · main.js:2983065 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Zoom in (+) | 放大 (+) | key:label · main.js:2983840 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REJECT` | Sample GDoc | 示例 Google 文档 | main.js:3406956 | 示例数据（国家名 / 模型名 / 示例仓库名），不是固定 UI 文案 |
|   | `REVIEW` | Taking longer than usual to load | 加载时间比平常长 | main.js:3409763 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Cut | 剪切 | key:label · norm-covered · menuOnly · main.js:3480841 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Paste | 粘贴 | key:label · norm-covered · menuOnly · main.js:3481185 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | Valid until | 有效期至 | main.js:4328671 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Reload | 重新加载 | key:title · norm-covered · menuOnly · main.js:4344160 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | Choose Region | 选择区域 | main.js:4428083 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Device Name | 设备名称 | key:label · main.js:4543329 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Validate | 验证 | main.js:4591491 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Setup script ran successfully. | 初始化脚本运行成功。 | main.js:4592149 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Screen Reader Mode | 屏幕阅读器模式 | key:label · norm-covered · main.js:4611127 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | Console Telemetry | 控制台遥测 | main.js:4623972 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Print telemetry to the console | 将遥测输出到控制台 | key:label · main.js:4624043 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | When enabled, the values below replace the auto-detected OS, host, and user type used for feature gating. | 启用后，下面的值将替代用于功能开关的自动检测操作系统、主机和用户类型。 | key:description · main.js:4631312 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Operating System | 操作系统 | key:label · main.js:4631528 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Host Environment | 主机环境 | key:label · main.js:4631808 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | User Type | 用户类型 | key:label · main.js:4632163 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | What is missing in your workflow | 你的工作流中缺少什么 | main.js:4663587 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | How this feature would help you and other users | 此功能会如何帮助你和其他用户 | main.js:4663742 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Whether it never connects or is intermittent/flaky | 是始终无法连接，还是时好时坏 | main.js:4664743 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Did restarting the desktop app help? | 重启桌面应用是否有帮助？ | main.js:4664823 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Ask questions, report issues, and discuss features | 提问、反馈问题、讨论功能 | main.js:4667908 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Input device for voice mode and dictation. | 语音模式和听写所用的输入设备。 | key:description · norm-covered · main.js:4778989 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Only stored on your machine. | 仅保存在你的设备上。 | key:description · main.js:4779786 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | All tools (*) | 所有工具 (*) | key:label · main.js:4881653 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Hook will trigger if any tool is executed. | 执行任意工具时都会触发此 Hook。 | key:description · main.js:4881681 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Paste code | 粘贴代码 | key:placeholder · main.js:4933826 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Stored and mounted in your cloud environment | 存储并挂载在你的云环境中 | key:title · main.js:4987526 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Amend succeeded | 修订提交成功 | key:title · main.js:5539666 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Inline Widget | 内联微件 | key:title · main.js:6333985 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Create | 创建 | main.js:6387838 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Undo to Here | 撤销到此处 | key:label · main.js:6426410 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Capture Console Logs | 捕获控制台日志 | key:title · main.js:6441076 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Daily environment time used | 今日环境使用时长已用尽 | key:title · main.js:6558691 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Click to learn more about sources | 点击了解有关来源的更多信息 | key:content · main.js:6625893 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Show more | 显示更多 | shape:Show(14) · main.js:6628824 | 与已有 dict 同形：前缀 `Show` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Send command input? | 发送命令输入？ | key:promptText · main.js:6689027 | bundle 中带强 UI 键名 `promptText`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Pricing is based on public API pricing | 定价基于公开 API 价格 | main.js:6716295 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | (Specific to this client's truncation and pagination) | （特定于此客户端的截断与分页） | main.js:6729647 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Run Now | 立即运行 | shape:Run(9) · main.js:6743426 | 与已有 dict 同形：前缀 `Run` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Terms of Service & Data Use | 服务条款与数据使用 | main.js:6849860 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Set the rules, define the boundaries. | 设定规则，划定边界。 | key:title · main.js:6854970 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Get started | 开始使用 | main.js:6857477 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Manifest Changes | 清单更改 | key:label · norm-covered · main.js:7172419 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Could not load | 无法加载 | shape:Could not(2) · main.js:7199911 | 与已有 dict 同形：前缀 `Could not` 在词典中有 2 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | No | 否 | key:writeInLabel · main.js:7320038 | bundle 中带强 UI 键名 `writeInLabel`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Needs reconnect | 需要重新连接 | main.js:7338118 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | App update required | 需要更新应用 | key:label · main.js:7343343 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Host Endpoint | 主机端点 | main.js:7369607 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Previous match | 上一个匹配项 | key:title · main.js:7577251 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Reload Window | 重新加载窗口 | norm-covered · main.js:7606099 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Restore | 恢复 | key:label · norm-covered · main.js:7624784 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | More cloud environments | 更多云环境 | key:title · main.js:7655814 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Instructions and tools | 指令与工具 | key:label · main.js:7694513 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Don't show this for 2 days | 2 天内不再显示 | key:label · main.js:7714816 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | See Plans | 查看方案 | key:label · main.js:7740092 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Snooze for 24 Hours | 延后 24 小时 | main.js:7753588 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Text attachment | 文本附件 | key:text · main.js:7835366 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Switch mic | 切换麦克风 | main.js:7849148 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Chief of Staff voice mode is active | Chief of Staff 语音模式已启用 | key:title · main.js:7872444 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Send Now | 立即发送 | key:tooltip · norm-covered · main.js:7897168 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The full developer experience with code and tooling. | 包含代码与工具的完整开发体验。 | key:description · main.js:7962244 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Learn more by visiting our | 详情请访问我们的 | main.js:7992367 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Build with Google | 使用 Google 构建 | shape:Build With(3) · main.js:7998425 | 与已有 dict 同形：前缀 `Build With` 在词典中有 3 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Debug and fix | 调试并修复 | key:title · main.js:8000299 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Automatically reproduce bugs, trace causes, test fixes. | 自动复现缺陷、追踪原因、验证修复。 | key:description · main.js:8000327 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Draft documents, emails, and notes that sound like you. | 起草符合你语气风格的文档、邮件和笔记。 | key:description · main.js:8000578 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Runs remotely | 远程运行 | key:label · main.js:8033327 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Runs on this computer | 在此计算机上运行 | key:label · main.js:8035493 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | See more results | 查看更多结果 | key:label · main.js:8090621 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Switch Roles | 切换角色 | key:title · main.js:8209109 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Show details | 显示详情 | shape:Show(14) · main.js:8271787 | 与已有 dict 同形：前缀 `Show` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Show or Hide Extensions | 显示或隐藏扩展 | shape:Show(14) · main.js:8324943 | 与已有 dict 同形：前缀 `Show` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Mount Directory | 挂载目录 | main.js:8330571 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Use Existing | 使用现有项 | main.js:8347849 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Sent to Chief of Staff | 已发送给 Chief of Staff | key:title · main.js:8504797 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Chief of Staff voice mode stopped | Chief of Staff 语音模式已停止 | key:title · main.js:8505229 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Repeat every | 重复间隔 | main.js:8571573 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Change schedule | 更改计划 | key:label · main.js:8586413 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | All runs | 所有运行记录 | main.js:8590827 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Last run | 上次运行 | main.js:8622875 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | What should it do? | 它应该做什么？ | key:label · main.js:8655449 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | For example: Morning bug summary | 例如：晨间缺陷汇总 | key:placeholder · main.js:8655705 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Where should it run? | 它应该在哪里运行？ | main.js:8655887 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | When should it run? | 它应该何时运行？ | main.js:8657076 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | A new version is available. | 有新版本可用。 | main.js:10365708 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Start it again. | 重新启动它。 | main.js:10366094 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Reload this window. | 重新加载此窗口。 | main.js:10366139 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Unrecognized Unicode character " | 无法识别的 Unicode 字符 " | key:errorMsg · main.js:10726145 | bundle 中带强 UI 键名 `errorMsg`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Fit Mode | 适应模式 | key:label · weak:fitMode · main.js:10793998 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Target text in PDF... | 在 PDF 中定位文本... | key:placeholder · main.js:10932934 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Include unstaged changes | 包含未暂存的更改 | key:label · main.js:11182111 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | The change was pushed to Gerrit. | 更改已推送到 Gerrit。 | key:message · main.js:11185921 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Push succeeded | 推送成功 | key:title · main.js:11186072 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Unstage change | 取消暂存更改 | key:tooltip · main.js:11186743 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Stage change | 暂存更改 | key:tooltip · main.js:11186946 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Discard | 丢弃 | key:label · main.js:11187096 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Discard unstaged changes | 丢弃未暂存的更改 | key:tooltip · main.js:11187126 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |

### 菜单/操作（88 条：ACCEPT 71 / REJECT 0 / REVIEW 17）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Equalize Split Panes | 均分拆分窗格 | key:label · norm-covered · main.js:1863298 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Command Palette | 打开命令面板 | key:label · main.js:1863806 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Quote Selection | 引用所选内容 | key:label · main.js:1864345 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Comment on Selection | 对所选内容添加评论 | key:label · norm-covered · main.js:1864525 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Go Back in Pane | 在窗格中后退 | key:label · norm-covered · main.js:1865108 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Go Forward in Pane | 在窗格中前进 | key:label · norm-covered · main.js:1865195 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Select All | 全选 | key:label · norm-covered · menuOnly · main.js:1868397 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Cancel Generation | 取消生成 | key:label · norm-covered · main.js:1868519 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Aborted due to condition callback returning false. | 因条件回调返回 false 而中止。 | key:message · main.js:1903370 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Move to New Group | 移动到新分组 | key:label · norm-covered · main.js:1931211 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove from Group | 从分组中移除 | key:label · norm-covered · main.js:1931306 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Trajectory Debug View | 打开轨迹调试视图 | key:label · norm-covered · main.js:1931402 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Copy Trajectory ID | 复制轨迹 ID | key:label · norm-covered · main.js:1931596 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Clear | 清除 | key:tooltip · main.js:2735764 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open in Side Panel | 在侧边面板中打开 | key:label · main.js:3120365 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Remove from list | 从列表中移除 | key:title · main.js:4342653 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy Image Address | 复制图片地址 | key:label · main.js:4398870 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select License | 选择许可 | shape:Select(9) · main.js:4428749 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Delete All Data | 删除所有数据 | shape:Delete(20) · main.js:4443158 | 与已有 dict 同形：前缀 `Delete` 在词典中有 20 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Select | 选择 | weak:name · main.js:4569222 | 只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | What you would like to see to address this gap in your workflow | 你希望看到什么来弥补工作流中的这一缺口 | main.js:4663649 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Attaching logs requires an email address | 附加日志需要填写邮箱地址 | main.js:4672178 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Thank you! Your feedback has been submitted successfully. | 谢谢！你的反馈已成功提交。 | key:message · main.js:4673434 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Running processes are killed. This cannot be undone. | 正在运行的进程将被终止。此操作无法撤销。 | main.js:4704227 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Stop Editing | 停止编辑 | key:tooltip · main.js:4714818 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Reset to Default | 恢复默认 | key:label · norm-covered · main.js:4717216 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Reset All to Defaults | 全部恢复默认 | key:tooltip · norm-covered · main.js:4728840 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Save audio recordings | 保存录音 | key:label · main.js:4779750 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Delete all recordings? | 删除所有录音？ | key:title · main.js:4781183 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | + Add Hook | + 添加 Hook | main.js:4894143 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Filter resources... | 筛选资源... | key:placeholder · main.js:4979030 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Manage and delete your data anytime | 随时管理和删除你的数据 | key:title · main.js:4987984 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy as Markdown | 复制为 Markdown | shape:Copy(18) · main.js:5844222 | 与已有 dict 同形：前缀 `Copy` 在词典中有 18 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Confirmation required to execute this step | 执行此步骤需要确认 | main.js:6436750 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Playback available | 可回放 | main.js:6445175 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Cancel Step | 取消此步骤 | main.js:6455390 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Copy command | 复制命令 | key:title · main.js:6503234 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | [Dev Mode] View full search results | [开发模式] 查看完整搜索结果 | main.js:6632085 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；含代码/控制字符，疑似模板或拼接产物；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `ACCEPT` | Open in side pane | 在侧边窗格中打开 | key:tooltip · main.js:6649702 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open extracted DOM in editor | 在编辑器中打开提取的 DOM | shape:Open(21) · main.js:6674089 | 与已有 dict 同形：前缀 `Open` 在词典中有 21 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | View network requests | 查看网络请求 | shape:View(7) · main.js:6675443 | 与已有 dict 同形：前缀 `View` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | View network request | 查看网络请求 | shape:View(7) · main.js:6676505 | 与已有 dict 同形：前缀 `View` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Click to view more | 点击查看更多 | main.js:6718255 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | View Logs | 查看日志 | shape:View(7) · main.js:6743735 | 与已有 dict 同形：前缀 `View` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Search for commands... | 搜索命令... | key:placeholder · main.js:6833467 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open in New Window | 在新窗口中打开 | key:tooltip · main.js:7105596 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Drag to select a region to comment | 拖动选择要评论的区域 | main.js:7116187 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | View could not be opened | 无法打开该视图 | shape:View(7) · main.js:7152380 | 与已有 dict 同形：前缀 `View` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Submit comment | 提交评论 | main.js:7155504 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Cancel All Tasks | 取消所有任务 | key:tooltip · main.js:7222119 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Cancel Task | 取消任务 | key:content · main.js:7224026 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Side Pane UI Available | 侧边窗格界面可用 | main.js:7366429 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Open in Side Pane | 在侧边窗格中打开 | shape:Open in(5) · main.js:7366762 | 与已有 dict 同形：前缀 `Open in` 在词典中有 5 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | UI view does not exist. | 该界面视图不存在。 | main.js:7560261 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Next match | 下一个匹配项 | key:title · main.js:7577766 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Send Feedback | 发送反馈 | shape:Send(7) · main.js:7606004 | 与已有 dict 同形：前缀 `Send` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | View Debug | 查看调试信息 | key:label · main.js:7625424 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Drag to resize, double-click to reset | 拖动调整大小，双击重置 | key:title · main.js:7701543 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy debug info | 复制调试信息 | key:label · main.js:7735224 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Research, writing, and everyday tasks, without code. | 研究、写作与日常任务，无需代码。 | key:description · main.js:7962351 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Continue with Google | 使用 Google 继续 | key:title · main.js:7964139 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Continue with Google Cloud | 使用 Google Cloud 继续 | key:title · main.js:7964172 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Hand off a feature and come back to working code. | 交出一项功能，回来时已是可用代码。 | key:description · main.js:8000212 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Research anything | 研究任何主题 | key:title · main.js:8000426 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Ask about your code or any topic, get clear answers. | 询问你的代码或任何主题，获得清晰的解答。 | key:description · main.js:8000458 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Write and edit docs | 撰写和编辑文档 | key:title · main.js:8000544 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Add All | 全部添加 | shape:Add(15) · main.js:8024447 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | This cannot be undone. | 此操作无法撤销。 | main.js:8040917 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Open in Hub | 在 Hub 中打开 | shape:Open in(5) · main.js:8184348 | 与已有 dict 同形：前缀 `Open in` 在词典中有 5 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Open in Antigravity IDE | 在 Antigravity IDE 中打开 | shape:Open in(5) · main.js:8194795 | 与已有 dict 同形：前缀 `Open in` 在词典中有 5 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Trajectory Debug View | 轨迹调试视图 | key:tooltip · main.js:8199451 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open side-by-side view | 打开并排视图 | key:title · main.js:8226239 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Address CLs needing attention | 处理需要关注的 CL | key:title · main.js:8261418 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Click to Open Docs | 点击打开文档 | main.js:8315522 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Show in Sidebar | 在侧边栏中显示 | shape:Show in(6) · main.js:8325242 | 与已有 dict 同形：前缀 `Show in` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Rename Group | 重命名分组 | key:renameLabel · main.js:8370074 | bundle 中带强 UI 键名 `renameLabel`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Close Panel | 关闭面板 | main.js:8411424 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Next run | 下次运行 | shape:Next(6) · main.js:8565467 | 与已有 dict 同形：前缀 `Next` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Add filter | 添加筛选条件 | shape:Add(15) · main.js:8598141 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Your changes were not saved. Please try again. | 你的更改未保存，请重试。 | key:message · main.js:8611577 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Reset State | 重置状态 | key:title · main.js:10359265 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Delete Data Directory | 删除数据目录 | shape:Delete(20) · main.js:10359763 | 与已有 dict 同形：前缀 `Delete` 在词典中有 20 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Go to the machine you are controlling and quit Antigravity. It installs pending updates the next time it starts. | 前往你正在控制的计算机并退出 Antigravity。下次启动时会安装待处理的更新。 | shape:Go to(2) · main.js:10365951 | 与已有 dict 同形：前缀 `Go to` 在词典中有 2 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Reset to preset | 恢复为预设 | key:content · main.js:10447847 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Search | 打开搜索 | key:title · main.js:10962436 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open a pull request | 发起拉取请求 | key:linkLabel · main.js:11185606 | bundle 中带强 UI 键名 `linkLabel`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open a merge request | 发起合并请求 | key:linkLabel · main.js:11185738 | bundle 中带强 UI 键名 `linkLabel`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open the change | 打开此更改 | key:linkLabel · main.js:11185966 | bundle 中带强 UI 键名 `linkLabel`：确定是 label/title/description 一类固定文案 |

### 对话/消息（82 条：ACCEPT 64 / REJECT 0 / REVIEW 18）

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
|   | `ACCEPT` | Rename This Conversation | 重命名此对话 | key:label · main.js:1931123 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy Conversation ID | 复制对话 ID | key:label · norm-covered · main.js:1931502 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove from history (Shift+Delete) | 从历史记录中移除（Shift+Delete） | key:title · main.js:3486205 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Chat Width | 对话宽度 | key:title · norm-covered · main.js:4603775 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Chat Input | 对话输入框 | key:title · main.js:4604106 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Send messages with the keyboard's Enter key instead of starting a new line. | 使用键盘的 Enter 键发送消息，而不是换行。 | key:description · main.js:4606554 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Conversation Steps | 对话步骤 | key:label · norm-covered · main.js:4610674 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose how much detail is shown during a conversation. | 选择对话过程中显示的详细程度。 | key:description · norm-covered · main.js:4610707 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Background tasks and terminals agents left running, across all conversations. | 所有对话中由智能体遗留运行的后台任务与终端。 | key:description · main.js:4702165 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Conversation in New Tab | 在新标签页中打开对话 | key:label · main.js:4723066 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browsing History | 浏览历史 | key:label · main.js:4856076 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Which workspace the New Conversation button and keyboard shortcut start you in. | 「新建对话」按钮和快捷键会在哪个工作区中开始。 | key:description · main.js:4857559 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to revert conversation | 无法还原对话 | key:title · main.js:5450906 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Creating projects for your conversations | 正在为你的对话创建项目 | main.js:5546247 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | This conversation is not on disk. Delete it to remove it from your sidebar. | 此对话未保存在磁盘上。删除它即可从侧边栏移除。 | key:message · main.js:5564109 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | The conversation was compacted to fit within the context window. | 对话已压缩，以适应上下文窗口。 | main.js:6362895 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | The conversation was compacted while generating this response. | 生成此回复时对话已被压缩。 | key:text · main.js:6362996 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Cancel Sending Message | 取消发送消息 | key:tooltip · main.js:6379829 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy Message | 复制消息 | key:label · main.js:6426261 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to send side question | 发送支线问题失败 | key:title · main.js:6564067 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to start side question | 启动支线问题失败 | key:title · main.js:6564506 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Conversation Unarchived | 对话已取消归档 | key:title · main.js:6587151 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to rename conversation | 重命名对话失败 | key:title · main.js:6588052 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to delete conversation | 删除对话失败 | key:title · main.js:6588385 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to stop conversation | 停止对话失败 | key:title · main.js:6588952 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to start conversation | 启动对话失败 | key:title · main.js:6591391 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Fork in Shared Workspace | 在共享工作区中派生 | key:label · main.js:6704395 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Fork in New Workspace | 在新工作区中派生 | key:label · main.js:6704450 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to fork conversation | 派生对话失败 | key:title · main.js:6707158 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Disk is full. Search will no longer match in conversation bodies until you clear up space and restart. | 磁盘已满。清理空间并重启之前，搜索将不再匹配对话正文。 | main.js:6825729 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Only Unread | 仅未读 | main.js:6829002 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Only Archived | 仅已归档 | main.js:6829177 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Search for conversations... | 搜索对话... | key:placeholder · main.js:6836410 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Couldn't mark conversations as read | 无法将对话标记为已读 | key:title · main.js:6846817 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Conversation unavailable | 对话不可用 | key:title · norm-covered · main.js:6862369 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | The conversation could not be loaded because its data was not found. | 无法加载该对话，因为找不到其数据。 | key:message · norm-covered · main.js:6862404 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | This conversation grew too large, so the history before this point may be missing or incomplete. | 此对话变得过长，此前的历史记录可能缺失或不完整。 | main.js:7285705 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Rename Conversation | 重命名对话 | key:title · main.js:7613208 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Fork | 派生 | key:label · main.js:7625659 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Restore Conversation | 恢复对话 | key:content · main.js:7641871 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | This prompt is straightforward and does not need alternative comparisons. | 此提示很直接，无需进行备选对比。 | key:title · main.js:7711443 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | I prefer an immediate single response to prioritize productivity right now. | 我现在更希望立即得到单一回复，以优先保证效率。 | key:title · main.js:7711657 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Tip: Complex tasks get better results with multiple responses. | 提示：复杂任务使用多个回复效果更好。 | main.js:7715103 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | This conversation is also open in another app. Sending messages from both may cause conflicts. | 此对话也在另一个应用中打开。两边同时发送消息可能产生冲突。 | key:message · main.js:7731961 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Sending transcribed message... | 正在发送转写后的消息... | main.js:7876124 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `REVIEW` | Number of responses | 回复数量 | main.js:7881423 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Trigger multiple response variants from the same prompt. | 从同一提示触发多个回复变体。 | main.js:7882693 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Couldn't edit queued message | 无法编辑排队中的消息 | key:title · main.js:7927167 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Chat anyways | 仍然开始对话 | main.js:7941546 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Failed to load shared conversation | 加载共享对话失败 | shape:Failed to(6) · main.js:8104850 | 与已有 dict 同形：前缀 `Failed to` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Importing shared conversation... | 正在导入共享对话... | main.js:8105335 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `ACCEPT` | View archived in the sidebar | 在侧边栏中查看归档 | shape:View archived(2) · main.js:8114499 | 与已有 dict 同形：前缀 `View archived` 在词典中有 2 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Error: Artifacts from remote conversations are not available here. | 错误：此处无法查看远程对话的产物。 | main.js:8213671 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Check pending conversations in the last 3 days that require action from me. | 检查最近 3 天内需要我处理的待办对话。 | weak:prompt · main.js:8261320 | 只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案 |
|   | `REVIEW` | Check CLs that require my attention and fix them in their respective conversations. | 检查需要我关注的 CL，并在各自的对话中修复它们。 | weak:prompt · main.js:8261457 | 只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案 |
|   | `REVIEW` | Learn from my conversation history to write a personalized set of rules for future agentic interactions. | 从我的对话历史中学习，为今后的智能体交互编写一套个性化规则。 | weak:prompt · main.js:8261608 | 只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Use my conversation history to tell me which skills and plugins would be helpful for me. | 利用我的对话历史，告诉我哪些技能和插件对我有帮助。 | weak:prompt · main.js:8261784 | 只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Conversation copied as Markdown to clipboard | 对话已作为 Markdown 复制到剪贴板 | key:title · main.js:8265145 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Close split view and go to forked conversation | 关闭拆分视图并前往派生对话 | key:title · main.js:8306043 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Loading conversations... | 正在加载对话... | shape:Loading(6) · main.js:8326346 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Show temporary and forked workspaces | 显示临时和派生工作区 | shape:Show(14) · main.js:8358236 | 与已有 dict 同形：前缀 `Show` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Ask a side question without interrupting the main conversation | 提出支线问题，不打断主对话 | main.js:8453729 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Stop Side Question | 停止支线问题 | shape:Stop(5) · main.js:8455338 | 与已有 dict 同形：前缀 `Stop` 在词典中有 5 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Chief of Staff voice message failed | Chief of Staff 语音消息发送失败 | key:title · main.js:8504918 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Prompt to run when triggered... | 触发时运行的提示... | key:placeholder · main.js:8603085 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here. | 按计划运行提示，例如每天早上汇总昨天的变更。运行记录会显示在这里。 | shape:Run(9) · main.js:8663936 | 与已有 dict 同形：前缀 `Run` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Fork conversation in this folder | 在此文件夹中派生对话 | key:label · main.js:11113857 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Rewinds the conversation only. Files in this folder stay as they are now. | 仅回退对话。此文件夹中的文件保持当前状态。 | key:historicalTooltip · main.js:11113969 | bundle 中带强 UI 键名 `historicalTooltip`：确定是 label/title/description 一类固定文案 |

### 项目/工作区/文件/终端（64 条：ACCEPT 54 / REJECT 0 / REVIEW 10）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Open Workspace Selector | 打开工作区选择器 | key:label · norm-covered · main.js:1864075 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Commit Graph | 打开提交图 | key:label · norm-covered · main.js:1865419 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open Folder | 打开文件夹 | key:label · main.js:1874862 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Show in folder | 在文件夹中显示 | key:title · main.js:4341835 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Contact your administrator to set up Gemini Enterprise for this project | 请联系管理员为此项目设置 Gemini Enterprise | main.js:4429816 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Gemini）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Optimize the interface and terminal output for screen readers. | 为屏幕阅读器优化界面和终端输出。 | key:description · norm-covered · main.js:4611160 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Terminal Placement | 终端位置 | key:label · norm-covered · main.js:4611648 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose where terminal sessions appear. | 选择终端会话出现的位置。 | key:description · norm-covered · main.js:4611681 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Use full VCS clones for Best of N | Best of N 使用完整 VCS 克隆 | key:label · main.js:4617421 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Use full Git clones for Best of N | Best of N 使用完整 Git 克隆 | key:label · main.js:4617813 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Simulate running on a different OS. | 模拟在其他操作系统上运行。 | key:description · main.js:4631559 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Simulate a different user cohort (Google, External, Enterprise). | 模拟其他用户群组（Google、外部、企业）。 | key:description · main.js:4632187 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Workspaces | 工作区 | key:title · main.js:4858032 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Your administrator has disabled MCP servers for this workspace. | 管理员已为此工作区停用 MCP 服务器。 | main.js:4877917 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：MCP）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Folder doesn't exist | 文件夹不存在 | key:content · main.js:4984475 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Cannot parse folder URI. | 无法解析文件夹 URI。 | key:content · main.js:4984739 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Connected Google Drive and GitHub resources | 已连接的 Google Drive 与 GitHub 资源 | key:title · main.js:4987765 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Files, folders, and repositories you connect are accessible to your agent in this project, including during background or scheduled runs. | 你连接的文件、文件夹和仓库可供此项目中的智能体访问，包括后台或定时运行期间。 | key:description · main.js:4987823 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Files and resources in cloud workspaces | 云工作区中的文件与资源 | key:title · main.js:4989737 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | All Workspaces | 所有工作区 | main.js:5012949 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Open Diff | 查看差异 | shape:Open(21) · main.js:6385309 | 与已有 dict 同形：前缀 `Open` 在词典中有 21 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Revert file changes | 还原文件更改 | key:label · norm-covered · main.js:6387289 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | File Diff Comments | 文件差异评论 | shape:File(6) · main.js:6411424 | 与已有 dict 同形：前缀 `File` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | File Comments | 文件评论 | shape:File(6) · main.js:6411726 | 与已有 dict 同形：前缀 `File` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Could not create project | 无法创建项目 | key:title · main.js:6558261 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Inspected commit | 已检查的提交 | main.js:6660932 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Folders these agents can access. | 这些智能体可访问的文件夹。 | key:description · main.js:6740290 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Commands and files these agents can use. | 这些智能体可使用的命令和文件。 | key:description · main.js:6740420 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Search file contents... | 搜索文件内容... | key:placeholder · main.js:6789106 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Search projects... | 搜索项目... | key:placeholder · main.js:6838208 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | True changes vs the parent workspace | 相对父工作区的真实更改 | key:subtitle · main.js:7172447 | bundle 中带强 UI 键名 `subtitle`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Add Terminal | 添加终端 | shape:Add(15) · main.js:7180921 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | File explorer | 文件资源管理器 | key:text · main.js:7197807 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | File Tree Component is not loaded. | 文件树组件未加载。 | shape:File(6) · main.js:7201214 | 与已有 dict 同形：前缀 `File` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Open Terminal | 打开终端 | key:content · main.js:7239823 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Uses your local clone, | 使用你的本地克隆， | main.js:7686438 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `ACCEPT` | Search branches | 搜索分支 | key:placeholder · main.js:7786604 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Worktrees are a git feature. This folder is shared as is. | 工作树是 Git 的功能。此文件夹按原样共享。 | key:content · main.js:7787846 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Work in a New Worktree | 在新工作树中工作 | shape:Work(6) · main.js:7791659 | 与已有 dict 同形：前缀 `Work` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Keeps your checkout untouched | 保持当前检出不变 | main.js:7791761 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Select Worktree | 选择工作树 | shape:Select(9) · main.js:7795325 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Run in your current workspace | 在当前工作区中运行 | key:description · main.js:7839731 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Run in a new worktree | 在新工作树中运行 | key:description · main.js:7839824 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Clone current workspace into a new independent workspace | 将当前工作区克隆到新的独立工作区 | key:description · main.js:7839913 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enter Google Cloud Project Details | 输入 Google Cloud 项目详情 | shape:Enter(13) · main.js:7993247 | 与已有 dict 同形：前缀 `Enter` 在词典中有 13 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Copy the folder elsewhere first if you might want it back. | 如果以后可能还需要，请先把文件夹复制到别处。 | shape:Copy(18) · main.js:8040943 | 与已有 dict 同形：前缀 `Copy` 在词典中有 18 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Enter project name... | 输入项目名称... | key:placeholder · main.js:8350092 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | A project with this name already exists. | 同名项目已存在。 | main.js:8350349 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Search workspaces... | 搜索工作区... | key:placeholder · main.js:8352838 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Unmount workspace | 卸载工作区 | key:tooltip · main.js:8356944 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Remount workspace | 重新挂载工作区 | key:tooltip · main.js:8357309 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Delete workspace | 删除工作区 | key:tooltip · main.js:8357670 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Are you sure you want to delete the workspace | 确定要删除工作区吗 | main.js:8359727 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Kill Terminal | 终止终端 | key:label · main.js:8404884 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Resume it to open a new terminal. Anything that was running in this one has stopped. | 恢复它以打开新终端。此前在其中运行的内容均已停止。 | key:description · main.js:8407064 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Add files | 添加文件 | key:content · main.js:8522242 | bundle 中带强 UI 键名 `content`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select workspace | 选择工作区 | shape:Select(9) · main.js:8637001 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Create a project first. | 请先创建一个项目。 | shape:Create(10) · main.js:8650290 | 与已有 dict 同形：前缀 `Create` 在词典中有 10 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Read access to code, refs, commits, and other repository contents. | 对代码、引用、提交和其它仓库内容的读取权限。 | main.js:10389050 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Grant create, update, or delete access to specific branches. | 授予对特定分支的创建、更新或删除权限。 | main.js:10393729 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Current workspace | 当前工作区 | key:label · norm-covered · main.js:11138544 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Commit succeeded | 提交成功 | key:title · main.js:11183622 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | The branch was pushed to GitLab. | 分支已推送到 GitLab。 | key:message · main.js:11185693 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Created a new branch on Origin. | 已在 Origin 上创建新分支。 | key:message · main.js:11185795 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |

### 内置浏览器/预览/下载（52 条：ACCEPT 39 / REJECT 0 / REVIEW 13）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Close Tab | 关闭标签页 | key:label · norm-covered · menuOnly · main.js:1862744 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Close Terminal Tab | 关闭终端标签页 | key:label · norm-covered · main.js:1863387 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Previous Side Panel Tab | 上一个侧边面板标签页 | key:label · norm-covered · main.js:1868023 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Next Side Panel Tab | 下一个侧边面板标签页 | key:label · norm-covered · main.js:1868110 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Open in Tab | 在标签页中打开 | key:label · main.js:2958186 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Many external websites (such as Google Search, GitHub, or Wikipedia) restrict iframe embedding via | 许多外部网站（例如 Google 搜索、GitHub 或 Wikipedia）通过以下方式限制 iframe 嵌入 | main.js:3408437 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：GitHub）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Attackers might be able to see the images you're looking at on this site and trick you by modifying them. | 攻击者可能看到你在此网站浏览的图片，并通过篡改图片来欺骗你。 | key:description · main.js:3428626 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open the page in system browser | 在系统浏览器中打开此页面 | shape:Open(21) · main.js:3945016 | 与已有 dict 同形：前缀 `Open` 在词典中有 21 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Cancel download | 取消下载 | key:title · main.js:4342240 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Link in New Tab | 在新标签页中打开链接 | key:label · main.js:4398175 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Link in External Browser | 在外部浏览器中打开链接 | key:label · main.js:4398329 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy Link Address | 复制链接地址 | key:label · main.js:4398482 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Image in New Tab | 在新标签页中打开图片 | key:label · main.js:4398716 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open in Built-in Browser | 在内置浏览器中打开 | key:label · main.js:4409351 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Continue your work from another device with Remote Control. Scan the QR code or open the link below. | 通过远程控制从其它设备继续工作。扫描二维码或打开下方链接。 | key:description · main.js:4544843 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enable Browser Tools | 启用浏览器工具 | key:label · main.js:4612991 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Download Location | 下载位置 | key:label · main.js:4854762 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Folder where files downloaded in the built-in browser are saved. | 内置浏览器下载文件的保存文件夹。 | main.js:4854898 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Upload Files | 上传文件 | key:label · main.js:4981833 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Here's how uploaded files, attachments, and connected resources work in your cloud environment | 下面说明上传文件、附件和已连接资源在云环境中的工作方式 | main.js:4989986 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Uploaded files and connected resources are mounted in your cloud environment. | 上传的文件和已连接的资源会挂载到你的云环境中。 | main.js:4992455 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Upload Debug Bundle | 上传调试包 | main.js:5021121 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | This link wants to open an app on your device. | 此链接想要打开你设备上的应用。 | main.js:5572324 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Open link | 打开链接 | key:linkLabel · main.js:5573402 | bundle 中带强 UI 键名 `linkLabel`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Mention Page | 提及页面 | key:title · main.js:6440747 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Capture Screenshot | 截取屏幕截图 | key:title · main.js:6440905 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Launching the browser... | 正在启动浏览器... | main.js:6446301 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `REVIEW` | The agent will wait for you to install the browser extension. | 智能体会等待你安装浏览器扩展。 | main.js:6446354 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Antigravity would like to use the browser. | Antigravity 想要使用浏览器。 | main.js:6446445 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Antigravity）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Denied Sites | 被拒绝的网站 | main.js:6449992 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | The agent was prevented from accessing some sites | 智能体被阻止访问某些网站 | main.js:6450151 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Agent can retrieve console logs from the browser and return it for further processing. | 智能体可以从浏览器获取控制台日志并返回以作进一步处理。 | shape:Agent(14) · main.js:6453166 | 与已有 dict 同形：前缀 `Agent` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Browser Use | 浏览器使用 | key:label · main.js:6487827 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | View Page | 查看页面 | key:title · main.js:6665879 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browser actions | 浏览器操作 | key:label · main.js:6732237 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Uploaded to Google Drive | 已上传到 Google Drive | key:title · main.js:7105176 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Link copied to clipboard. | 链接已复制到剪贴板。 | key:message · main.js:7105211 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Error loading Browser recording | 加载浏览器录制失败 | main.js:7145498 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Loading Browser recording... | 正在加载浏览器录制... | shape:Loading(6) · main.js:7145809 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Unable to resolve audio source URL | 无法解析音频源网址 | main.js:7146610 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Click to copy URL | 点击复制网址 | key:title · main.js:7765536 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browser control is gated in remote sessions. | 远程会话中浏览器控制受限。 | shape:Browser(10) · main.js:7765968 | 与已有 dict 同形：前缀 `Browser` 在词典中有 10 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Open Google Chrome on the machine running Antigravity. | 在运行 Antigravity 的计算机上打开 Google Chrome。 | shape:Open(21) · main.js:7766598 | 与已有 dict 同形：前缀 `Open` 在词典中有 21 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Couldn't load Google Drive link title | 无法加载 Google Drive 链接标题 | key:title · main.js:7948391 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Close Tabs to the Left | 关闭左侧标签页 | key:label · main.js:8479712 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Close Tabs to the Right | 关闭右侧标签页 | key:label · main.js:8479853 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Download this site as an app to get notified when the agent needs your attention or completes a task. | 将此站点下载为应用，以便智能体需要你关注或完成任务时收到通知。 | key:message · main.js:10372832 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Previous Page | 上一页 | key:title · main.js:10787485 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Next Page | 下一页 | key:title · main.js:10788179 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browser tools are not available in the Antigravity Android desktop app. | Antigravity Android 桌面应用中不提供浏览器工具。 | key:gatingMessage · main.js:11115365 | bundle 中带强 UI 键名 `gatingMessage`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browser tools are disabled in the Antigravity Android desktop app. | 浏览器工具已在 Antigravity Android 桌面应用中停用。 | key:settingsGatingMessage · main.js:11115461 | bundle 中带强 UI 键名 `settingsGatingMessage`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | The remote shared a link for this push. | 远端分享了此次推送的链接。 | key:message · main.js:11185994 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |

### 模型/代理/配额（41 条：ACCEPT 30 / REJECT 0 / REVIEW 11）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `REVIEW` | Embedding Limitations | 嵌入限制 | main.js:3408328 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Select Billing Model | 选择计费模式 | shape:Select(9) · main.js:4433106 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Context and Quota Indicator | 上下文与配额指示器 | key:label · norm-covered · main.js:4612274 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Show how full the context window is next to the send button. Click it for a breakdown and to see your model quota. | 在发送按钮旁显示上下文窗口占用情况。点击可查看明细和模型配额。 | key:description · norm-covered · main.js:4612316 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | What quota or feature is being incorrectly limited | 哪项配额或功能被错误地限制了 | main.js:4664089 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No quota information available. | 暂无配额信息。 | main.js:4680444 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Loading token usage... | 正在加载 token 用量... | shape:Loading(6) · main.js:4743919 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | No token data available. | 暂无 token 数据。 | main.js:4744345 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Daily conversation limit reached | 已达到每日对话上限 | key:title · main.js:6558897 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Conversation limit reached | 已达到对话上限 | key:title · main.js:6559001 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | No model specified for Battle Mode, falling back to use current selected model | 未为 Battle 模式指定模型，将回退到当前所选模型 | key:title · main.js:6573985 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Models Tab | 模型标签页 | main.js:6623552 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | AI Credits Used to Generate Response | 生成此回复所用的 AI 额度 | key:text · main.js:6623604 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Parent workspace not found for this battle. | 找不到此 battle 的父工作区。 | key:error · main.js:7168092 | bundle 中带强 UI 键名 `error`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | The current trigger rate is too high. | 当前触发率过高。 | key:title · main.js:7711369 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | This request is not well-suited for parallel Best-of-N generation. | 此请求不太适合并行的 Best-of-N 生成。 | key:title · main.js:7711562 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Why are you opting out of auto-triggered Best-of-N? | 你为什么选择退出自动触发的 Best-of-N？ | key:title · main.js:7713301 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enable Best-of-2 | 启用 Best-of-2 | shape:Enable(14) · main.js:7715232 | 与已有 dict 同形：前缀 `Enable` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | You can prompt the model to try again or start a new conversation if the error persists. | 可以让模型重试；如果错误仍然存在，请开始新对话。 | main.js:7737828 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Insufficient AI Credits | AI 额度不足 | key:title · main.js:7739910 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Purchase Credits | 购买额度 | key:label · main.js:7739967 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Model quota reached | 模型配额已用尽 | key:title · main.js:7740618 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select another model | 选择其他模型 | key:label · main.js:7740671 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Baseline model quota reached | 基准模型配额已用尽 | key:title · main.js:7741199 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enable Overages | 启用超额用量 | key:label · main.js:7741262 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select Model to Send Message | 选择模型以发送消息 | key:title · main.js:7743264 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select a model using the model selector in the input box | 使用输入框中的模型选择器选择模型 | key:message · main.js:7743304 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Migrate with Agent | 使用智能体迁移 | main.js:7748698 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Edit Model | 编辑模型 | shape:Edit(5) · main.js:7818434 | 与已有 dict 同形：前缀 `Edit` 在词典中有 5 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Add Model | 添加模型 | shape:Add(15) · main.js:7819458 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Custom models are only supported on Linux machines. | 自定义模型仅在 Linux 计算机上受支持。 | shape:Custom(6) · main.js:7819756 | 与已有 dict 同形：前缀 `Custom` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Harness per Response | 每个回复的测试框架 | main.js:7879270 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Curated sets of plugins for common workflows and roles. | 为常见工作流和角色精选的插件集合。 | main.js:8088798 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Generate personalized rules | 生成个性化规则 | key:title · main.js:8261571 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | New models have been enabled for you! | 已为你启用新模型！ | key:title · main.js:8311972 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Browser is currently being operated by this conversation in another Hub window | 此浏览器正由另一个 Hub 窗口中的该对话操作 | shape:Browser(10) · main.js:8489785 | 与已有 dict 同形：前缀 `Browser` 在词典中有 10 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Change model | 更改模型 | key:label · main.js:8586681 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | GitHub Personal Access Token | GitHub 个人访问令牌 | key:title · main.js:10380301 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | A comma-separated list like repo-a, repo-b, or * for all. | 逗号分隔的列表，如 repo-a、repo-b，或用 * 表示全部。 | main.js:10388580 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | A comma-separated list like org-a, org-b, or * for all. | 逗号分隔的列表，如 org-a、org-b，或用 * 表示全部。 | main.js:10397968 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Failed to Generate Commit Message | 生成提交信息失败 | key:title · main.js:11183194 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |

### 权限/安全/沙箱（40 条：ACCEPT 25 / REJECT 0 / REVIEW 15）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `REVIEW` | Intended primarily for previewing local development servers (e.g., | 主要用于预览本地开发服务器（例如 | main.js:3407808 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `REVIEW` | Security | 安全 | main.js:4331407 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content. | 智能体从不请求审查。这最大化了自主性，但智能体处理不安全或被注入的产物内容时风险也最高。 | key:description · main.js:4603061 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Specifies the agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience. | 指定智能体就产物请求审查时的行为；产物是它创建的文档，用于带来更丰富的对话体验。 | key:description · main.js:4609545 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Configure workspace-specific permissions, resources, and customizations. | 配置工作区专属的权限、资源和自定义项。 | key:description · main.js:4759516 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | These allowed domain rules are set by your organization's administrator and cannot be removed. | 这些允许的域名规则由组织管理员设置，无法移除。 | main.js:4789457 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Allowed Domains | 允许的域名 | main.js:4789744 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Allow/deny agent read access to specific files or directories. | 允许 / 拒绝智能体读取特定文件或目录。 | key:description · main.js:4836209 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Allow/deny agent write access to specific files or directories. | 允许 / 拒绝智能体写入特定文件或目录。 | key:description · main.js:4836525 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Allow/deny agent read access to specific URLs or domains. | 允许 / 拒绝智能体读取特定网址或域名。 | key:description · main.js:4836826 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Allow/deny agent command execution outside the sandbox. | 允许 / 拒绝智能体在沙箱外执行命令。 | key:description · main.js:4837443 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Restricts agent tools to a secure, isolated local sandbox. | 将智能体工具限制在安全、隔离的本地沙箱中。 | key:description · main.js:4843375 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Controls permissions for remote conversations. | 控制远程对话的权限。 | key:description · main.js:4847610 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Permission Details | 权限详情 | key:title · main.js:4849979 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | These MCP allowlist rules are enforced by your organization's administrator. | 这些 MCP 允许列表规则由组织管理员强制执行。 | main.js:4880383 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：MCP）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Uploaded project files and in-chat attachments are stored on Google servers and mounted into your cloud sandbox so your agent can read and work with them. | 上传的项目文件和对话内附件存储在 Google 服务器上，并挂载到你的云沙箱，供智能体读取和处理。 | key:description · main.js:4987585 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Site Allowlist | 网站允许列表 | main.js:6450979 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | The Agent attempted to interact with some sites that are not allowlisted | 智能体尝试与某些不在允许列表中的网站交互 | main.js:6451124 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Add them to allow future interactions | 添加它们以允许后续交互 | shape:Add(15) · main.js:6451664 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Open allowlist | 打开允许列表 | shape:Open(21) · main.js:6451832 | 与已有 dict 同形：前缀 `Open` 在词典中有 21 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | This command ran in the sandbox. | 此命令已在沙箱中运行。 | main.js:6630916 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Unsandboxed commands | 沙箱外命令 | key:label · main.js:6732028 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | This extension has no declared permissions requiring user input. | 此扩展没有声明需要用户输入的权限。 | main.js:6737413 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Resolving permissions... | 正在解析权限... | main.js:6740197 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Security Notice & Data Use | 安全须知与数据使用 | main.js:6851419 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Review plans and walkthroughs | 审查计划与演练 | key:title · main.js:6854818 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | By default, agents work in folders you choose and ask before sensitive changes. Adjust this anytime in Settings. | 默认情况下，智能体在你选择的文件夹中工作，进行敏感更改前会先询问。可随时在设置中调整。 | key:description · main.js:6855022 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Inline PDF preview is not available in this environment. | 此环境中不支持内联 PDF 预览。 | key:message · main.js:7143029 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Preview is not available for this file type. | 此文件类型不支持预览。 | key:message · main.js:7149457 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Blocked, needs input | 已阻塞，需要输入 | main.js:7236751 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | "Allow remote debugging for this browser instance" | 「允许对此浏览器实例进行远程调试」 | main.js:7767696 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Confirm the command is safe to run outside of the sandbox with full network and disk access. | 确认该命令在沙箱外以完整网络和磁盘权限运行是安全的。 | main.js:8271179 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Allow creating issues and grant access to specific issues. | 允许创建 issue，并授予对特定 issue 的访问权限。 | shape:Allow(7) · main.js:10389939 | 与已有 dict 同形：前缀 `Allow` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Toggle this on to allow creating new issues. | 开启此项以允许创建新 issue。 | shape:Toggle(17) · main.js:10390310 | 与已有 dict 同形：前缀 `Toggle` 在词典中有 17 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Allow opening pull requests and grant access to specific PRs. | 允许发起拉取请求，并授予对特定 PR 的访问权限。 | shape:Allow(7) · main.js:10391778 | 与已有 dict 同形：前缀 `Allow` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Toggle this on to allow creating new pull requests. | 开启此项以允许创建新的拉取请求。 | shape:Toggle(17) · main.js:10392159 | 与已有 dict 同形：前缀 `Toggle` 在词典中有 17 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Grant read access to workflow runs and allow dispatching workflows on specific files and refs. | 授予工作流运行的读取权限，并允许对特定文件和引用触发工作流。 | main.js:10395140 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Allow reading workflow runs (list, view, watch) across the whole repository. | 允许读取整个仓库的工作流运行（列表、查看、监视）。 | shape:Allow(7) · main.js:10395547 | 与已有 dict 同形：前缀 `Allow` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Enable fine-grained GitHub permissions and define the org, repository, and resource-level access the agent is allowed to use. | 启用细粒度 GitHub 权限，并定义允许智能体使用的组织、仓库和资源级访问权限。 | key:subtitle · main.js:10405747 | bundle 中带强 UI 键名 `subtitle`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Manage fine-grained permissions for GitHub. | 管理 GitHub 的细粒度权限。 | key:description · main.js:10406917 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |

### 登录/账号/权限验证（38 条：ACCEPT 23 / REJECT 0 / REVIEW 15）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers. | 请勿在此网站输入任何敏感信息（例如密码或信用卡号），攻击者可能窃取这些信息。 | key:description · main.js:3427488 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Your Antigravity use will be associated with provided project. | 你对 Antigravity 的使用将与所提供的项目关联。 | main.js:4427522 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Antigravity）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Verify that these licenses were provided by your administrator and that you trust the project ID before proceeding. Account activity and data may be logged by your organization. | 继续前请确认这些许可由管理员提供，且你信任该项目 ID。你的组织可能会记录账号活动和数据。 | main.js:4428839 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Your Antigravity use will be associated with provided project. Make sure you trust the project ID before proceeding. Account activity and data may be logged by your organization. | 你对 Antigravity 的使用将与所提供的项目关联。继续前请确认你信任该项目 ID。你的组织可能会记录账号活动和数据。 | main.js:4430568 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Antigravity）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Auto-assignment not configured | 未配置自动分配 | key:errorMessage · main.js:4438024 | bundle 中带强 UI 键名 `errorMessage`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | What functionality you expect your account tier to have available that is missing | 你认为自己的账号等级应有哪些功能却缺失了 | main.js:4664169 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Paste auth code | 粘贴授权码 | key:placeholder · main.js:4866037 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Services this plugin connects to on your behalf. Credentials stay on this machine and are only sent to the domains listed. | 此插件代表你连接的服务。凭据仅保存在本机，且只发送到列出的域名。 | main.js:4924168 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Needs re-auth | 需要重新授权 | main.js:4927325 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Add account | 添加账号 | shape:Add(15) · main.js:4928934 | 与已有 dict 同形：前缀 `Add` 在词典中有 15 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Paste the code shown after you sign in. | 粘贴登录后显示的代码。 | main.js:4933375 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Connect your account to browse | 连接账号以浏览 | main.js:4975791 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Authentication Required | 需要身份验证 | main.js:6858700 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Sign in needed | 需要登录 | shape:Sign in(3) · main.js:7316244 | 与已有 dict 同形：前缀 `Sign in` 在词典中有 3 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Sign-in required | 需要登录 | key:title · main.js:7323204 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enter authorization code... | 输入授权码... | key:placeholder · main.js:7328247 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Account connected. | 账号已连接。 | key:message · main.js:7394680 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | This plugin requires authentication before the agent can use its tools. | 此插件需要先完成身份验证，智能体才能使用其工具。 | key:message · main.js:7394819 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Set up authentication | 设置身份验证 | key:label · main.js:7395131 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Sign in required. | 需要登录。 | key:message · main.js:7397318 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Password Prompt Blocked | 密码输入提示已被阻止 | main.js:7546422 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Verification required | 需要验证 | key:title · main.js:7736557 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Please verify your account to continue using | 请验证你的账号以继续使用 | main.js:7736618 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Complete verification | 完成验证 | key:label · main.js:7736949 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Authentication expired | 身份验证已过期 | key:title · main.js:7737243 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | There was an unexpected issue setting up your account. | 设置账号时出现意外问题。 | main.js:7989884 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Sorry, this account is ineligible to use | 抱歉，此账号不符合使用条件 | main.js:7990541 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库 |
|   | `REVIEW` | Please verify your account, then sign in again to continue. Learn more by visiting our | 请验证你的账号，然后重新登录以继续。详情请访问我们的 | main.js:7990707 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Connect an account so the agent can use this app. | 连接账号，以便智能体使用此应用。 | key:message · main.js:8097822 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | There was an error with your authentication. To log in, click | 身份验证出错。要登录，请点击 | key:message · main.js:8257011 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | To use the agent, please login | 请先登录以使用智能体 | key:message · main.js:8257222 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Log in to use the agent | 登录后才能使用智能体 | key:message · main.js:8257316 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Refreshed credentials for all automations. | 已刷新所有自动化的凭据。 | key:title · main.js:8257791 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to refresh credentials | 刷新凭据失败 | key:title · main.js:8257946 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Connect an account so the agent can run automations. | 连接账号，以便智能体运行自动化。 | key:message · main.js:8258678 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Refresh all credentials | 刷新所有凭据 | main.js:8260906 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | What should the agent do on each run? For example: summarize new bugs assigned to me and anything that changed overnight. | 每次运行时智能体应该做什么？例如：汇总分配给我的新缺陷以及夜间发生的变化。 | key:placeholder · main.js:8653023 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | For example: every morning, summarize new bugs assigned to me and anything that changed overnight. | 例如：每天早上汇总分配给我的新缺陷以及夜间发生的变化。 | key:placeholder · main.js:8655482 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |

### 设置（33 条：ACCEPT 28 / REJECT 0 / REVIEW 5）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Toggle File Viewer | 切换文件查看器 | key:label · norm-covered · main.js:1862022 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Project Selector | 切换项目选择器 | key:label · norm-covered · main.js:1862119 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Toggle Environment Selector | 切换环境选择器 | key:label · main.js:1862225 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Toggle Maximize Side Panel | 最大化 / 还原侧边面板 | key:label · norm-covered · main.js:1862409 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Failed to parse settings. Fix and restart. | 设置解析失败。请修复后重启。 | shape:Failed to(6) · main.js:4416111 | 与已有 dict 同形：前缀 `Failed to` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | These settings can only be changed on the computer running the app, not from a remote session. | 这些设置只能在运行本应用的计算机上更改，无法从远程会话更改。 | main.js:4542776 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `REVIEW` | Feature Environment Override | 功能环境覆盖 | main.js:4631187 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Override feature environment | 覆盖功能环境 | key:label · main.js:4631269 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | For Antigravity Business consumption options, see | 有关 Antigravity Business 的用量方案，请参阅 | norm-covered · main.js:4682844 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Configure GitHub access policies. | 配置 GitHub 访问策略。 | key:description · main.js:4839207 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Agent Hooks Configuration | 智能体 Hooks 配置 | shape:Agent(14) · main.js:4894039 | 与已有 dict 同形：前缀 `Agent` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Search for MCP servers to add to your configuration | 搜索要添加到配置中的 MCP 服务器 | shape:Search(30) · main.js:4904845 | 与已有 dict 同形：前缀 `Search` 在词典中有 30 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Configure hooks that run on agent lifecycle events. | 配置在智能体生命周期事件上运行的 Hook。 | key:description · main.js:4906747 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Select the workspace type that will be used for new conversations started with the New Workspace option. | 选择通过「新建工作区」发起新对话时使用的工作区类型。 | key:description · main.js:4912962 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Remove individual uploaded files or connected resources in Project Settings, or delete a project or conversation to remove its stored files. | 可在项目设置中移除单个上传文件或已连接资源，也可删除项目或对话以移除其存储的文件。 | key:description · main.js:4988035 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | A shell setup script run before every command the agent executes in this project. Overrides the global script. | 在此项目中，智能体执行每条命令前运行的 shell 初始化脚本。会覆盖全局脚本。 | key:description · main.js:5013230 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Settings Unavailable | 设置不可用 | key:title · main.js:5037899 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | When Turbo mode is on, the agent will automatically capture screenshots in the Browser without explicit user input. You can toggle this setting in Antigravity's settings. | 开启 Turbo 模式后，智能体无需用户明确输入即会自动在浏览器中截取屏幕截图。你可以在 Antigravity 设置中切换此选项。 | main.js:6454380 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Antigravity）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Select an option... | 选择一个选项... | shape:Select(9) · main.js:6491271 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Enter the configuration values this MCP server needs. Saving restarts the server with them. | 输入此 MCP 服务器所需的配置值。保存后会用这些值重启服务器。 | key:description · main.js:7399752 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Telemetry is disabled in Settings | 遥测已在设置中停用 | key:title · main.js:7619446 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Enable telemetry in Settings before changing per-conversation telemetry. | 请先在设置中启用遥测，再更改单个对话的遥测。 | key:message · main.js:7619490 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | (Optional) Tell us more or type your reason... | （可选）告诉我们更多，或输入你的原因... | key:placeholder · main.js:7714680 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Use Global Settings | 使用全局设置 | main.js:7765061 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Use theme to be imported with settings | 导入设置时同时使用主题 | key:label · main.js:8004519 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Copy Config File Path | 复制配置文件路径 | key:label · main.js:8054857 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Toggle Terminal Panel | 切换终端面板 | shape:Toggle(17) · main.js:8123539 | 与已有 dict 同形：前缀 `Toggle` 在词典中有 17 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | (Optional, defaults to main) | （可选，默认为 main） | main.js:8331256 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Open project settings | 打开项目设置 | key:label · main.js:8586568 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Notification Preferences | 通知偏好设置 | key:title · main.js:10369508 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Open Preferences | 打开偏好设置 | key:label · main.js:10369685 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Toggle this on to enable read access on contents. | 开启此项以启用对内容的读取权限。 | shape:Toggle(17) · main.js:10389425 | 与已有 dict 同形：前缀 `Toggle` 在词典中有 17 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Toggle Thumbnails | 切换缩略图 | key:title · main.js:10786986 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |

### 插件/技能/MCP/智能体（28 条：ACCEPT 20 / REJECT 0 / REVIEW 8）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Delete All Remote Agents Data | 删除所有远程智能体数据 | key:label · main.js:4442810 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Set the volume of agent sounds. | 设置智能体提示音的音量。 | key:description · main.js:4683391 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | When enabled, the agent will include default customizations, including default skills. | 启用后，智能体会包含默认自定义项（含默认技能）。 | key:description · main.js:4905953 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Artifact Comments | 产物评论 | main.js:6411143 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Build with one agent or a team | 使用一个智能体或一个团队来构建 | key:title · main.js:6854656 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Comment on the plan before your agent starts, and get a walkthrough when it finishes. | 在智能体开始前对计划发表意见，完成后获得演练讲解。 | key:description · main.js:6854862 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Artifact updated by agent | 产物已由智能体更新 | main.js:7088622 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Select text in the artifact to add a comment | 在产物中选择文本以添加评论 | shape:Select(9) · main.js:7156737 | 与已有 dict 同形：前缀 `Select` 在词典中有 9 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Artifacts like Google Docs, PDFs, Office documents (Word, Excel, PowerPoint), etc. Everything else the agent creates is under Artifacts. | 产物包括 Google 文档、PDF、Office 文档（Word、Excel、PowerPoint）等。智能体创建的其它内容都归在「产物」下。 | main.js:7229685 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Google）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Stop All Subagents | 停止所有子智能体 | key:tooltip · main.js:7237744 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | User cancelled agent execution. | 用户已取消智能体执行。 | norm-covered · main.js:7272261 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Ask the agent to diagnose and fix this server | 让智能体诊断并修复此服务器 | key:tooltip · main.js:7322881 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Fix with Agent | 使用智能体修复 | main.js:7323031 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Plugin update required | 需要更新插件 | key:label · main.js:7343449 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Managed by plugin | 由插件管理 | shape:managed by(2) · main.js:7372046 | 与已有 dict 同形：前缀 `managed by` 在词典中有 2 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Install this plugin to see the commands it adds, along with its skills, agents and MCP servers. | 安装此插件即可查看它添加的命令，以及技能、智能体和 MCP 服务器。 | main.js:7399416 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：MCP）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Search connectors | 搜索连接器 | key:placeholder · main.js:7719673 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Browse Connectors | 浏览连接器 | main.js:7721580 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | Sends after agent finishes working | 在智能体完成工作后发送 | main.js:7898282 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Plugins are packaged collections of skills and MCPs to help the Agent | 插件是技能与 MCP 的打包集合，用于协助智能体 | shape:Plugins are(7) · main.js:7998546 | 与已有 dict 同形：前缀 `Plugins are` 在词典中有 7 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | This skill came from the marketplace, so you can add it again whenever you need it. | 此技能来自市场，需要时可随时重新添加。 | main.js:8040454 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界 |
|   | `ACCEPT` | Enable Recommended Skills | 启用推荐技能 | shape:Enable(14) · main.js:8042134 | 与已有 dict 同形：前缀 `Enable` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | More Plugins | 更多插件 | key:displayName · main.js:8082895 | bundle 中带强 UI 键名 `displayName`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Subagent ended | 子智能体已结束 | key:text · main.js:8450468 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | What should the agent do on each run? | 每次运行时智能体应该做什么？ | key:placeholder · main.js:8590055 | bundle 中带强 UI 键名 `placeholder`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Get notified when the agent needs your attention or completes a task. | 智能体需要你关注或完成任务时接收通知。 | key:message · main.js:10374891 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Agent can | 智能体可以 | shape:Agent(14) · main.js:10384614 | 与已有 dict 同形：前缀 `Agent` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Agent can run | 智能体可以运行 | shape:Agent(14) · main.js:10385777 | 与已有 dict 同形：前缀 `Agent` 在词典中有 14 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |

### 错误/失败提示（25 条：ACCEPT 15 / REJECT 0 / REVIEW 10）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Failed to read file | 读取文件失败 | key:message · main.js:3276456 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Something went wrong! | 出错了！ | main.js:3499972 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | An error was thrown. | 抛出了错误。 | main.js:4253372 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Couldn't delete your data. Try again. | 无法删除你的数据，请重试。 | main.js:4443782 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | An error occurred while submitting your feedback. Please try again. | 提交反馈时出错，请重试。 | key:message · main.js:4673745 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | No project selected or project management not available. | 未选择项目，或项目管理不可用。 | main.js:5011012 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Failed to create terminal | 创建终端失败 | key:title · main.js:5636428 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Too many requests, please try again in a bit! | 请求过多，请稍后重试！ | key:message · main.js:5851053 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Error while editing notebook | 编辑笔记本时出错 | main.js:6372537 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Error while reading notebook | 读取笔记本时出错 | main.js:6372761 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Too many environments running | 运行中的环境过多 | key:title · main.js:6558789 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Custom agents are not available in Best of N mode. | Best of N 模式下无法使用自定义智能体。 | key:title · main.js:6572583 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to start Best of N mode | 启动 Best of N 模式失败 | key:title · main.js:6574324 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Task not found | 找不到任务 | main.js:7256395 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Failed to create remote project | 创建远程项目失败 | key:title · main.js:7662242 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to stop agent | 停止智能体失败 | key:title · main.js:7706923 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Too many surveys | 调查过多 | key:label · main.js:7711344 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Your session has expired. Please log back in to continue. | 你的会话已过期。请重新登录以继续。 | key:message · main.js:7737276 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Agent terminated due to error | 智能体因错误而终止 | key:title · main.js:7737458 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Failed to create worktree | 创建工作树失败 | key:title · main.js:7771685 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | It was already sent or couldn't be removed from the queue. | 它已发送，或无法从队列中移除。 | key:message · main.js:7927206 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Invalid Media | 媒体文件无效 | key:title · norm-covered · main.js:7937118 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `REVIEW` | No internet. Agent features may not work. | 无网络连接。智能体功能可能无法使用。 | main.js:8545239 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Sidecar feature is not available. | Sidecar 功能不可用。 | main.js:8613382 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Sidecar）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | " not found. | " 未找到。 | main.js:8613617 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |

### 状态/进度提示（19 条：ACCEPT 13 / REJECT 0 / REVIEW 6）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Loading media... | 正在加载媒体... | shape:Loading(6) · main.js:3035292 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading licenses... | 正在加载许可... | shape:Loading(6) · main.js:4438379 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading workspace customizations... | 正在加载工作区自定义项... | shape:Loading(6) · main.js:4756946 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading hooks... | 正在加载 Hooks... | shape:Loading(6) · main.js:4893666 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Installing | 正在安装 | main.js:4899920 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Loading resources... | 正在加载资源... | shape:Loading(6) · main.js:4975612 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Waiting for user input | 等待用户输入 | main.js:6365934 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Rendering playback | 正在渲染回放 | main.js:6444814 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Loading logs... | 正在加载日志... | shape:Loading(6) · main.js:7359706 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Stream and control | 串流与控制 | main.js:7366534 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Loading events... | 正在加载事件... | shape:Loading(6) · main.js:7370389 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Creating terminal... | 正在创建终端... | main.js:7557212 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Loading worktrees... | 正在加载工作树... | shape:Loading(6) · main.js:7796613 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `REVIEW` | Finalizing transcription... | 正在完成转写... | main.js:7874899 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Loading customizations... | 正在加载自定义项... | shape:Loading(6) · main.js:8052121 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading available plugins... | 正在加载可用插件... | shape:Loading(6) · main.js:8093239 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading apps... | 正在加载应用... | key:label · main.js:8101961 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `ACCEPT` | Loading Notebook View... | 正在加载笔记本视图... | shape:Loading(6) · main.js:8433811 | 与已有 dict 同形：前缀 `Loading` 在词典中有 6 条界面文案，且本条无插值/代码字符，可判为固定 UI 文案 |
|   | `ACCEPT` | Loading subagent... | 正在加载子智能体... | key:text · main.js:8450340 | bundle 中带强 UI 键名 `text`：确定是 label/title/description 一类固定文案 |

### 空状态（15 条：ACCEPT 4 / REJECT 0 / REVIEW 11）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `REVIEW` | No matching project folders. Apply to use the custom URI. | 没有匹配的项目文件夹。应用以使用自定义 URI。 | main.js:4659423 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Nothing is running right now | 当前没有正在运行的内容 | main.js:4703558 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | No keyboard shortcuts found matching your filter. | 没有符合筛选条件的键盘快捷键。 | norm-covered · main.js:4729308 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Try out early-stage features before they ship. These may be changed or removed at any time. These features are experimental, and we make no guarantees about performance or functionality. | 提前体验尚未正式发布的功能。这些功能随时可能变更或移除，属于实验性质，我们不对性能或功能作任何保证。 | key:subtitle · main.js:4858403 | bundle 中带强 UI 键名 `subtitle`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Nothing said yet | 还没有内容 | main.js:5106026 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No content available for this resource | 此资源没有可用内容 | main.js:6651313 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No workspaces open. | 没有打开的工作区。 | main.js:7200747 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No active terminals. Click + to create one. | 没有活动终端。点击 + 新建一个。 | main.js:7557019 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | No plugins available. | 没有可用插件。 | key:message · main.js:7998922 | bundle 中带强 UI 键名 `message`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | No customizations match your search. | 没有符合搜索条件的自定义项。 | main.js:8053860 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No repositories found. Type to enter a custom path. | 找不到仓库。可输入自定义路径。 | main.js:8344020 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No instructions. | 暂无指令。 | main.js:8588383 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `REVIEW` | No events recorded. | 没有记录到事件。 | main.js:8607559 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | No instances yet. | 还没有实例。 | main.js:10779542 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Keeps working in this folder. Nothing is copied. | 继续在此文件夹中工作，不复制任何内容。 | key:tooltip · main.js:11113900 | bundle 中带强 UI 键名 `tooltip`：确定是 label/title/description 一类固定文案 |

### 向导/引导（10 条：ACCEPT 4 / REJECT 0 / REVIEW 6）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Complete Onboarding Step | 完成引导步骤 | key:label · norm-covered · main.js:1865296 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Choose the experience that fits how you work. | 选择适合你工作方式的体验。 | key:description · main.js:4730177 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Yes, I'd like to receive product updates, tips, and promotions from Google | 是的，我希望接收 Google 的产品更新、技巧和促销信息 | main.js:6852813 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Google）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Getting started with Google Antigravity | 开始使用 Google Antigravity | key:title · main.js:6855851 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Here's how you and your agents work together | 下面介绍你与智能体如何协同工作 | main.js:6856087 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | We'll tailor the experience to you. | 我们会为你量身定制体验。 | main.js:8002714 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Welcome to your Chief of Staff | 欢迎使用 Chief of Staff | main.js:8262540 | 句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文（命中：Chief of Staff）；缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | Pick a suggestion below to get started, or ask me anything. | 选择下方建议开始，或随便问我点什么。 | main.js:8262647 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `ACCEPT` | Announcements and tips | 公告与提示 | key:label · main.js:8321121 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Reset Onboarding | 重置引导流程 | main.js:10359558 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |

### 快捷键（8 条：ACCEPT 5 / REJECT 0 / REVIEW 3）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Enter to Send | 按 Enter 发送 | key:label · main.js:4606526 | bundle 中带强 UI 键名 `label`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Press keys... | 请按键... | main.js:4714741 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据；疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库；短裸串：可能是按钮/标签，也可能是枚举值或内部标识符 |
|   | `ACCEPT` | Edit Shortcut | 编辑快捷键 | key:label · norm-covered · main.js:4716887 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Add Shortcut | 添加快捷键 | key:label · norm-covered · main.js:4716985 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Remove Shortcut | 移除快捷键 | key:label · norm-covered · main.js:4717087 | 当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态 |
|   | `ACCEPT` | Describe what you want. Your agent plans and builds it, and brings in other agents when needed. | 描述你想要什么。智能体会规划并构建，需要时还会引入其他智能体。 | key:description · main.js:6854701 | bundle 中带强 UI 键名 `description`：确定是 label/title/description 一类固定文案 |
|   | `REVIEW` | Use Regular Expression (.*) | 使用正则表达式 (.*) | main.js:7575729 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |
|   | `REVIEW` | What best describes you? | 哪项最符合你的情况？ | main.js:8002617 | 缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据 |

### 通知（1 条：ACCEPT 1 / REJECT 0 / REVIEW 0）

| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |
|---|---|---|---|---|---|
|   | `ACCEPT` | Dismiss service announcement | 关闭服务公告 | key:title · main.js:8207478 | bundle 中带强 UI 键名 `title`：确定是 label/title/description 一类固定文案 |

