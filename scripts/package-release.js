// 生成发布用 zip：dist/Antigravity-zh-patch-v<version>.zip
// 只依赖 Node 内置模块：node_modules 里没有任何 zip 库，为了发布链路不再依赖安装状态，
// 核心 zip 逻辑抽离至 scripts/lib/zip.js，够用且结果可逐字节复现。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CRC_TABLE, crc32, dosDateTime, buildZip, readZip } = require('./lib/zip');

const ROOT = path.resolve(__dirname, '..');
const EXE_NAME = 'Antigravity-zh-patch.exe';
const BAT_FILES = ['一键安装.bat', '一键还原.bat', '快速同步词典.bat'];

// 清单顺序即 zip 内顺序，便于人工核对与 diff
// requireExe=false 仅用于 --dry-run 预览：那时 exe 可能还没构建，允许缺席。
// 真正打包时必须为 true —— zip 里没有 exe 就等于没有任何可用的安装入口
// （三个 .bat 全都调用 node scripts/patch.js，而 scripts/ 并不在 zip 清单里），
// 旧版只 warn 不拦，实测会产出一个 14 条目、完全装不上的发布包。
function collectEntries(root, { requireExe = true } = {}) {
  const items = [];
  const add = (name, file, required = true) => {
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`缺少发布文件: ${name}（${file}）`);
      return;
    }
    items.push({ name, data: fs.readFileSync(file) });
  };

  const exePath = path.join(root, 'dist', EXE_NAME);
  if (!fs.existsSync(exePath)) {
    if (requireExe) {
      throw new Error(
        `缺少发布文件: ${EXE_NAME}（${exePath}）\n`
        + '  zip 里没有 exe 就没有任何可用的安装入口（.bat 依赖的 scripts/ 不在打包清单内）。\n'
        + '  请先运行: npm run build:exe\n'
        + '  只想预览清单可加 --dry-run。'
      );
    }
    console.warn(`⚠️ 未找到 dist/${EXE_NAME}，本次为预览模式，只列出脚本与词典。`);
  } else {
    add(EXE_NAME, exePath);
  }

  // 安装脚本优先读取 exe 同级的词典与 src/ 外置目录，所以这些路径必须保持原结构
  for (const bat of BAT_FILES) add(bat, path.join(root, bat));
  add('src/cockpit-zh.json', path.join(root, 'src', 'cockpit-zh.json'));
  add('src/zh-i18n.js', path.join(root, 'src', 'zh-i18n.js'));

  const nativeDir = path.join(root, 'src', 'native');
  const nativeFiles = fs.readdirSync(nativeDir).filter(f => f.endsWith('.json')).sort();
  if (!nativeFiles.length) throw new Error('src/native 下没有替换表');
  for (const file of nativeFiles) add(`src/native/${file}`, path.join(nativeDir, file));

  add('README.md', path.join(root, 'README.md'));
  add('RELEASE_NOTES.md', path.join(root, 'RELEASE_NOTES.md'));
  return items;
}

// 发布包的固定骨架：exe + 3 个 bat + 词典 + 翻译器 + 2 个文档 = 9，
// 再加上 src/native 下的全部替换表。条目数不对就说明清单被漏改过。
const FIXED_ENTRY_COUNT = 9;

function packageRelease(root = ROOT, outDir = path.join(root, 'dist')) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const zipName = `Antigravity-zh-patch-v${version}.zip`;
  const zipPath = path.join(outDir, zipName);

  const entries = collectEntries(root);
  const nativeCount = entries.filter(e => e.name.startsWith('src/native/')).length;
  const expectedCount = FIXED_ENTRY_COUNT + nativeCount;
  if (entries.length !== expectedCount) {
    throw new Error(
      `发布清单条目数异常: 实际 ${entries.length}，预期 ${expectedCount}`
      + `（固定 ${FIXED_ENTRY_COUNT} + src/native ${nativeCount}）`
    );
  }
  if (!entries.some(e => e.name === EXE_NAME)) {
    throw new Error(`发布清单里没有 ${EXE_NAME}，拒绝产出无法安装的发布包`);
  }

  const buffer = buildZip(entries);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(zipPath, buffer);

  // 写完立刻回读校验，避免把坏包交给发布脚本
  const listed = readZip(buffer);
  const expected = entries.map(e => e.name);
  if (listed.map(e => e.name).join('\n') !== expected.join('\n')) {
    throw new Error('zip 条目与预期清单不一致');
  }

  console.log(`✅ 已生成 ${path.relative(root, zipPath) || zipPath}（${(buffer.length / 1024).toFixed(1)} KB，${listed.length} 个条目）`);
  for (const entry of listed) console.log(`   - ${entry.name} (${entry.size} B)`);
  return { zipPath, zipName, size: buffer.length, entries: listed };
}

// 用临时目录里的假 dist 复跑整条链路，验证文件名、条目数、CRC 与可复现性
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-zh-pkg-'));
  const root = path.join(tmp, 'pkg');
  let failed = 0;
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
  };

  try {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'antigravity-zh', version: '9.9.9' }));
    // 假 exe 只写填充字节，避免碰真的 pkg 产物（构建一次要几分钟且会覆盖 dist/）
    fs.writeFileSync(path.join(root, 'dist', EXE_NAME), Buffer.alloc(4096, 0x5a));
    const copy = (rel) => {
      const dest = path.join(root, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    };
    for (const rel of [...BAT_FILES, 'README.md', 'RELEASE_NOTES.md', 'src/cockpit-zh.json', 'src/zh-i18n.js']) copy(rel);
    for (const rel of fs.readdirSync(path.join(ROOT, 'src', 'native'))) copy(`src/native/${rel}`);

    const first = packageRelease(root);
    check('文件名含版本号', first.zipName === 'Antigravity-zh-patch-v9.9.9.zip', first.zipName);

    const listed = readZip(fs.readFileSync(first.zipPath));
    const names = listed.map(e => e.name);
    const nativeNames = names.filter(n => n.startsWith('src/native/'));
    check('条目可解析', listed.length > 0, `${listed.length} 个条目`);
    check('条目数符合清单（exe + 3 bat + 2 src + 7 native + 2 文档 = 15）', listed.length === 15, `${listed.length}`);
    check('src/native 下 7 个替换表齐全', nativeNames.length === 7, nativeNames.join(', '));
    check('条目顺序与清单一致', names[0] === EXE_NAME && names[1] === BAT_FILES[0] && names[names.length - 1] === 'RELEASE_NOTES.md');

    const second = packageRelease(root);
    check('重复打包逐字节一致', fs.readFileSync(first.zipPath).equals(fs.readFileSync(second.zipPath)), `${first.size} B`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n自检失败 ${failed} 项`);
    process.exit(1);
  }
  console.log('\n🎉 自检全部通过');
}

function argValue(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find(a => a.startsWith(flag + '='));
  return inline ? inline.slice(flag.length + 1) : null;
}

if (require.main === module) {
  const root = path.resolve(argValue('--root') || ROOT);
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else if (process.argv.includes('--dry-run')) {
    const entries = collectEntries(root, { requireExe: false });
    console.log(`预览：${entries.length} 个条目`);
    for (const entry of entries) console.log(`   - ${entry.name} (${entry.data.length} B)`);
  } else {
    try {
      packageRelease(root, argValue('--out') ? path.resolve(argValue('--out')) : path.join(root, 'dist'));
    } catch (err) {
      console.error('打包失败:', err.message);
      process.exit(1);
    }
  }
}

module.exports = { buildZip, readZip, collectEntries, packageRelease };
