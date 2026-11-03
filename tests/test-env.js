const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getInstallationPaths,
  resolveSourceAssets,
  getDevToolsPortPath,
} = require('../scripts/lib/env');

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-env-'));

try {
  // 1. getInstallationPaths 测试
  test('getInstallationPaths: 基于自定义 LOCALAPPDATA 派生全部资源路径', () => {
    const mockLocal = path.join(tmpDir, 'mock-local');
    const paths = getInstallationPaths(mockLocal);
    const expectedRes = path.join(mockLocal, 'Programs', 'antigravity', 'resources');
    assert.strictEqual(paths.resourcesDir, expectedRes);
    assert.strictEqual(paths.asarPath, path.join(expectedRes, 'app.asar'));
    assert.strictEqual(paths.origPath, path.join(expectedRes, 'app.asar.orig'));
    assert.strictEqual(paths.appDir, path.join(expectedRes, 'app'));
    assert.strictEqual(paths.kitDir, path.join(expectedRes, 'zh-patch'));
    assert.strictEqual(paths.backupMetaPath, path.join(expectedRes, 'app.asar.orig.meta.json'));
    assert.strictEqual(paths.appNewDir, path.join(expectedRes, 'app.new'));
    assert.strictEqual(paths.appOldDir, path.join(expectedRes, 'app.old'));
    assert.strictEqual(paths.kitNewDir, path.join(expectedRes, 'zh-patch.new'));
    assert.strictEqual(paths.kitOldDir, path.join(expectedRes, 'zh-patch.old'));
    assert.strictEqual(paths.backupTmpPath, path.join(expectedRes, 'app.asar.orig.tmp'));
    assert.strictEqual(paths.backupOldPath, path.join(expectedRes, 'app.asar.orig.old'));
    assert.strictEqual(paths.unpackedDir, path.join(expectedRes, 'app.asar.unpacked'));
    assert.strictEqual(paths.origUnpackedDir, path.join(expectedRes, 'app.asar.orig.unpacked'));
    assert.strictEqual(paths.exePath, path.join(path.dirname(expectedRes), 'Antigravity.exe'));
  });

  test('getInstallationPaths: 缺失 LOCALAPPDATA 时抛出明确异常', () => {
    assert.throws(() => {
      getInstallationPaths('');
    }, /找不到 LOCALAPPDATA/);
  });

  test('getInstallationPaths: mustExist 选项在目录缺失时抛出异常', () => {
    const nonexistent = path.join(tmpDir, 'does-not-exist');
    assert.throws(() => {
      getInstallationPaths(nonexistent, { mustExist: true });
    }, /未找到 Antigravity 资源目录/);
  });

  // 2. resolveSourceAssets 测试
  const projectRoot = path.resolve(__dirname, '..');

  test('resolveSourceAssets: 默认模式（无外置文件）使用内置 src/ 资源', () => {
    const emptyExeDir = path.join(tmpDir, 'empty-exe');
    fs.mkdirSync(emptyExeDir, { recursive: true });
    const assets = resolveSourceAssets(projectRoot, emptyExeDir);
    assert.strictEqual(assets.hasExternalSrc, false);
    assert.strictEqual(assets.sourceI18n, path.join(projectRoot, 'src', 'zh-i18n.js'));
    assert.strictEqual(assets.sourceDict, path.join(projectRoot, 'src', 'cockpit-zh.json'));
    assert.strictEqual(assets.nativePatchesDir, path.join(projectRoot, 'src', 'native'));
  });

  test('resolveSourceAssets: 外置词典模式（exe 同级存在 cockpit-zh.json）优先使用', () => {
    const extDictExeDir = path.join(tmpDir, 'ext-dict-exe');
    fs.mkdirSync(extDictExeDir, { recursive: true });
    const mockDict = path.join(extDictExeDir, 'cockpit-zh.json');
    fs.writeFileSync(mockDict, '{"dict":{}}', 'utf8');

    const assets = resolveSourceAssets(projectRoot, extDictExeDir);
    assert.strictEqual(assets.sourceDict, mockDict);
    assert.strictEqual(assets.hasExternalSrc, false);
  });

  test('resolveSourceAssets: 外置 src 模式（exe 同级存在 src/）优先使用外置翻译脚本与替换表', () => {
    const extSrcExeDir = path.join(tmpDir, 'ext-src-exe');
    const extSrc = path.join(extSrcExeDir, 'src');
    fs.mkdirSync(path.join(extSrc, 'native'), { recursive: true });
    const mockI18n = path.join(extSrc, 'zh-i18n.js');
    fs.writeFileSync(mockI18n, '// ext i18n', 'utf8');
    const mockDict = path.join(extSrc, 'cockpit-zh.json');
    fs.writeFileSync(mockDict, '{"dict":{}}', 'utf8');

    const assets = resolveSourceAssets(projectRoot, extSrcExeDir);
    assert.strictEqual(assets.hasExternalSrc, true);
    assert.strictEqual(assets.sourceI18n, mockI18n);
    assert.strictEqual(assets.sourceDict, mockDict);
    assert.strictEqual(assets.nativePatchesDir, path.join(extSrc, 'native'));
  });

  // 3. getDevToolsPortPath 测试
  test('getDevToolsPortPath: 正确拼接 APPDATA 下 DevToolsActivePort 路径', () => {
    const mockAppData = path.join(tmpDir, 'mock-appdata');
    const portPath = getDevToolsPortPath(mockAppData);
    assert.strictEqual(portPath, path.join(mockAppData, 'Antigravity', 'DevToolsActivePort'));
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nENV 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
