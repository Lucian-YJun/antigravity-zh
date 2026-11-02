const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  isLoopbackHost,
  isAntigravityPage,
  isTrustedDebuggerUrl,
  readDevToolsPort,
  fetchTargets,
} = require('../scripts/lib/cdp-client');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`PASS  ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`FAIL  ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

// 1. isLoopbackHost 测试
test('isLoopbackHost: 识别标准 IPv4/IPv6 回环与大小写形式', () => {
  assert.strictEqual(isLoopbackHost('127.0.0.1'), true);
  assert.strictEqual(isLoopbackHost('localhost'), true);
  assert.strictEqual(isLoopbackHost('LOCALHOST'), true);
  assert.strictEqual(isLoopbackHost('LocalHost'), true);
  assert.strictEqual(isLoopbackHost('::1'), true);
  assert.strictEqual(isLoopbackHost('[::1]'), true);

  assert.strictEqual(isLoopbackHost(''), false);
  assert.strictEqual(isLoopbackHost(null), false);
  assert.strictEqual(isLoopbackHost(undefined), false);
  assert.strictEqual(isLoopbackHost('127.0.0.2'), false);
  assert.strictEqual(isLoopbackHost('example.com'), false);
});

// 2. isAntigravityPage 测试
test('isAntigravityPage: 识别 file、plugin 及回环调试页面', () => {
  assert.strictEqual(isAntigravityPage('file:///C:/path/to/page.html'), true);
  assert.strictEqual(isAntigravityPage('plugin://antigravity-chat/index.html'), true);
  assert.strictEqual(isAntigravityPage('http://127.0.0.1:9000/view'), true);
  assert.strictEqual(isAntigravityPage('http://localhost:3000/'), true);

  assert.strictEqual(isAntigravityPage('https://google.com'), false);
  assert.strictEqual(isAntigravityPage('devtools://devtools/bundled/inspector.html'), false);
  assert.strictEqual(isAntigravityPage('chrome-extension://xyz/options.html'), false);
  assert.strictEqual(isAntigravityPage('invalid-url'), false);
});

// 3. isTrustedDebuggerUrl 测试
test('isTrustedDebuggerUrl: 端口匹配且必须为 ws/wss 回环连接', () => {
  assert.strictEqual(isTrustedDebuggerUrl('ws://127.0.0.1:9222/devtools/page/1', 9222), true);
  assert.strictEqual(isTrustedDebuggerUrl('ws://localhost:9222/devtools/page/1', '9222'), true);
  assert.strictEqual(isTrustedDebuggerUrl('wss://[::1]:9222/devtools/page/1', 9222), true);

  assert.strictEqual(isTrustedDebuggerUrl('ws://127.0.0.1:9223/devtools/page/1', 9222), false);
  assert.strictEqual(isTrustedDebuggerUrl('ws://external.com:9222/devtools/page/1', 9222), false);
  assert.strictEqual(isTrustedDebuggerUrl('http://127.0.0.1:9222/devtools/page/1', 9222), false);
  assert.strictEqual(isTrustedDebuggerUrl('invalid-ws', 9222), false);
});

// 4. readDevToolsPort 测试
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cdp-'));

try {
  test('readDevToolsPort: 从 DevToolsActivePort 文件解析首行有效端口', () => {
    const agDir = path.join(tmpDir, 'Antigravity');
    fs.mkdirSync(agDir, { recursive: true });
    const portFile = path.join(agDir, 'DevToolsActivePort');

    fs.writeFileSync(portFile, '9222\n/devtools/browser/uuid\n', 'utf8');
    assert.strictEqual(readDevToolsPort(tmpDir), 9222);

    fs.writeFileSync(portFile, 'invalid-port\n', 'utf8');
    assert.strictEqual(readDevToolsPort(tmpDir), null);

    assert.strictEqual(readDevToolsPort(path.join(tmpDir, 'missing-appdata')), null);
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// 5. fetchTargets 测试（通过本地 ephemeral HTTP 模拟服务）
(async () => {
  await test('fetchTargets: 从 /json 获取目标页面列表并在超时前正常返回', async () => {
    const mockTargets = [
      { id: '1', type: 'page', title: 'Main', url: 'file:///main.html', webSocketDebuggerUrl: 'ws://127.0.0.1:1234/1' },
    ];
    const server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockTargets));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const targets = await fetchTargets(port);
      assert(Array.isArray(targets));
      assert.strictEqual(targets.length, 1);
      assert.strictEqual(targets[0].id, '1');

      // 回调风格测试
      await new Promise((resolve, reject) => {
        fetchTargets(port, (cbTargets) => {
          try {
            assert.strictEqual(cbTargets.length, 1);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    } finally {
      server.close();
    }
  });

  console.log(`\nCDP-CLIENT 模块单元测试: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) process.exit(1);
})();
