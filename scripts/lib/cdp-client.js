const fs = require('fs');
const path = require('path');
const http = require('http');

const CONNECT_TIMEOUT_MS = 3000;

/**
 * 校验 host 是否属于本机回环地址（127.0.0.1, localhost, ::1）。
 * @param {string} hostname
 * @returns {boolean}
 */
function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/**
 * 判断页面 URL 是否属于 Antigravity 界面（file://, plugin://antigravity-*, 回环 http/https）。
 * @param {string} pageUrl
 * @returns {boolean}
 */
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

/**
 * 校验 WebSocket 调试 URL 是否属于指定端口的回环地址。
 * @param {string} wsUrl
 * @param {number|string} port
 * @returns {boolean}
 */
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

/**
 * 从 APPDATA 下读取 DevToolsActivePort 端口。
 * @param {string} [customAppData]
 * @returns {number | null}
 */
function readDevToolsPort(customAppData) {
  const appData = customAppData !== undefined ? customAppData : (process.env.APPDATA || '');
  const portFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) return null;
  try {
    const port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(), 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
  } catch {
    return null;
  }
}

/**
 * 动态加载 ws 模块。
 * @returns {any | null}
 */
function loadWebSocket() {
  try {
    return require('ws');
  } catch {
    console.error('⚠️ 缺少依赖 ws，词典无法实时推送，请先在补丁目录运行: npm install');
    return null;
  }
}

/**
 * 请求 http://127.0.0.1:<port>/json 获取所有目标页面。
 * 支持回调或 Promise 风格。
 * @param {number} port
 * @param {((targets: any[] | null) => void) | number} [doneOrTimeout]
 * @returns {Promise<any[] | null> | void}
 */
function fetchTargets(port, doneOrTimeout) {
  const callback = typeof doneOrTimeout === 'function' ? doneOrTimeout : null;
  const timeout = typeof doneOrTimeout === 'number' ? doneOrTimeout : CONNECT_TIMEOUT_MS;

  const exec = (resolve) => {
    let settled = false;
    let req = null;
    let deadline = null;
    const finish = (targets) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      resolve(targets);
    };

    deadline = setTimeout(() => {
      if (req) req.destroy();
      finish(null);
    }, timeout);

    req = http.get(`http://127.0.0.1:${port}/json`, { timeout }, (res) => {
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
  };

  if (callback) {
    exec(callback);
    return;
  }
  return new Promise(exec);
}

/**
 * 通过 WebSocket 向目标页面主动推送最新词典并调用重译。
 * @param {any} WebSocketCtor
 * @param {any[]} pages
 * @param {any} dictData
 * @param {number} [rev=Date.now()]
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<number>}
 */
function pushToPages(WebSocketCtor, pages, dictData, rev = Date.now(), timeoutMs = CONNECT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!pages || pages.length === 0) {
      resolve(0);
      return;
    }
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
      resolve(updated);
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
      }, timeoutMs);

      ws.on('open', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          finish();
          try {
            ws.terminate();
          } catch { /* 同上 */ }
        }, timeoutMs);
        ws.send(JSON.stringify({
          id: 999,
          method: 'Runtime.evaluate',
          params: { expression: code, returnByValue: true },
        }));
      });

      ws.on('message', (raw) => {
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
  });
}

module.exports = {
  CONNECT_TIMEOUT_MS,
  isLoopbackHost,
  isAntigravityPage,
  isTrustedDebuggerUrl,
  readDevToolsPort,
  loadWebSocket,
  fetchTargets,
  pushToPages,
};
