# Release v1.4.2: 修复仅归档对话的计数漏译，构建守卫改用源码摘要

修一个 v1.4.1 引入的边界漏译；另外把「二进制是否对应当前源码」这条守卫的判据
从 mtime 换成源码内容摘要 —— 原来那条路既会因 git 检出而误报，也会因刷新时间戳而
放过真正过期的产物。

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

## 2. 修复：构建守卫改为比对源码内容摘要

`test-empirical-challenger-m1-cli.js` 里有一条守卫，用来防止「改过 Rust 源码却忘了重新构建，
测试却全绿」。它原先按 **mtime** 判断 dist 里的二进制是否比源码旧，这条路两个方向都不成立：

- `git checkout` / `git pull` 会把未改动的源文件重写一遍，时间变新而内容没变 →
  **误报**「二进制过期」；
- 反过来，为了让误报消失而把产物 mtime 刷成「现在」 → 「cargo 判定源码未变、没有重新链接、
  产物其实还是旧的」这种真问题被一并掩盖，**守卫永远通过、等于失效**。

所以判据改成比**内容**：新增 `scripts/lib/rust-source-digest.js`，把 `rust/` 下所有
`.rs` / `.toml` / `.lock`（排除 `target/`、`.git/`）按相对路径**排序**后，连同路径与长度
一起哈希出 sha256 摘要。构建时写进 `dist/build-manifest.json`，测试拿它和当前源码树比对。

排序保证结果可复现；把路径与长度一起喂进哈希，避免「文件 A 的结尾 + 文件 B 的开头」
拼出同一串的碰撞。

> 构建脚本**不再改动**产物 mtime。产物的时间戳是否新鲜不再参与任何判断。

守卫有效性实测（脚本临时改源码，`try/finally` 还原）：

| 场景 | 结果 |
|---|---|
| 未改源码 | 通过 |
| 改动 Rust 源码、不重新构建 | **正确报错** |
| 源码还原 | 通过 |
| 仅 mtime 变新、内容未变 | 通过（不再误报） |

第二行是关键：真过期产物会被拦下；第四行说明 git 检出引起的 mtime 变化不再造成误报。
另外补了 `tests/test-rust-source-digest.js`（8 条，已接入 `test:lib`）覆盖摘要的可复现性、
内容敏感性、`target/` 与 `.git/` 排除、文件增删、路径参与哈希等。

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
