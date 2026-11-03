const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createStagingDirectory,
  setupUnpackedJunction,
  moveIntoPlace,
  deployAtomically,
} = require('../scripts/lib/deployer');

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-deployer-'));

try {
  // 1. createStagingDirectory 测试
  test('createStagingDirectory: 在系统临时目录创建隔离目录', () => {
    const staging = createStagingDirectory('test-stage');
    assert(fs.existsSync(staging));
    assert(path.basename(staging).startsWith('test-stage-'));
    fs.rmSync(staging, { recursive: true, force: true });
  });

  // 2. setupUnpackedJunction 测试
  test('setupUnpackedJunction: 创建与清理 unpacked 目录联接', () => {
    const resDir = path.join(tmpDir, 'resources');
    const unpackedDir = path.join(resDir, 'app.asar.unpacked');
    fs.mkdirSync(unpackedDir, { recursive: true });
    fs.writeFileSync(path.join(unpackedDir, 'unpacked.node'), 'binary');

    const sourceAsar = path.join(resDir, 'app.asar.orig');
    const asarPath = path.join(resDir, 'app.asar');

    const cleanup = setupUnpackedJunction(resDir, sourceAsar, asarPath);
    const junctionPath = path.join(resDir, 'app.asar.orig.unpacked');
    assert(fs.existsSync(junctionPath));

    cleanup();
    assert(!fs.existsSync(junctionPath));
    // 确保真实 unpacked 目录完好无损
    assert(fs.existsSync(path.join(unpackedDir, 'unpacked.node')));
  });

  // 3. moveIntoPlace 测试
  test('moveIntoPlace: 原子重命名与跨卷复制移动', () => {
    const fromDir = path.join(tmpDir, 'from-dir');
    const toDir = path.join(tmpDir, 'to-dir');
    fs.mkdirSync(fromDir, { recursive: true });
    fs.writeFileSync(path.join(fromDir, 'file.txt'), 'hello move');

    moveIntoPlace(fromDir, toDir);
    assert(fs.existsSync(toDir));
    assert(fs.existsSync(path.join(toDir, 'file.txt')));
    assert(!fs.existsSync(fromDir));
  });

  // 4. deployAtomically 测试（正常部署与逆序回滚）
  test('deployAtomically: 正常部署落位并生成备份', () => {
    const paths = {
      resourcesDir: tmpDir,
      asarPath: path.join(tmpDir, 'app.asar'),
      origPath: path.join(tmpDir, 'app.asar.orig'),
      appDir: path.join(tmpDir, 'app'),
      kitDir: path.join(tmpDir, 'zh-patch'),
      backupMetaPath: path.join(tmpDir, 'app.asar.orig.meta.json'),
      appNewDir: path.join(tmpDir, 'app.new'),
      appOldDir: path.join(tmpDir, 'app.old'),
      kitNewDir: path.join(tmpDir, 'zh-patch.new'),
      kitOldDir: path.join(tmpDir, 'zh-patch.old'),
      backupTmpPath: path.join(tmpDir, 'app.asar.orig.tmp'),
      backupOldPath: path.join(tmpDir, 'app.asar.orig.old'),
    };

    // 初始原版 app.asar
    fs.writeFileSync(paths.asarPath, 'original asar v1');

    // 准备 staging 内容
    const staging = createStagingDirectory('test-deploy');
    fs.writeFileSync(path.join(staging, 'patched.js'), 'patched content');

    deployAtomically(paths, staging, (kitNewDir) => {
      fs.mkdirSync(kitNewDir, { recursive: true });
      fs.writeFileSync(path.join(kitNewDir, 'zh-i18n.js'), 'i18n component');
    });

    // 验证部署结果
    assert(fs.existsSync(paths.origPath));
    assert.strictEqual(fs.readFileSync(paths.origPath, 'utf8'), 'original asar v1');
    assert(fs.existsSync(paths.appDir));
    assert.strictEqual(fs.readFileSync(path.join(paths.appDir, 'patched.js'), 'utf8'), 'patched content');
    assert(fs.existsSync(paths.kitDir));
    assert(fs.existsSync(paths.backupMetaPath));
    assert(!fs.existsSync(paths.appNewDir));
    assert(!fs.existsSync(paths.appOldDir));
    assert(!fs.existsSync(paths.kitNewDir));
    assert(!fs.existsSync(paths.kitOldDir));
  });

  test('deployAtomically: 故障注入时自动触发逆序回滚并恢复原始状态', () => {
    const paths = {
      resourcesDir: tmpDir,
      asarPath: path.join(tmpDir, 'rollback-asar'),
      origPath: path.join(tmpDir, 'rollback-orig'),
      appDir: path.join(tmpDir, 'rollback-app'),
      kitDir: path.join(tmpDir, 'rollback-kit'),
      backupMetaPath: path.join(tmpDir, 'rollback-meta.json'),
      appNewDir: path.join(tmpDir, 'rollback-app.new'),
      appOldDir: path.join(tmpDir, 'rollback-app.old'),
      kitNewDir: path.join(tmpDir, 'rollback-kit.new'),
      kitOldDir: path.join(tmpDir, 'rollback-kit.old'),
      backupTmpPath: path.join(tmpDir, 'rollback-tmp'),
      backupOldPath: path.join(tmpDir, 'rollback-old'),
    };

    fs.writeFileSync(paths.asarPath, 'stable asar');
    fs.mkdirSync(paths.appDir, { recursive: true });
    fs.writeFileSync(path.join(paths.appDir, 'app.txt'), 'stable app');

    const staging = createStagingDirectory('test-rollback');
    fs.writeFileSync(path.join(staging, 'broken.js'), 'broken');

    // 注入故障：在切换 app.new -> app 时抛错
    const oldProbe = process.env.AGY_ZH_TEST_FAIL_RENAME;
    process.env.AGY_ZH_TEST_FAIL_RENAME = 'rollback-app.new>rollback-app';

    try {
      assert.throws(() => {
        deployAtomically(paths, staging, (kitNewDir) => {
          fs.mkdirSync(kitNewDir, { recursive: true });
        });
      }, /注入的部署失败/);

      // 回滚验证：原始 app/ 与 asarPath 完好归位
      assert(fs.existsSync(paths.appDir));
      assert.strictEqual(fs.readFileSync(path.join(paths.appDir, 'app.txt'), 'utf8'), 'stable app');
      assert(fs.existsSync(paths.asarPath));
      assert(!fs.existsSync(paths.appNewDir));
    } finally {
      if (oldProbe !== undefined) process.env.AGY_ZH_TEST_FAIL_RENAME = oldProbe;
      else delete process.env.AGY_ZH_TEST_FAIL_RENAME;
    }
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nDEPLOYER 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
