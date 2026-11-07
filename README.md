# Antigravity 中文汉化补丁

给 Antigravity 的界面换上中文。做法是把 Electron 的 asar 解开，往里面注入一份翻译引擎和词典，客户端启动时跟着加载。词典改了不用重启，主进程会盯着文件变动，把新词条推到所有窗口。

---

## 装上去

去 [Releases 页面](https://github.com/Lucian-YJun/antigravity-zh/releases) 拿最新的 `Antigravity-zh-patch-v*.zip`，解压后有三件事要做：先把 Antigravity 完全退出（右下角托盘图标也要关掉），再双击 `一键安装.bat`，看到成功提示后重新打开客户端。

安装包里的 `Antigravity-zh.exe` 是 Rust 写的原生安装器，不需要 Node.js，也不用联网装依赖。要是双击后提示找不到这个 exe，说明压缩包没解全，重新下载一遍就好。

官方推送客户端更新后，汉化会被覆盖，再跑一次 `一键安装.bat`。想换回英文原版，双击 `一键还原.bat`。

---

## 为什么单独做了这一版

老的汉化补丁在复杂界面下有几个挺烦人的毛病：菜单和弹窗先闪一下英文才跳成中文；代码块一多、对话一长，高频遍历 DOM 就把界面拖得掉帧；打字的时候输入法状态被打断，吞字、跳字都遇到过。

这一版就是冲着这些细节改的。

页面刚加载时先翻可视区内的文本，首屏尽量直接是中文。剩下的节点按时间片分批补，每批处理有限个文本节点就把控制权还给浏览器，再继续下一批。一次挂上千个文本节点的界面，整页翻完要几秒，期间页面照常能点，不会被一次全树遍历卡住。

碰到 Monaco Editor、CodeMirror、`<pre>`、`<code>`、xterm 终端这类容器，TreeWalker 直接 `FILTER_REJECT` 跳过整棵子树，里面成千上万个代码 Token 一个都不查。遍历耗时从近百毫秒压到几毫秒。

已经翻过的中文和界面自带的中文，靠首字符编码区间判断直接放行，连正则都不走。代码变量和没收录的英文词条走双代轮转 Set 缓存，单代存满 2000 项就平滑换代，总量压在 4000 项以内，既不会因为一个 Set 撑满导致缓存击穿，也不会在长会话里攒出一堆内存。

输入法这块监听 `compositionstart`、`compositionend` 和 `blur`，拼音打字和候选字切换期间冻住文本替换。前端框架偶尔会把某个节点反复回写成英文，补丁给这种节点加了个 500ms 的熔断冷却，先停手，等它稳定了再试，不会因为一次冲突就彻底放弃这个节点。

翻译用语想自己调，直接改 `src/cockpit-zh.json` 保存，双击 `快速同步词典.bat`，一两秒后界面就换新词，不用重启客户端。

---

## 目录里都有什么

```text
antigravity-zh/
├── Antigravity-zh.exe         # 安装器，Rust 原生，用户拿到的就是它
├── 一键安装.bat               # 打补丁
├── 一键还原.bat               # 还原英文原版
├── 快速同步词典.bat           # 免重启同步自定义词条
├── src/
│   ├── zh-i18n.js             # 注入客户端的翻译引擎
│   ├── cockpit-zh.json        # 词典和动态正则规则表
│   └── native/                # Electron 菜单等原生进程的替换表
├── scripts/                   # 打包、发版、词典维护、找漏译的工具
│   ├── package-release.js     # 生成发布用 zip
│   ├── publish-release.js     # 调 GitHub API 建 Release 并传产物
│   ├── add-terms.js           # 加词条（先过冗余体检）
│   └── scan-ui.js             # 扫界面上还没翻的英文
├── rust/                      # 上面那个 exe 的源码
└── tests/                     # 自动化测试与性能基准
```

发布 zip 里只装 exe、三个 .bat、`src/` 和两份说明文档，`scripts/` 和 `rust/` 都不进去。用户端跑的是 Rust 安装器，`scripts/` 是维护仓库用的，跟安装过程无关。

---

## 自己改词典

改词条别直接改 JSON，用 `scripts/add-terms.js`：把英文原文一行一条写进 `draft.txt`，`npm run add-terms draft.txt -- --dry-run` 先看一遍，没问题再 `npm run add-terms draft.txt` 写入，它会自动跑一遍词典体检。改完 `npm run sync` 推到已安装的客户端，一两秒热载生效。

想找界面上还漏着的英文，`node scripts/scan-ui.js <CDP端口>` 扫一遍。结果里会混进项目名、对话标题、分支名和品牌词，哪些该翻得自己判断，别整批入库。

---

## 从源码跑与验证

熟悉 Node.js 的话可以拉仓库跑源码。`npm install` 装好依赖，`npm test` 会按 `package.json` 里登记的顺序把全套测试跑完，每个脚本结束都会打印通过和失败的条数，以实际输出为准。里面既有 Node 侧的模块单测，也有 `cargo test` / `clippy`，还有拿真二进制跑的对抗套件；替换引擎的 Node 实现和 Rust 的 Aho-Corasick 契约有随机对拍，改动任一侧都要同步另一侧。

发版前 `npm run build` 会先编译 Rust release 产物再打 zip，`npm run test:release` 额外挂上依赖审计、对抗套件和性能基准。发布动作本身由 `scripts/publish-release.js` 完成，它会先确认本地 HEAD 和远端 `origin/main` 一致，避免把 Release 打在旧的 main 上。

单独跑某一段也行：

```bash
npm run test:dict      # 词典静态格式与规则校验
npm run test:main      # 主进程注入与菜单逻辑
npm run test:page      # 页面翻译、剪枝、输入法隔离
npm run test:process   # 进程检测解析与回归
npm run bench          # 性能基准
```

---

## 许可与致谢

基础词典和原生替换规则参考了 [oljh0/AntigravityChinese](https://github.com/oljh0/AntigravityChinese)，MIT 协议。这个项目是非官方补丁，学习交流用。
