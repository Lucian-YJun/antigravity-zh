// 生成发布用 zip：dist/Antigravity-zh-patch-v<version>.zip
// 只依赖 Node 内置模块：node_modules 里没有任何 zip 库，为了发布链路不再依赖安装状态，
// 核心 zip 逻辑抽离至 scripts/lib/zip.js，够用且结果可逐字节复现。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildZip, readZip } = require('./lib/zip');

const ROOT = path.resolve(__dirname, '..');
// 发布清单的唯一真源抽到 lib/release-plan.js，打包与一致性校验共用，避免循环 require。
const { EXE_NAME, EXE_SOURCE, BAT_FILES, collectEntries } = require('./lib/release-plan');

// 清单顺序即 zip 内顺序，便于人工核对与 diff
// requireExe=false 仅用于 --dry-run 预览：那时 exe 可能还没构建，允许缺席。
// 真正打包时必须为 true —— zip 里没有 exe 就等于没有任何可用的安装入口
// （.bat 调用随包的 Antigravity-zh.exe，而 scripts/ 并不在 zip 清单里），
// 旧版只 warn 不拦，实测会产出一个 14 条目、完全装不上的发布包。

// 必需条目按「名字核对」，不硬编码总条目数。
// 硬编码的数字一旦与清单增删不同步就会在真打包时误报——本文件初版就把 8 写成了 9，
// 而没有任何测试覆盖这条路径，所以只有真跑一次 release:package 才会暴露。
const REQUIRED_ENTRIES = [
  EXE_NAME,
  ...BAT_FILES,
  'src/cockpit-zh.json',
  'src/zh-i18n.js',
  'README.md',
  'RELEASE_NOTES.md',
];

function packageRelease(root = ROOT, outDir = path.join(root, 'dist')) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const zipName = `Antigravity-zh-patch-v${version}.zip`;
  const zipPath = path.join(outDir, zipName);

  const entries = collectEntries(root);
  const names = new Set(entries.map(e => e.name));
  const missing = REQUIRED_ENTRIES.filter(n => !names.has(n));
  if (missing.length) {
    throw new Error(`发布清单缺少必需条目: ${missing.join(', ')}`);
  }
  if (!names.has(EXE_NAME)) {
    throw new Error(`发布清单里没有 ${EXE_NAME}，拒绝产出无法安装的发布包`);
  }
  // native 替换表的数量必须与 src/native 下实际的 .json 文件一致，防止漏打包
  const nativeOnDisk = fs
    .readdirSync(path.join(root, 'src', 'native'))
    .filter(f => f.endsWith('.json'))
    .length;
  const nativeInZip = entries.filter(e => e.name.startsWith('src/native/')).length;
  if (nativeInZip !== nativeOnDisk) {
    throw new Error(
      `src/native 打包不完整: 磁盘上 ${nativeOnDisk} 个替换表，清单里只有 ${nativeInZip} 个`
    );
  }

  const buffer = buildZip(entries);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(zipPath, buffer);

  // 写完立刻回读校验，避免把坏包交给发布脚本：不仅比条目名/顺序，还逐条比字节
  const listed = readZip(buffer, { withData: true });
  const expected = entries.map(e => e.name);
  if (listed.map(e => e.name).join('\n') !== expected.join('\n')) {
    throw new Error('zip 条目与预期清单不一致');
  }
  for (let i = 0; i < listed.length; i++) {
    if (!listed[i].data.equals(entries[i].data)) {
      throw new Error(`zip 回读内容不符: ${entries[i].name}`);
    }
  }
  // 回读出来的 data 是内部视图，不对外暴露，保持返回形状不变
  const publicEntries = listed.map(({ name, size, crc }) => ({ name, size, crc }));

  console.log(`✅ 已生成 ${path.relative(root, zipPath) || zipPath}（${(buffer.length / 1024).toFixed(1)} KB，${publicEntries.length} 个条目）`);
  for (const entry of publicEntries) console.log(`   - ${entry.name} (${entry.size} B)`);
  return { zipPath, zipName, size: buffer.length, entries: publicEntries };
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
    fs.writeFileSync(path.join(root, 'dist', EXE_SOURCE), Buffer.alloc(4096, 0x5a));
    const copy = (rel) => {
      const dest = path.join(root, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    };
    for (const rel of [...BAT_FILES, 'README.md', 'src/cockpit-zh.json', 'src/zh-i18n.js']) copy(rel);
    // 发布文档已收进 docs/，沙箱里也必须按同样的新结构摆放（collectEntries 从新路径读）
    copy('docs/guide/RELEASE_NOTES.md');
    for (const rel of fs.readdirSync(path.join(ROOT, 'src', 'native'))) copy(`src/native/${rel}`);

    const first = packageRelease(root);
    check('文件名含版本号', first.zipName === 'Antigravity-zh-patch-v9.9.9.zip', first.zipName);

    const listed = readZip(fs.readFileSync(first.zipPath));
    const names = listed.map(e => e.name);
    const nativeNames = names.filter(n => n.startsWith('src/native/'));
    check('条目可解析', listed.length > 0, `${listed.length} 个条目`);
    // 条目数按磁盘上实际的替换表数量动态计算：写死 7/15 会在新增 scope 后误报，
    // 而且自检跑在临时目录里，读的就是本次真要打包进去的那份 src/native。
    const nativeOnDiskCount = fs
      .readdirSync(path.join(root, 'src', 'native'))
      .filter(f => f.endsWith('.json'))
      .length;
    const expectedTotal = 1 /* exe */ + BAT_FILES.length + 2 /* 2 src */
      + nativeOnDiskCount + 2 /* README + RELEASE_NOTES */;
    check(`条目数符合清单（exe + ${BAT_FILES.length} bat + 2 src + ${nativeOnDiskCount} native + 2 文档 = ${expectedTotal}）`,
      listed.length === expectedTotal, `${listed.length}`);
    check(`src/native 下 ${nativeOnDiskCount} 个替换表齐全`,
      nativeNames.length === nativeOnDiskCount, nativeNames.join(', '));
    check('条目顺序与清单一致', names[0] === EXE_NAME && names[1] === BAT_FILES[0] && names[names.length - 1] === 'RELEASE_NOTES.md');

    // 发版一致性校验的正反用例（都在临时沙箱里，改完立刻恢复，不影响下面的可复现性断言）
    const { verifyReleaseZip } = require('./lib/release-consistency');
    check('打包结果通过一致性校验', verifyReleaseZip(root, first.zipPath).ok);
    const readmePath = path.join(root, 'README.md');
    const readmeOrig = fs.readFileSync(readmePath);
    fs.writeFileSync(readmePath, Buffer.concat([readmeOrig, Buffer.from('X')]));
    let rejected = false;
    try { verifyReleaseZip(root, first.zipPath); } catch (e) { rejected = /README\.md/.test(e.message); }
    fs.writeFileSync(readmePath, readmeOrig);
    check('源码变更后一致性校验拒绝发布', rejected);
    check('恢复后再次通过', verifyReleaseZip(root, first.zipPath).ok);

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
