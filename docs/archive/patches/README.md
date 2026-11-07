# 可独立摘出的补丁（历史留存，已合入主线，归档于 docs/archive/patches/）

> ⚠️ **本目录下的补丁已经全部合入 `src/zh-i18n.js` 主线，不要再 `git apply`。**
>
> 实测 `git apply --check docs/archive/patches/r1-watch-crash-guard.patch` 与
> `git apply --check --reverse` **双向都失败**——因为 `src/zh-i18n.js` 早已
> 前进到补丁之外的版本。修复本身在主线里的位置：
>
> - `startMtimePoll` — `src/zh-i18n.js:771`
> - `startDictionaryWatch`（含 `watcher.on('error')` 兜底）— `src/zh-i18n.js:796`、`:808`
> - `attachWebTranslator` 的调用点与 `closed` 清理 — `src/zh-i18n.js:846`
> - 配套测试 — `tests/test-watch-robustness.js`
>
> 保留本目录只为历史评审记录。仓库里没有任何脚本、测试或打包清单引用它。

这里的补丁对应**跨文件耦合、无法整体 cherry-pick** 的单个修复，
用于把高风险的小改动单独先合，而不必等待同提交里的其它改动。

## r1-watch-crash-guard.patch

修复 `src/zh-i18n.js` 中 `fs.watch` 的未捕获 `error` 事件。
`FSWatcher` 的 error 是异步事件，外层 `try/catch` 接不住，未处理时会以
unhandled error 终止进程。这段代码注入的是 Antigravity 主进程，触发后
整个 IDE 会消失。

- 基线：`src/zh-i18n.js` 在提交 `4a90f1c` 时的版本
- 内容：`startMtimePoll` / `startDictionaryWatch` 两个函数，
  `attachWebTranslator` 改用它们并为窗口注册 `closed` 清理
- 配套测试：`tests/test-watch-robustness.js`（同目录可一并摘出）
- 规模：约 90 行

应用方式（在仓库根目录）：

```bash
git apply docs/archive/patches/r1-watch-crash-guard.patch
```

该补丁与 `0e36578` 中同名的代码块逐字节一致；拆分出来只是为了让这个
高危修复能独立评审与合并。
