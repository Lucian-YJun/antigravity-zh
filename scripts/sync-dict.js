#!/usr/bin/env node

/**
 * 词典与翻译组件热同步：
 * 1. 同步 src/cockpit-zh.json 到已安装目录 zh-patch/
 * 2. 同步 src/zh-i18n.js 到已安装目录 zh-patch/
 * 3. 若检测到正在运行的 Antigravity 实例（DevTools 端口），直接通过 CDP 将新词典注入所有窗口并全量重译，确保 100% 即时生效！
 */

const fs = require('fs');
const path = require('path');
const cdpClient = require('./lib/cdp-client');
const env = require('./lib/env');

const { isLoopbackHost, isAntigravityPage, isTrustedDebuggerUrl } = cdpClient;

// 同步流程会复制文件、发起网络请求，所以只有「直接执行」或「显式调用 runSync()」
// 时才运行 —— 任何一次 require 都不该改动安装目录。
// 内嵌 exe 里由 patch.js 的 --sync 分支调用 runSync()。
const IS_ENTRY = require.main === module;

const { loadWebSocket, readDevToolsPort, fetchTargets, pushToPages } = cdpClient;

function runSync() {
const { resolveSourceAssets } = env;

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  console.error('❌ 找不到 LOCALAPPDATA 环境变量。');
  process.exit(1);
}
const kitDir = path.join(localAppData, 'Programs', 'antigravity', 'resources', 'zh-patch');
if (!fs.existsSync(kitDir)) {
  console.error('❌ 未找到已安装的 zh-patch 组件，请先运行: npm run patch');
  process.exit(1);
}

const { sourceDict, sourceI18n } = resolveSourceAssets(path.resolve(__dirname, '..'), path.dirname(process.execPath));

// 0. 先校验词典能解析，再动安装目录。
// 顺序很关键：旧版先 copyFileSync 再在 CDP 分支里 JSON.parse，于是手工改词典时
// 多打一个逗号就会用坏文件覆盖掉安装目录里能用的那份，而本脚本一声不响——
// 用户只看到界面变回英文。AGENTS.md 明确鼓励用户直接改 JSON，这条路必须守住。
let dictData;
try {
  dictData = JSON.parse(fs.readFileSync(sourceDict, 'utf8'));
} catch (err) {
  console.error(`❌ 词典不是合法 JSON，已中止同步（安装目录未被改动）: ${sourceDict}`);
  console.error(`   ${err.message}`);
  process.exit(1);
}
if (!dictData || typeof dictData !== 'object' || !dictData.dict || typeof dictData.dict !== 'object') {
  console.error(`❌ 词典缺少 dict 字段，已中止同步（安装目录未被改动）: ${sourceDict}`);
  process.exit(1);
}

// 1. 复制词典与翻译引擎组件
fs.copyFileSync(sourceDict, path.join(kitDir, 'cockpit-zh.json'));
if (fs.existsSync(sourceI18n)) {
  fs.copyFileSync(sourceI18n, path.join(kitDir, 'zh-i18n.js'));
}
console.log(`✅ 词典（${Object.keys(dictData.dict).length} 条）与翻译引擎文件已复制到应用目录。`);

// 2. 检测并直连活动窗口主动推送
function degrade() {
  console.log('💡 词典文件已同步，应用将在下次切换视图或重启时使用新词典。');
}

const port = readDevToolsPort();
if (!port) {
  degrade();
} else {
  const WebSocketCtor = loadWebSocket();
  if (!WebSocketCtor) {
    degrade();
  } else {
    fetchTargets(port, (targets) => {
      if (!targets) return degrade();
      const pages = targets.filter(t => t
        && t.type === 'page'
        && isAntigravityPage(t.url)
        && isTrustedDebuggerUrl(t.webSocketDebuggerUrl, port));
      if (pages.length === 0) {
        console.log('💡 词典文件已就绪。');
        return;
      }
      let dictData;
      try {
        dictData = JSON.parse(fs.readFileSync(sourceDict, 'utf8'));
      } catch {
        return degrade();
      }
      pushToPages(WebSocketCtor, pages, dictData).then(updated => {
        if (updated > 0) {
          console.log(`⚡ 成功向 ${updated} 个活动窗口实时推送最新词典并完成全量重译！`);
        } else {
          degrade();
        }
      });
    });
  }
}

}

module.exports = {
  isLoopbackHost,
  isAntigravityPage,
  isTrustedDebuggerUrl,
  runSync,
};

if (IS_ENTRY) {
  runSync();
}
