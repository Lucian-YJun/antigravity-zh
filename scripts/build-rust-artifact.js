// 把 cargo 的 release 产物放到 dist/，并写下发布溯源。
//
// 单独写成脚本而不是内联 `node -e`：内联版本要把换行和引号层层转义进
// package.json 的字符串里，极容易写坏（实际就把命令拆成了两行、静默失效）。
const fs = require('fs');
const path = require('path');
const { rustSourceDigest } = require('./lib/rust-source-digest');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const RUST_ROOT = path.join(ROOT, 'rust');
const SOURCE = path.join(RUST_ROOT, 'target', 'release', 'antigravity-tool.exe');
const DIST = path.join(ROOT, 'dist');
const ARTIFACT_NAME = 'antigravity-tool.exe';
// 发布包里给用户看到的文件名与构建产物名不同：前者是面向用户的安装器名。
const RELEASE_NAME = 'Antigravity-zh.exe';

if (!fs.existsSync(SOURCE)) {
  console.error(`❌ 找不到 Rust 产物: ${SOURCE}`);
  console.error('   请先运行: cargo build --release --manifest-path rust/Cargo.toml');
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(SOURCE, path.join(DIST, ARTIFACT_NAME));

// 构建溯源。刻意**不**碰产物的 mtime：
// copyFileSync 沿用源文件的写入时间，而 mtime 本身并不可靠 ——
// `git checkout`/`git pull` 会把未改动的源文件重写一遍，mtime 变新而内容没变。
// 把它强行刷成「现在」更糟：cargo 判定源码未变、没有重新链接时，产物其实是旧的，
// 刷 mtime 会让「二进制是否与源码一致」的守卫永远通过，把真问题藏起来。
// 因此改记**源码内容摘要**：内容不变则摘要不变，任一个 .rs/.toml/.lock 变了摘要必变，
// 与「什么时候构建」「检查检出过几次」都无关。
const { digest: rustSourceDigestValue, files: rustSourceFiles } = rustSourceDigest(RUST_ROOT);

const manifest = {
  version: pkg.version,
  exe: RELEASE_NAME,
  engine: 'rust',
  source: 'rust/target/release/antigravity-tool.exe',
  builtAt: new Date().toISOString(),
  // 判定「产出的二进制是否对应当前源码」的唯一可靠依据，见 tests/test-empirical-challenger-m1-cli.js
  rustSourceDigest: rustSourceDigestValue,
  rustSourceFiles,
};
fs.writeFileSync(
  path.join(DIST, 'build-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);

const size = fs.statSync(SOURCE).size;
console.log(`✅ dist/${ARTIFACT_NAME} ← ${path.relative(ROOT, SOURCE)}（${(size / 1024 / 1024).toFixed(2)} MB）`);
console.log(`✅ dist/build-manifest.json（v${pkg.version}, engine=rust, 发布名 ${RELEASE_NAME}）`);
console.log(`   rust 源码摘要 ${rustSourceDigestValue.slice(0, 16)}…（${rustSourceFiles} 个文件）`);
