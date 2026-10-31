#!/usr/bin/env node

/**
 * 词典与翻译组件热同步：
 * 1. 同步 src/cockpit-zh.json 到已安装目录 zh-patch/
 * 2. 同步 src/zh-i18n.js 到已安装目录 zh-patch/
 * 3. 若检测到正在运行的 Antigravity 实例（DevTools 端口），直接通过 CDP 将新词典注入所有窗口并全量重译，确保 100% 即时生效！
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 端口文件里记录的端口可能被本机任意程序抢注，所有网络等待都必须有上限，
// 否则脚本会在错误的对端上永久挂住，用户既拿不到结果也看不到报错。
const CONNECT_TIMEOUT_MS = 3000;

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

// Antigravity 的界面只来自打包内的 file:// 页面、本机回环上的开发服务器或自带的 plugin:// 面板；
// 内置浏览器里的外部网页不是汉化目标，注入脚本也只会返回 false。
function isAntigravityPage(pageUrl) {
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return false;
  }
  if (u.protocol === 'file:') return true;
  if (u.protocol === 'plugin:') return u.hostname.startsWith('antigravity-');
  if (u.protocol === 'http:' || u.protocol === 'https:') return isLoopbackHost(u.hostname);
  return false;
}

// 调试连接必须仍然落在端口文件指向的那个回环端口上，否则说明 target 列表被改写过
function isTrustedDebuggerUrl(wsUrl, port) {
  let u;
  try {
    u = new URL(wsUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return false;
  return isLoopbackHost(u.hostname) && u.port === String(port);
}

// 被测试 require 时只导出纯函数，不执行同步流程。
// 本脚本顶层会复制文件、发起网络请求，没有守卫的话任何 require 都会改动安装目录。
// pkg 打包后的 exe 里 process.pkg 有值，因此始终走下面的主流程。
const DETECT_ONLY = !process.pkg && require.main !== module;
if (DETECT_ONLY) {
  module.exports = { isLoopbackHost, isAntigravityPage, isTrustedDebuggerUrl };
}

if (!DETECT_ONLY) {

// ws 是正式依赖；缺失时必须大声说明，否则「已同步」的提示会让人误以为热更新生效了
function loadWebSocket() {
  try {
    return require('ws');
  } catch {
    console.error('⚠️ 缺少依赖 ws，词典无法实时推送，请先在补丁目录运行: npm install');
    return null;
  }
}

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

const exeDir = path.dirname(process.execPath);
let sourceDict = path.join(__dirname, '../src/cockpit-zh.json');
let sourceI18n = path.join(__dirname, '../src/zh-i18n.js');

if (fs.existsSync(path.join(exeDir, 'cockpit-zh.json'))) {
  sourceDict = path.join(exeDir, 'cockpit-zh.json');
} else if (fs.existsSync(path.join(exeDir, 'src', 'cockpit-zh.json'))) {
  sourceDict = path.join(exeDir, 'src', 'cockpit-zh.json');
}

// 1. 复制词典与翻译引擎组件
fs.copyFileSync(sourceDict, path.join(kitDir, 'cockpit-zh.json'));
if (fs.existsSync(sourceI18n)) {
  fs.copyFileSync(sourceI18n, path.join(kitDir, 'zh-i18n.js'));
}
console.log('✅ 词典与翻译引擎文件已复制到应用目录。');

// 2. 检测并直连活动窗口主动推送

function degrade() {
  console.log('💡 词典文件已同步，应用将在下次切换视图或重启时使用新词典。');
}

function fetchTargets(port, done) {
  let settled = false;
  let deadline;
  const finish = (targets) => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    done(targets);
  };
  // socket 超时只约束单次读写的空闲时间，对端逐字节喂数据仍能拖住脚本，所以再加一道总时限
  deadline = setTimeout(() => {
    req.destroy();
    finish(null);
  }, CONNECT_TIMEOUT_MS);
  const req = http.get(`http://127.0.0.1:${port}/json`, { timeout: CONNECT_TIMEOUT_MS }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      let targets;
      try {
        targets = JSON.parse(raw);
      } catch {
        return finish(null);
      }
      finish(Array.isArray(targets) ? targets : null);
    });
    res.on('error', () => finish(null));
  });
  req.on('timeout', () => {
    req.destroy();
    finish(null);
  });
  req.on('error', () => finish(null));
}

function pushToPages(WebSocketCtor, pages, dictData) {
  // rev 作为第二参数下发：新版页面据此丢弃过期词典，旧版页面忽略多余参数，行为不变
  const rev = Date.now();
  const code = `
                  (function() {
                    if (window.__antigravityZh && window.__antigravityZh.setData) {
                      window.__antigravityZh.setData(${JSON.stringify(dictData)}, ${rev});
                      window.__antigravityZh.retranslate();
                      return true;
                    }
                    return false;
                  })()
                `;
  let pending = pages.length;
  let updated = 0;

  const settle = () => {
    pending--;
    if (pending > 0) return;
    if (updated > 0) {
      console.log(`⚡ 成功向 ${updated} 个活动窗口实时推送最新词典并完成全量重译！`);
    } else {
      degrade();
    }
  };

  pages.forEach((page) => {
    let done = false;
    let timer;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle();
    };

    let ws;
    try {
      ws = new WebSocketCtor(page.webSocketDebuggerUrl);
    } catch {
      return finish();
    }

    timer = setTimeout(() => {
      finish();
      try {
        ws.terminate();
      } catch { /* 连接可能已经自行关闭 */ }
    }, CONNECT_TIMEOUT_MS);

    ws.on('open', () => {
      clearTimeout(timer);
      // 连上之后再给一次等待响应的上限，避免对端握手后不发消息把脚本挂住
      timer = setTimeout(() => {
        finish();
        try {
          ws.terminate();
        } catch { /* 同上 */ }
      }, CONNECT_TIMEOUT_MS);
      ws.send(JSON.stringify({
        id: 999,
        method: 'Runtime.evaluate',
        params: { expression: code, returnByValue: true },
      }));
    });

    ws.on('message', (raw) => {
      // 只有页面真的执行了 setData 才算推送成功；返回 false 说明页面没有翻译引擎
      let ok = false;
      try {
        ok = JSON.parse(raw).result.result.value === true;
      } catch { /* 非预期响应按失败处理 */ }
      if (ok) updated++;
      finish();
      try {
        ws.close();
      } catch { /* 同上 */ }
    });

    ws.on('error', finish);
    ws.on('close', finish);
  });
}

const portFile = path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort');
if (!fs.existsSync(portFile)) {
  degrade();
} else {
  let port = NaN;
  try {
    port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(), 10);
  } catch { /* 文件可能正被写入，按「未运行」处理 */ }

  // Node 22+ 自带全局 WebSocket（EventTarget 风格，无 .on），必须显式用 ws 模块的实现
  const WebSocketCtor = Number.isInteger(port) && port > 0 && port <= 65535 ? loadWebSocket() : null;
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
      pushToPages(WebSocketCtor, pages, dictData);
    });
  }
}

} // if (!DETECT_ONLY)
