# Antigravity 中文汉化补丁 (Next-Gen)

本项目为 Google Antigravity 提供全面、高质量的界面汉化。

## 核心特性 (Next-Gen 专属增强)

基于标准的 Electron 资源解包机制构建，并在前端渲染与词典调度上进行了体验优化：

1. **同帧翻译无闪烁 (Zero-Flicker)**
   - 彻底告别原版弹窗、打开菜单时“先显示英文，闪烁一下再变中文”的糟糕体验。
   - 独家调优的 `MutationObserver` 双轨机制：对 <=30 节点的轻量级 DOM 变动走同步遍历渲染，在浏览器绘制前瞬间完成替换；大体积重绘走 60ms 缓冲，确保 UI 流畅不卡顿。

2. **词典热监听推送 (Hot-Reload)**
   - 告别每次修改词典都需要手动 `Ctrl+R` 重启界面的烦恼。
   - 主进程引入 `fs.watch`，精准监听词典文件 `cockpit-zh.json`，保存后 200ms 自动通过 IPC 将数据推送到所有窗口静默生效，翻译调试如丝般顺滑。

3. **650 条精准词条（629 条精确词条 + 21 条正则规则，持续增补）**
   - 精细打磨的专属中文词典。
   - 摒弃全局机翻引发的语法破碎（修复了诸如 `No projects found -> 否 projects found` 等著名误伤）。
   - 加入了严格的标签黑名单（`<code>`、`<pre>`），保障用户的聊天代码块绝对原汁原味。

4. **正则规则预编译 (compileRules)**
   - 页面初始化与热载时统一预编译正则规则，避免在 DOM 遍历热路径中频繁创建 RegExp 对象，大幅降低内存开销并消除微卡顿，和原生一样丝滑。

## 项目结构

```text
antigravity-zh/
├── 一键安装.bat                   # 双击一键安装（自动装依赖并打补丁）
├── 一键还原.bat                   # 双击一键还原官方原版
├── 快速同步词典.bat               # 双击免重启热同步词典
├── src/
│   ├── zh-i18n.js                 # 核心翻译引擎 (含同帧调度与热推送机制)
│   ├── cockpit-zh.json            # 动态词典与正则规则 (629 词条 + 21 正则)
│   └── native/                    # Electron 原生菜单替换表
├── scripts/
│   ├── patch.js                   # 一键注入与还原脚本 (纯 Node.js)
│   └── sync-dict.js               # 词典快速热同步脚本
└── tests/                         # 自动化测试套件
```

## 使用指南

你可以根据自己的喜好，选择以下两种安装方式之一：

### 方式一：传统批处理文件 .bat（含 Node.js）

在 GitHub 页面点击 **Code -> Download ZIP** 下载解压后：
1. **完全退出** Antigravity（请确保系统托盘右下角的图标也已退出）。
2. 双击运行 `一键安装.bat`（首次自动安装依赖并打入汉化补丁）。
3. 等待黑色窗口提示“安装完成”后，重新打开 Antigravity 即可！

*(若需还原英文，双击 `一键还原.bat` 即可)*

### 方式二：独立可执行程序 .exe（免 Node.js）

1. 前往 [Releases](../../releases) 页面，下载最新的 `Antigravity汉化补丁.exe`。
2. **完全退出** Antigravity（确保系统托盘右下角的图标也已退出）。
3. 双击运行 `Antigravity汉化补丁.exe`。
4. 在弹出的黑色窗口中，输入 `1` 并回车，等待提示“安装完成”。
5. 重新打开 Antigravity，即可享受全中文界面！

## 进阶玩法：自定义词典与热更新

如果你对部分翻译不满意，可以自己修改：

**如果你使用的是方式一 (.bat)：**
1. 打开 `src/cockpit-zh.json`，修改你想要的词条，保存文件。
2. 双击运行 `快速同步词典.bat`。
3. 汉化文本将在 1~2 秒内自动刷新到软件中，**无需重启应用**！

**如果你使用的是方式二 (.exe)：**
1. 在 `Antigravity汉化补丁.exe` 所在的文件夹里，放一个名为 `cockpit-zh.json` 的文件（可以从源码包里提取）。
2. 用记事本打开它，修改你想要的词条，然后保存。
3. 双击运行 `Antigravity汉化补丁.exe`，输入 `2` 选择“热更新词典”。
4. 汉化文本将在 1~2 秒内自动刷新到软件中，**无需重启应用**！

## 开发者模式 (源码运行)

如果你不想使用 `.exe`，也可以直接通过源码和 Node.js 环境运行：

```bash
npm install        # 首次使用，安装依赖
npm run patch      # 打汉化补丁（自动检测安装路径，全程失败安全）
npm run repatch    # 应用更新后一键恢复：自动优雅关闭→打补丁→重新打开
npm run sync       # 词典快速热同步（无需重打补丁或退出软件）
npm run unpatch    # 还原英文原版
npm run build      # 打包生成 .exe
node scripts/patch.js --dry-run   # 预览匹配情况，不改动任何文件
```

打补丁前请完全退出 Antigravity（含系统托盘图标），脚本会自行检测。

## 测试

```bash
npm install        # 首次使用
npm run test:main  # 主程序模块测试（7 项）
npm run test:page  # 页面翻译器集成测试（11 项，需 jsdom）
```

## 许可与致谢

本项目基于 [oljh0/AntigravityChinese](https://github.com/oljh0/AntigravityChinese)（MIT 协议）修改增强，
词典与原生替换表源自该项目，翻译引擎经本地 fork 改进（同帧翻译 + 词典热载）。
详见 LICENSE。第三方非官方补丁，仅供学习交流，使用自担风险。
