const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {
  sha256File,
  fingerprint,
  fingerprintOrNull,
  fingerprintTrusting,
  fingerprintTrustingOrNull,
  sameFingerprint,
  readJsonFile,
  writeJsonFile,
  writeBackupMeta,
  isBackupStaleFor,
  recoverInterruptedDeploy,
} = require('../scripts/lib/backup-manager');

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-backup-'));

try {
  // 1. sha256File 测试（小文件及超过 1MB 的大文件）
  test('sha256File: 分块哈希计算与标准 Node crypto 完全一致', () => {
    const smallFile = path.join(tmpDir, 'small.bin');
    const smallData = Buffer.from('small content 12345', 'utf8');
    fs.writeFileSync(smallFile, smallData);
    const expectedSmall = crypto.createHash('sha256').update(smallData).digest('hex');
    assert.strictEqual(sha256File(smallFile), expectedSmall);

    const largeFile = path.join(tmpDir, 'large.bin');
    // 创建 2MB 数据以测试分块 (1 << 20)
    const largeData = Buffer.alloc(2 * 1024 * 1024, 0x5a);
    fs.writeFileSync(largeFile, largeData);
    const expectedLarge = crypto.createHash('sha256').update(largeData).digest('hex');
    assert.strictEqual(sha256File(largeFile), expectedLarge);
  });

  // 2. fingerprint 与 fingerprintTrusting 测试
  test('fingerprint & fingerprintTrusting: 正确缓存与信任已有指纹', () => {
    const testFile = path.join(tmpDir, 'test-fp.txt');
    fs.writeFileSync(testFile, 'hello fingerprint', 'utf8');

    const fp1 = fingerprint(testFile);
    assert(typeof fp1.size === 'number');
    assert(typeof fp1.mtimeMs === 'number');
    assert(typeof fp1.sha256 === 'string');

    // fingerprintTrusting: size 与 mtimeMs 吻合时直接复用 known sha256
    const known = { size: fp1.size, mtimeMs: fp1.mtimeMs, sha256: 'mocked-known-sha256' };
    const trusted = fingerprintTrusting(testFile, known);
    assert.strictEqual(trusted.sha256, 'mocked-known-sha256');

    // 文件不存在时 fingerprintOrNull 返回 null 而不崩溃
    assert.strictEqual(fingerprintOrNull(path.join(tmpDir, 'missing.bin')), null);
  });

  // 3. writeBackupMeta 与 isBackupStaleFor 测试
  test('writeBackupMeta & isBackupStaleFor: 元数据原子落盘与过期校验', () => {
    const origPath = path.join(tmpDir, 'app.asar.orig');
    const asarPath = path.join(tmpDir, 'app.asar');
    const metaPath = path.join(tmpDir, 'app.asar.orig.meta.json');

    fs.writeFileSync(origPath, 'original content v1', 'utf8');
    fs.writeFileSync(asarPath, 'original content v1', 'utf8');

    writeBackupMeta(metaPath, origPath);
    assert(fs.existsSync(metaPath));
    assert(!fs.existsSync(`${metaPath}.tmp`)); // 确认临时文件已清除

    const meta = readJsonFile(metaPath);
    assert(meta && meta.source && meta.source.sha256);
    assert(meta.recordedAt);

    // 内容相同时不是过期备份
    assert.strictEqual(isBackupStaleFor(metaPath, asarPath), false);

    // 客户端更新了新内容后，判定为过期备份
    fs.writeFileSync(asarPath, 'updated content v2 with different size', 'utf8');
    assert.strictEqual(isBackupStaleFor(metaPath, asarPath), true);

    // 元数据丢失时同样视为过期
    assert.strictEqual(isBackupStaleFor(path.join(tmpDir, 'missing.meta.json'), asarPath), true);
  });

  // 4. recoverInterruptedDeploy 崩溃恢复测试
  test('recoverInterruptedDeploy: 异常中断后从临时文件/旧目录中恢复原样', () => {
    const paths = {
      asarPath: path.join(tmpDir, 'rec-asar'),
      origPath: path.join(tmpDir, 'rec-orig'),
      appDir: path.join(tmpDir, 'rec-app'),
      kitDir: path.join(tmpDir, 'rec-kit'),
      backupMetaPath: path.join(tmpDir, 'rec-meta.json'),
      appNewDir: path.join(tmpDir, 'rec-app.new'),
      appOldDir: path.join(tmpDir, 'rec-app.old'),
      kitNewDir: path.join(tmpDir, 'rec-kit.new'),
      kitOldDir: path.join(tmpDir, 'rec-kit.old'),
      backupTmpPath: path.join(tmpDir, 'rec-orig.tmp'),
      backupOldPath: path.join(tmpDir, 'rec-orig.old'),
    };

    // 模拟备份中途断电：原文件已进入 backupTmpPath
    fs.writeFileSync(paths.backupTmpPath, 'backup content in tmp');
    // 模拟目录重命名中途断电：app 还在 appOldDir，中间有残留 appNewDir
    fs.mkdirSync(paths.appOldDir, { recursive: true });
    fs.writeFileSync(path.join(paths.appOldDir, 'file.txt'), 'app content');
    fs.mkdirSync(paths.appNewDir, { recursive: true });

    recoverInterruptedDeploy(paths);

    // 验证：origPath 已恢复，appDir 已恢复，残留的 appNewDir / backupTmpPath 已清理
    assert(fs.existsSync(paths.origPath));
    assert(fs.existsSync(paths.appDir));
    assert(!fs.existsSync(paths.backupTmpPath));
    assert(!fs.existsSync(paths.appNewDir));
    assert(!fs.existsSync(paths.appOldDir));
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nBACKUP-MANAGER 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
