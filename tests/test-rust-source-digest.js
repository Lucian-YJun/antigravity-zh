// rust-source-digest 单元测试
// 这个模块是「二进制是否对应当前源码」这条守卫的唯一判据来源，必须有独立测试：
// 1) 同一内容 → 摘要稳定（可复现）；
// 2) 任一被打标文件内容变 → 摘要必变（守卫才有牙齿）；
// 3) 只改 mtime、内容不变 → 摘要不变（避免 git 检出导致误报）；
// 4) target/ 与 .git/ 不计入输入（否则摘要会随构建自身变化）；
// 5) 文件增删 → 摘要变化。
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { rustSourceDigest, listRustSources } = require('../scripts/lib/rust-source-digest');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('PASS  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + ' (' + e.message + ')'); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-digest-'));
const write = (rel, content) => {
  const p = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
};

try {
  write('Cargo.toml', '[workspace]\n');
  write('crates/a/src/lib.rs', 'pub fn a() {}\n');
  write('crates/a/Cargo.toml', '[package]\nname="a"\n');
  write('crates/a/target/release/should-be-ignored.rs', '// 构建产物，不该计入\n');
  write('.git/config', '// 不该计入\n');
  write('crates/a/README.md', '// 非构建输入，不该计入\n');

  check('摘要可复现（同内容两次结果一致）', () => {
    const a = rustSourceDigest(tmp);
    const b = rustSourceDigest(tmp);
    assert.strictEqual(a.digest, b.digest);
  });

  check('只统计 .rs/.toml/.lock，排除 target/ .git/ 与其它扩展名', () => {
    const files = listRustSources(tmp);
    assert.deepStrictEqual(
      files,
      ['Cargo.toml', 'crates/a/Cargo.toml', 'crates/a/src/lib.rs']
    );
    assert.strictEqual(rustSourceDigest(tmp).files, 3);
  });

  check('修改源码内容 → 摘要变化（守卫能发现过期产物）', () => {
    const before = rustSourceDigest(tmp).digest;
    write('crates/a/src/lib.rs', 'pub fn a() { /* changed */ }\n');
    assert.notStrictEqual(rustSourceDigest(tmp).digest, before);
  });

  check('仅改 mtime、内容不变 → 摘要不变（git 检出不再误报）', () => {
    const p = path.join(tmp, 'crates/a/src/lib.rs');
    const before = rustSourceDigest(tmp).digest;
    const d = new Date(Date.now() + 60000);
    fs.utimesSync(p, d, d);
    assert.strictEqual(rustSourceDigest(tmp).digest, before);
  });

  check('新增构建输入文件 → 摘要变化', () => {
    const before = rustSourceDigest(tmp).digest;
    write('crates/b/src/lib.rs', 'pub fn b() {}\n');
    assert.notStrictEqual(rustSourceDigest(tmp).digest, before);
  });

  check('删除构建输入文件 → 摘要变化', () => {
    const before = rustSourceDigest(tmp).digest;
    fs.rmSync(path.join(tmp, 'crates/b'), { recursive: true, force: true });
    assert.notStrictEqual(rustSourceDigest(tmp).digest, before);
  });

  check('路径参与摘要（内容相同但文件名不同不算一致）', () => {
    const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-digest-solo-'));
    try {
      fs.writeFileSync(path.join(solo, 'x.rs'), 'same\n');
      const one = rustSourceDigest(solo).digest;
      fs.writeFileSync(path.join(solo, 'y.rs'), 'same\n');
      assert.notStrictEqual(rustSourceDigest(solo).digest, one);
    } finally {
      fs.rmSync(solo, { recursive: true, force: true });
    }
  });

  check('摘要是 64 位十六进制 sha256', () => {
    assert.match(rustSourceDigest(tmp).digest, /^[0-9a-f]{64}$/);
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nrust-source-digest 单元测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
