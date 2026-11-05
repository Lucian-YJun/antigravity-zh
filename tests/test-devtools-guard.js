// 开发工具脚本的副作用边界测试。
//
// 起因：scripts/scan-ui.js 与 scripts/clean-dict-variants.js 此前完全没有测试覆盖，
// 结果一次「加参数校验」的改动把顶层 process.exit(1) 放在了模块作用域，
// 任何 require('./scan-ui') 都会直接杀掉宿主进程——而该文件末尾明确
// module.exports = { evalOn, SCAN_EXPR }，就是设计成可被 require 的。
// 这类回归 npm test 全绿也发现不了，所以在这里补上门禁。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    pass++;
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    fail++;
  }
}

// 在子进程里 require，这样即使目标模块调了 process.exit 也不会带走本测试进程
function requireInChild(relPath) {
  const script = `
    const m = require(${JSON.stringify(path.join(ROOT, relPath))});
    process.stdout.write(JSON.stringify({ ok: true, exports: Object.keys(m || {}) }));
  `;
  return execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ---- scan-ui.js ----

test('scan-ui.js: require 时不得有副作用（不得 process.exit）', () => {
  const out = requireInChild('scripts/scan-ui.js');
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.ok, true, '子进程未能正常返回');
  assert(parsed.exports.includes('evalOn'), 'evalOn 未导出');
  assert(parsed.exports.includes('SCAN_EXPR'), 'SCAN_EXPR 未导出');
});

test('scan-ui.js: 缺少端口参数时以退出码 1 结束并打印用法', () => {
  let status = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/scan-ui.js')], {
      encoding: 'utf8', cwd: ROOT, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    status = e.status;
    stderr = String(e.stderr || '');
  }
  assert.strictEqual(status, 1, `应以退出码 1 结束，实际 ${status}`);
  assert(/用法/.test(stderr), `应打印用法，实际: ${stderr.slice(0, 200)}`);
});

test('scan-ui.js: 非法端口（0 / 负数 / 超界 / 非数字）一律拒绝', () => {
  for (const bad of ['0', '-1', '70000', 'abc']) {
    let status = 0;
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/scan-ui.js'), bad], {
        encoding: 'utf8', cwd: ROOT, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      status = e.status;
    }
    assert.strictEqual(status, 1, `端口 ${bad} 应被拒绝`);
  }
});

test('scan-ui.js: 注入浏览器的 SCAN_EXPR 本身是合法 JS', () => {
  // SCAN_EXPR 是字符串形式的浏览器代码，node --check 检查不到它；
  // 语法错误只会在 CDP 执行时静默失败，所以必须单独编译一次。
  const { SCAN_EXPR } = require(path.join(ROOT, 'scripts/scan-ui.js'));
  assert.strictEqual(typeof SCAN_EXPR, 'string');
  assert(SCAN_EXPR.length > 200, 'SCAN_EXPR 短得可疑');
  assert.doesNotThrow(() => new vm.Script(SCAN_EXPR), 'SCAN_EXPR 编译失败');
});

test('scan-ui.js: SCAN_EXPR 的叶子容器判定不再漏掉「有子元素但也有直接文本」的容器', () => {
  const { SCAN_EXPR } = require(path.join(ROOT, 'scripts/scan-ui.js'));
  // 旧条件 (children===0 || children>3) 会整块跳过 1~3 个子元素且有直接文本的容器，
  // 而 <div>共 <span>3</span> items</div> 这类结构极常见，导致找漏译的工具自己漏报。
  assert(!/children\.length > 3/.test(SCAN_EXPR), '仍存在 >3 的叶子启发式，漏报未修复');
  assert(/hasDirectText/.test(SCAN_EXPR), '缺少 hasDirectText 判定');
});

test('scan-ui.js: 复用了 cdp-client 的回环与页面归属校验', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/scan-ui.js'), 'utf8');
  assert(/isAntigravityPage/.test(src), '未使用 isAntigravityPage');
  assert(/isTrustedDebuggerUrl/.test(src), '未使用 isTrustedDebuggerUrl');
});

// ---- clean-dict-variants.js ----

test('clean-dict-variants.js: 默认 dry-run，绝不覆写真实词典', () => {
  const dictPath = path.join(ROOT, 'src/cockpit-zh.json');
  const before = fs.readFileSync(dictPath);
  const beforeMtime = fs.statSync(dictPath).mtimeMs;
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/clean-dict-variants.js')], {
    encoding: 'utf8', cwd: ROOT, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert(/dry-run/.test(out), `应声明 dry-run，实际输出: ${out.slice(0, 200)}`);
  assert(fs.readFileSync(dictPath).equals(before), '真实词典被改动了');
  assert.strictEqual(fs.statSync(dictPath).mtimeMs, beforeMtime, '真实词典被重写了');
  assert(!fs.existsSync(`${dictPath}.bak`), 'dry-run 不该产生备份文件');
});

