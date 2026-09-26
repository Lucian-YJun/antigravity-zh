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
const portFile = path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort');
if (fs.existsSync(portFile)) {
  try {
    const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    const port = parseInt(lines[0].trim(), 10);
    if (port > 0) {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const targets = JSON.parse(raw);
            const pages = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (pages.length === 0) {
              console.log('💡 词典文件已就绪。');
              return;
            }

            let WebSocket;
            try {
              WebSocket = require('ws');
            } catch {
              console.log('💡 词典已同步，应用将在下次切换视图或重启时使用新词典。');
              return;
            }

            const dictData = JSON.parse(fs.readFileSync(sourceDict, 'utf8'));
            let updatedCount = 0;

            pages.forEach((page) => {
              const ws = new WebSocket(page.webSocketDebuggerUrl);
              ws.on('open', () => {
                const code = `
                  (function() {
                    if (window.__antigravityZh && window.__antigravityZh.setData) {
                      window.__antigravityZh.setData(${JSON.stringify(dictData)});
                      window.__antigravityZh.retranslate();
                      return true;
                    }
                    return false;
                  })()
                `;
                ws.send(JSON.stringify({
                  id: 999,
                  method: 'Runtime.evaluate',
                  params: { expression: code, returnByValue: true }
                }));
              });

              ws.on('message', () => {
                updatedCount++;
                ws.close();
                if (updatedCount === pages.length) {
                  console.log(`⚡ 成功向 ${pages.length} 个活动窗口实时推送最新词典并完成全量重译！`);
                }
              });

              ws.on('error', () => {});
            });
          } catch (e) {
            console.log('💡 词典文件已同步。');
          }
        });
      }).on('error', () => {
        console.log('💡 词典文件已同步。');
      });
    }
  } catch {
    console.log('💡 词典文件已同步。');
  }
} else {
  console.log('💡 词典文件已同步。');
}
