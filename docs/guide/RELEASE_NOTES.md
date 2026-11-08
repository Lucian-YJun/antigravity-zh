# Release v1.4.1: 补齐 2.29 新增英文，动态拼句不再漏译

本版把 Antigravity 2.29 以来仍显示英文的界面文案补齐：**词典 1267 → 1320 条**、
**规则 302 → 319 条**、**原生替换表 7 → 12 个**。

主要解决两类漏译：一类是界面新增的固定文案，另一类是**由代码拼出来的句子**——
后者逐字收录进词典根本收不到，只能靠规则。

## 1. 动态拼接的句子：只能靠规则兜

官方把一些句子拆成几段拼接，界面上看到的是完整一句，但源码里从来不存在这个完整字符串。

**项目删除确认框**（`xBb()`）：

```js
a > 0 && c.push(a === 1 ? "1 active conversation" : `${a} active conversations`)
b > 0 && c.push(b === 1 ? "1 archived conversation"  : `${b} archived conversations`)
return c.join(" and ")   // 句号由调用方补
```

也就是说「1 active conversations and 8 archived conversations.」这句话在 bundle 里
**一次都不出现**。新增规则兜住，单复数四种组合都能命中：

```
^(\d+) active conversations? and (\d+) archived conversations?\.?$
→ $1 个活动对话，$2 个归档对话。
```

**数量与进度类文案**同样如此，本轮补上 22 条规则：

| 形态 | 示例 |
|---|---|
| 相对时间（`mo` 优先于 `m`） | `4mo ago` → 4 个月前 / `58m ago` → 58 分钟前 |
| 加载更早的消息 | `Load older messages, showing 252 of 579` |
| 重试倒计时 | `Retrying in 5s` → 将在 5 秒后重试 |
| 分页/步骤/轮次 | `3 of 12`、`Step 2 of 7`、`Turn 4` |

顺带修掉三组「大小写/尾部标点变体会静默回落英文」的歧义组（`files changed`、
`allow once`、`it requires`），以及 `Toggle Full View` 规则里的 `[vV]e?iw` 拼写错误。

## 2. 设置与错误提示的固定文案（53 条）

| 分类 | 例子 |
|---|---|
| 设置分区与快捷键 | `Chat Width`、`Toggle Side Panel`、`Toggle Developer Tools`、`Zoom` |
| 错误与空状态 | `Invalid Media`、`Conversation unavailable`、`Send Now` |
| 对话与窗格 | `Restore Pane`、`Overview tab`、`Review tab`、`Skills Used` |
| 菜单项 | `New Window`、`Cut`、`Paste`、`Select All`、`Start Dictation` |

其中 `For Antigravity Business consumption options, see documentation.` 在源码里是
**三个独立文本节点**（前半句、`<a>documentation</a>`、句号），整句不会作为单个节点
出现，因此拆成「前半句」+「documentation」两条收录，而不是硬塞整句。

## 3. 原生替换覆盖面（7 → 12 个替换表）

新增 `cablev2`、`provisionSplash`、`qrEncoder`、`webauthn`、`wsl` 五张表，
并更新 `main` / `wizard`。这几处是 asar 里的原生代码文案，网页层词典覆盖不到。

> 上一版发布的包里只带了 7 张表，本次重新打包后是 12 张。若你之前装过 v1.4.0，
> 那次部署缺的正是这 5 张表的替换。

## 4. 引擎与工具链

- 翻译引擎精简（`zh-i18n.js` −149 行 / +24 行），行为不变，测试全绿。
- 移除已废弃的 `pkg` 打包链与对应测试；安装器只走 Rust 原生二进制。
- 发布链路加固：打包前校验 zip 与源码逐字节一致、缺 native 表直接失败。
- 新增 `auto-review` 自动预筛（三态 ACCEPT/REJECT/REVIEW），把「该不该翻」的
  重复判断交给脚本，人工只裁决灰区。

## 5. 验证

- `npm test` 全绿：静态体检、主程序、页面翻译器、词典压缩回归、TreeWalker 对抗、
  M2 边缘用例、empirical 压测、cargo test/clippy，全部 0 失败。
- 发布包 `verify-release` 报告 **20/20 条目与当前源码逐字节一致**。
- 新增词条全部补了断言：同时核对 exact 命中与真实 `tr()` 产物，
  防止写进词典却被规则改写、或日后压缩词典时被悄悄删掉。

## 升级方式

下载本版 zip 解压，先运行 `一键还原.bat`（清除旧版部署）再运行 `一键安装.bat`。
新安装器会自动识别已打补丁的旧部署。

只想更新词典、不想动安装目录的，可以直接双击 `快速同步词典.bat`。

## 已知边界

- 若本机 Antigravity 正在运行，安装器会拒绝执行并提示先退出（不强制关进程）。
- 词典热同步的「实时推送」需要客户端开着 DevTools 端口；不满足时只会更新文件，
  下次切换视图或重启生效。