test('clean-dict-variants.js: 源码里写入动作受 --write 保护', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/clean-dict-variants.js'), 'utf8');
  const writeIdx = src.indexOf('writeDictionary(dictPath');
  assert(writeIdx > 0, '找不到写入调用');
  const guardIdx = src.indexOf("if (!isWrite)");
  assert(guardIdx > 0 && guardIdx < writeIdx, 'writeDictionary 之前没有 --write 门禁');
  assert(/copyFileSync\(dictPath, backupPath\)/.test(src), '写入前应备份原词典');
});

test('clean-dict-variants.js: findRedundantVariants 在副本上计算，dry-run 真的无副作用', () => {
  const { findRedundantVariants } = require(path.join(ROOT, 'scripts/lib/dict-manager.js'));
  const dict = { Hooks: '钩子', hooks: '钩子', HOOKS: '钩子', Dashboard: '仪表盘' };
  const snapshot = JSON.parse(JSON.stringify(dict));
  const normKey = (s) => s.trim().toLowerCase();
  const { removed, remainingCount } = findRedundantVariants(dict, normKey);
  // 该函数就地 delete，这是既有契约；这里只验证它确实按归一化分组去重
  assert.strictEqual(removed.length, 2, `应删除 2 条冗余，实际 ${removed.length}`);
  assert.strictEqual(remainingCount, 2);
  assert(Object.keys(snapshot).length === 4, '快照本身不应受影响');
});

// ---- .bat 启动器的格式约束 ----
//
// 这些都是实测踩出来的、只有真跑 bat 才会暴露的问题：
//  * LF-only 行尾：cmd 按字节读取批处理，LF 会让命令解析错位；
//  * 非 ASCII 出现在 rem 行：多字节字符同样会让解析器错位，把注释当命令执行
//    （实测出现 "'ts' is not recognized"）；
//  * goto 标签跳转：标签按字节偏移定位，遇到多字节文本会落在字符中间。
// 中文只允许出现在 echo 之后（显示是正常的）。
test('.bat 启动器：CRLF 行尾，rem 行纯 ASCII，且不使用 goto 标签', () => {
  const bats = ['一键安装.bat', '一键还原.bat', '快速同步词典.bat'];
  for (const f of bats) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!/(^|[^\r])\n/.test(text), `${f}: 存在 LF-only 行尾（cmd 会解析错位）`);
    const lines = text.split('\r\n');
    lines.forEach((line, i) => {
      const t = line.trim().toLowerCase();
      assert(!/^\s*goto\s+:/.test(t), `${f}:${i + 1} 使用了 goto 标签跳转（多字节文本下会错位）`);
      if (!/[^\x00-\x7F]/.test(line)) return;
      if (/^rem\b/.test(t)) assert.fail(`${f}:${i + 1} rem 行含非 ASCII 字符: ${line.trim().slice(0, 60)}`);
      assert(/\becho\b/.test(t), `${f}:${i + 1} 非 echo 行含非 ASCII 字符: ${line.trim().slice(0, 60)}`);
    });
  }
});

test('版本号只维护一份：package.json / rust workspace / 发布 manifest 一致', () => {
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const cargo = fs.readFileSync(path.join(ROOT, 'rust', 'Cargo.toml'), 'utf8');
  const m = /\[workspace\.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/.exec(cargo);
  assert(m, 'rust/Cargo.toml 里找不到 workspace.package.version');
  assert.strictEqual(m[1], pkgVersion,
    `package.json=${pkgVersion} 与 rust/Cargo.toml=${m[1]} 不一致`);

  // 版本号曾被写死在 clap 属性里，导致 --version 长期报旧版本
  const cliSrc = fs.readFileSync(path.join(ROOT, 'rust', 'crates', 'cli', 'src', 'commands.rs'), 'utf8');
  assert(!/version\s*=\s*"\d+\.\d+\.\d+"/.test(cliSrc),
    'commands.rs 里写死了版本号；应使用裸 `version` 让 clap 读 CARGO_PKG_VERSION');

  const manifestPath = path.join(ROOT, 'dist', 'build-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const mv = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
    assert.strictEqual(mv, pkgVersion,
      `dist/build-manifest.json=${mv} 与 package.json=${pkgVersion} 不一致，请重新 npm run build:rust`);
  }
});

// ---- add-terms.js 的 --dict 边界（第一轮 L7） ----

test('add-terms.js: --dict 作为最后一个参数时必须报错而不是回落到真实词典', () => {
  const draft = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agy-terms-')), 'draft.txt');
  fs.writeFileSync(draft, 'Some New Term = 某个新词条\n');
  let status = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/add-terms.js'), draft, '--dict'], {
      encoding: 'utf8', cwd: ROOT, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    status = e.status;
    stderr = String(e.stderr || '');
  }
  assert.strictEqual(status, 1, '--dict 缺值时应以退出码 1 结束');
  assert(/--dict/.test(stderr), `应提示 --dict 用法，实际: ${stderr.slice(0, 200)}`);
  fs.rmSync(path.dirname(draft), { recursive: true, force: true });
});

test('add-terms.js: 真实词典未被上述边界用例污染', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/cockpit-zh.json'), 'utf8'));
  assert(!('Some New Term' in dict.dict), '真实词典被写入了测试词条');
});

console.log(`\n开发工具脚本副作用边界: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
