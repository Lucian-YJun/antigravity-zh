// 发版一致性校验的正反用例：全程在临时沙箱里造一个「迷你仓库」，不碰真实 dist/。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildZip } = require('../scripts/lib/zip');
const { collectEntries, packageRelease } = (() => {
  const pkg = require('../scripts/package-release');
  return { collectEntries: require('../scripts/lib/release-plan').collectEntries, packageRelease: pkg.packageRelease };
})();
const { verifyReleaseZip } = require('../scripts/lib/release-consistency');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('PASS  ' + name); passed++; }
  catch (e) { console.error('FAIL  ' + name + ': ' + e.message); failed++; }
}

const VERSION = require('../package.json').version;

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-zh-release-'));
  const w = (rel, data) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    return p;
  };
  w('package.json', JSON.stringify({ name: 'antigravity-zh', version: VERSION }));
  w('dist/antigravity-tool.exe', Buffer.alloc(4096, 0x5a));
  w('一键安装.bat', Buffer.from('@echo off\r\n'));
  w('一键还原.bat', Buffer.from('@echo off\r\n'));
  w('快速同步词典.bat', Buffer.from('@echo off\r\n'));
  w('src/cockpit-zh.json', Buffer.from('{"dict":{}}'));
  w('src/zh-i18n.js', Buffer.from('// i18n'));
  w('src/native/main.replacements.json', Buffer.from('[["a","b"]]'));
  w('src/native/menu.replacements.json', Buffer.from('[["c","d"]]'));
  w('README.md', Buffer.from('# readme'));
  w('docs/guide/RELEASE_NOTES.md', Buffer.from('# notes'));
  return { root, w };
}

function build(root) {
  const r = packageRelease(root, path.join(root, 'dist'));
  return r.zipPath;
}

// 用来断言「抛错且信息里含关键字」
function failsWith(root, zipPath, keyword) {
  assert.throws(() => verifyReleaseZip(root, zipPath), e => e.message.includes(keyword));
}

const { root, w } = makeSandbox();
let zipPath;
try {
  check('刚打好的包与当前源码一致', () => {
    zipPath = build(root);
    const r = verifyReleaseZip(root, zipPath);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, collectEntries(root).length);
  });

  // 逐个源文件改一个字节 → 必须报出对应 zip 条目名
  const cases = [
    ['README.md', 'README.md'],
    ['docs/guide/RELEASE_NOTES.md', 'RELEASE_NOTES.md'],           // 名字与源路径不同的映射
    ['src/cockpit-zh.json', 'src/cockpit-zh.json'],
    ['src/zh-i18n.js', 'src/zh-i18n.js'],
    ['src/native/main.replacements.json', 'src/native/main.replacements.json'],
    ['一键安装.bat', '一键安装.bat'],                                 // CRLF 逐字节
    ['dist/antigravity-tool.exe', 'Antigravity-zh.exe'],            // 二进制 + 名字不同的映射
  ];
  for (const [file, zipName] of cases) {
    check('改 ' + file + ' 后校验失败并点名 ' + zipName, () => {
      const p = path.join(root, file);
      const orig = fs.readFileSync(p);
      fs.writeFileSync(p, Buffer.concat([orig, Buffer.from('X')]));
      try { failsWith(root, zipPath, zipName); }
      finally { fs.writeFileSync(p, orig); }
    });
  }

  check('新增一个 native 表（复刻真实事故）→ 报缺少条目', () => {
    const p = w('src/native/new.replacements.json', Buffer.from('[["e","f"]]'));
    try { failsWith(root, zipPath, '缺少条目'); }
    finally { fs.rmSync(p); }
  });

  check('删除一个已有 native 表 → 报多余条目', () => {
    const p = path.join(root, 'src/native/menu.replacements.json');
    const orig = fs.readFileSync(p);
    fs.rmSync(p);
    try { failsWith(root, zipPath, '多余条目'); }
    finally { fs.writeFileSync(p, orig); }
  });

  check('条目顺序颠倒 → 报顺序不一致', () => {
    const entries = collectEntries(root);
    const swapped = [entries[1], entries[0], ...entries.slice(2)]
      .map(e => ({ name: e.name, data: e.data }));
    fs.writeFileSync(zipPath, buildZip(swapped));
    assert.throws(() => verifyReleaseZip(root, zipPath), /顺序/);
    // 恢复
    zipPath = build(root);
  });

  check('非法 zip → 明确异常而非崩溃', () => {
    fs.writeFileSync(zipPath, Buffer.from('x'));
    assert.throws(() => verifyReleaseZip(root, zipPath), /无法解析/);
    zipPath = build(root);
  });

  check('恢复后再次通过', () => {
    const r = verifyReleaseZip(root, zipPath);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, collectEntries(root).length);
  });

  check('校验纯只读：不改变任何源文件', () => {
    const before = collectEntries(root).map(e => e.data.toString('hex'));
    verifyReleaseZip(root, zipPath);
    const after = collectEntries(root).map(e => e.data.toString('hex'));
    assert.deepStrictEqual(after, before);
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n发布一致性校验: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
