# 可独立摘出的补丁

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
git apply patches/r1-watch-crash-guard.patch
```

该补丁与 `0e36578` 中同名的代码块逐字节一致；拆分出来只是为了让这个
高危修复能独立评审与合并。
