const assert = require('assert');
const {
  parseProcessList,
  sleep,
} = require('../scripts/lib/process-manager');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

// 1. parseProcessList 纯函数边界与格式测试
test('parseProcessList: 空值、空字符串或非法类型返回空数组', () => {
  assert.deepStrictEqual(parseProcessList(''), []);
  assert.deepStrictEqual(parseProcessList(null), []);
  assert.deepStrictEqual(parseProcessList(undefined), []);
  assert.deepStrictEqual(parseProcessList(123), []);
});

test('parseProcessList: 标准 IDE 进程解析（有主窗口）', () => {
  const stdout = '1001|500|12345|0\n';
  const procs = parseProcessList(stdout);
  assert.strictEqual(procs.length, 1);
  assert.deepStrictEqual(procs[0], {
    pid: 1001,
    parentPid: 500,
    hasWindow: true,
    isSidecar: false,
  });
});

test('parseProcessList: 孤儿 sidecar 进程解析（无窗口且标记为 sidecar）', () => {
  const stdout = '1002|1001|0|1\n';
  const procs = parseProcessList(stdout);
  assert.strictEqual(procs.length, 1);
  assert.deepStrictEqual(procs[0], {
    pid: 1002,
    parentPid: 1001,
    hasWindow: false,
    isSidecar: true,
  });
});

test('parseProcessList: 无窗口非 sidecar 进程按 IDE 保守处理（fail-safe）', () => {
  const stdout = '1003|1001|0|0\n';
  const procs = parseProcessList(stdout);
  assert.strictEqual(procs.length, 1);
  assert.deepStrictEqual(procs[0], {
    pid: 1003,
    parentPid: 1001,
    hasWindow: false,
    isSidecar: false,
  });
});

test('parseProcessList: 畸形行与非数字 PID 安全过滤', () => {
  const mixed = [
    'invalid-line',
    '100|200|300', // 只有 3 列
    'abc|200|0|1',  // 非数字 PID
    '101|def|0|1',  // 非数字 parentPid
    '102|200|ghi|1',// 非数字 win
    '103|200|0|2',  // sidecar flag 只能是 0 或 1
    '  104 | 200 | 0 | 1  ', // 带空格合法行
  ].join('\n');

  const procs = parseProcessList(mixed);
  assert.strictEqual(procs.length, 1);
  assert.strictEqual(procs[0].pid, 104);
  assert.strictEqual(procs[0].isSidecar, true);
});

// 2. sleep 纯 JS 同步睡眠测试
test('sleep: 使用 Atomics.wait 同步睡眠并准确消耗时长', () => {
  const start = Date.now();
  sleep(50);
  const elapsed = Date.now() - start;
  assert(elapsed >= 40, `睡眠时长不足: ${elapsed}ms`);
});

// 3. 源码安全性静态检查（防止未来维护误引入 /T 或死标记）
test('安全性静态检查: process-manager.js 严禁包含 taskkill /T', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../scripts/lib/process-manager.js'), 'utf8');
  assert(!/taskkill[^\n]*\/T\b/.test(src), '发现禁止的 taskkill /T 递归终止指令');
  assert(!src.includes('agy-node'), '发现过期的 agy-node 标记');
});

console.log(`\nPROCESS-MANAGER 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
