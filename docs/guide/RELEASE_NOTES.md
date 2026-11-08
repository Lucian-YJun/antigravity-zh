# Release v1.4.2: 修复仅归档对话的计数漏译

修一个 v1.4.1 引入的边界漏译，并顺手修掉一个会让构建守卫误报的时间戳问题。

## 1. 修复：项目只有归档对话时，副标题仍是英文

Codex 在 PR #10 上指出（P2）：项目删除确认框的副标题由 `xBb()` 拼接，只有 `count > 0`
才会 push 对应子句：

```js
a > 0 && c.push(a === 1 ? "1 active conversation" : `${a} active conversations`)
b > 0 && c.push(b === 1 ? "1 archived conversation"  : `${b} archived conversations`)
return c.join(" and ")
```

v1.4.1 加的规则要求两段都在，因此**项目里一个活动对话都没有、只剩归档对话**时，
副标题只有 `N archived conversations.`，规则命中不了，这行一直是英文。

修复前用真实注入的 `tr()` 实测：

```
active=0 archived=3  "3 archived conversations."  -> null   ← 漏译
active=0 archived=1  "1 archived conversation."   -> null   ← 漏译
```

新增规则兜住这一形态，译文口径与既有的 active 单段规则一致：

```
^(\d+) archived conversations?\.?$
→ $1 个归档对话。
```

现在 8 种组合全部能译出：

| active | archived | 界面原文 | 译出 |
|---|---|---|---|
| 1 | 8 | `1 active conversation and 8 archived conversations.` | 1 个活动对话，8 个归档对话。 |
| 3 | 1 | `3 active conversations and 1 archived conversation.` | 3 个活动对话，1 个归档对话。 |
| 0 | 3 | `3 archived conversations.` | 3 个归档对话。 |
| 0 | 1 | `1 archived conversation.` | 1 个归档对话。 |
| 3 | 0 | `3 active conversations.` | 3 个活动对话。 |
| 1 | 0 | `1 active conversation.` | 1 个活动对话。 |

并补了单复数两条真实 `tr()` 回归用例，防止以后再被压缩掉。

## 2. 修复：构建守卫的时间戳误报

`scripts/build-rust-artifact.js` 用 `copyFileSync` 把 cargo 产物复制到 `dist/`，
但该 API **不刷新目标 mtime**（Windows 上沿用源的写入时间）。当 cargo 判定源码未变、
不重新链接时，源产物时间戳停在旧值，复制过去仍是旧的，于是
`test-empirical-challenger-m1-cli.js` 里「二进制不比 Rust 源码旧」这条守卫会误报。

改为复制后显式 `utimesSync` 对齐到复制时刻。

> 这是让守卫如实反映「本次 build:rust 已把当前产物放到 dist/」，**守卫本身的判定逻辑没有放宽**。

## 3. 验证

- `npm test` 全绿：词典压缩回归 137 通过（含新增 2 条），其余套件 0 失败。
- `verify-release` 报告 **20/20 条目与当前源码逐字节一致**。
- 安装器 `--version` 输出 `antigravity-tool 1.4.2`。

## 升级方式

下载本版 zip 解压，先运行 `一键还原.bat`（清除旧版部署）再运行 `一键安装.bat`。

只想更新词典、不想动安装目录的，可以直接双击 `快速同步词典.bat`。

## 已知边界

- 若本机 Antigravity 正在运行，安装器会拒绝执行并提示先退出（不强制关进程）。
- 词典热同步的「实时推送」需要客户端开着 DevTools 端口；不满足时只会更新文件，
  下次切换视图或重启生效。
