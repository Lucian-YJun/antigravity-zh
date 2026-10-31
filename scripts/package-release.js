// 生成发布用 zip：dist/Antigravity-zh-patch-v<version>.zip
// 只依赖 Node 内置模块：node_modules 里没有任何 zip 库，为了发布链路不再依赖安装状态，
// 这里直接写一个 store 模式（不压缩）的 zip 写入器，约百行，够用且结果可逐字节复现。
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const EXE_NAME = 'Antigravity-zh-patch.exe';
const BAT_FILES = ['一键安装.bat', '一键还原.bat', '快速同步词典.bat'];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// 固定时间戳让同样的输入产出同样的 zip，便于校验发布物；需要真实时间时用 SOURCE_DATE_EPOCH。
function dosDateTime() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  const date = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000) : new Date(Date.UTC(1980, 0, 1));
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

// entries: [{ name, data }]，name 统一用正斜杠。store 模式无需 zlib，只拼头部与数据。
function buildZip(entries, stamp = dosDateTime()) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    // bit 11 声明文件名是 UTF-8，否则 Windows 解压会把中文文件名解成乱码
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function readZip(buffer) {
  const eocdOffset = (() => {
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) return i;
    }
    throw new Error('不是有效的 zip：找不到中央目录结尾');
  })();
  const total = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('中央目录条目签名错误');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    if (!(flags & 0x0800)) throw new Error(`条目 ${name} 未标记 UTF-8 文件名`);
    if (method !== 0) throw new Error(`条目 ${name} 不是 store 模式`);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`条目 ${name} CRC 校验失败`);
    if (data.length !== size) throw new Error(`条目 ${name} 长度不符`);
    entries.push({ name, size, crc });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// 清单顺序即 zip 内顺序，便于人工核对与 diff
function collectEntries(root) {
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
    console.warn(`⚠️ 未找到 dist/${EXE_NAME}，本次只打包脚本与词典；先运行 npm run build:exe 可补上 exe。`);
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

function packageRelease(root = ROOT, outDir = path.join(root, 'dist')) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const zipName = `Antigravity-zh-patch-v${version}.zip`;
  const zipPath = path.join(outDir, zipName);

  const entries = collectEntries(root);
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
    const entries = collectEntries(root);
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
