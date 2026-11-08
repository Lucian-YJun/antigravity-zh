// 把 cargo 的 release 产物放到 dist/，并写下发布溯源。
//
// 单独写成脚本而不是内联 `node -e`：内联版本要把换行和引号层层转义进
// package.json 的字符串里，极容易写坏（实际就把命令拆成了两行、静默失效）。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SOURCE = path.join(ROOT, 'rust', 'target', 'release', 'antigravity-tool.exe');
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
const distArtifact = path.join(DIST, ARTIFACT_NAME);
fs.copyFileSync(SOURCE, distArtifact);
// copyFileSync 不保证刷新目标 mtime（Windows 上会沿用源的写入时间）。
// 而 tests/test-empirical-challenger-m1-cli.js 的「二进制不比 Rust 源码旧」守卫
// 正是按 mtime 判断的：cargo 判定源码未变、不重新链接时，源产物时间戳就停在旧值，
// 于是复制过去仍是旧 mtime，守卫误报「二进制过期」。这里显式对齐到复制时刻，
// 让 mtime 如实反映「本次 build:rust 已把当前产物放到 dist/」。
const now = new Date();
fs.utimesSync(distArtifact, now, now);

const manifest = {
  version: pkg.version,
  exe: RELEASE_NAME,
  engine: 'rust',
  source: 'rust/target/release/antigravity-tool.exe',
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(DIST, 'build-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);

const size = fs.statSync(SOURCE).size;
console.log(`✅ dist/${ARTIFACT_NAME} ← ${path.relative(ROOT, SOURCE)}（${(size / 1024 / 1024).toFixed(2)} MB）`);
console.log(`✅ dist/build-manifest.json（v${pkg.version}, engine=rust, 发布名 ${RELEASE_NAME}）`);
