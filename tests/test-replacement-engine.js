const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  DEFAULT_TARGETS,
  applyReplacements,
  loadRules,
  patchTargetFile,
  patchAllTargets,
} = require('../scripts/lib/replacement-engine');

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

// 1. DEFAULT_TARGETS 结构测试
test('DEFAULT_TARGETS: 覆盖全部 7 个原生目标文件', () => {
  const expectedKeys = ['utils', 'menu', 'main', 'tray', 'updater', 'ipchandlers', 'wizard'];
  for (const k of expectedKeys) {
    assert(typeof DEFAULT_TARGETS[k] === 'string' && DEFAULT_TARGETS[k].length > 0);
  }
});

// 2. applyReplacements 纯函数测试
test('applyReplacements: 正确替换单个与多个匹配项', () => {
  const content = 'const title = "Welcome"; const label = "Open";';
  const rules = [
    ['"Welcome"', '"欢迎"'],
    ['"Open"', '"打开"'],
  ];
  const res = applyReplacements(content, rules);
  assert.strictEqual(res.content, 'const title = "欢迎"; const label = "打开";');
  assert.strictEqual(res.appliedCount, 2);
  assert.strictEqual(res.matchedRules, 2);
});

test('applyReplacements: 未匹配规则保持内容原样并不报错', () => {
  const content = 'const x = 1;';
  const rules = [['const y = 2;', 'const y = 3;']];
  const res = applyReplacements(content, rules);
  assert.strictEqual(res.content, content);
  assert.strictEqual(res.appliedCount, 0);
});

test('applyReplacements: 幂等性测试（重复应用替换 appliedCount 为 0）', () => {
  const content = 'const mode = "dark";';
  const rules = [['"dark"', '"深色"']];
  const first = applyReplacements(content, rules);
  assert.strictEqual(first.content, 'const mode = "深色";');
  assert.strictEqual(first.appliedCount, 1);

  const second = applyReplacements(first.content, rules);
  assert.strictEqual(second.content, 'const mode = "深色";');
  assert.strictEqual(second.appliedCount, 0);
});

// 3. loadRules 与 patchTargetFile 磁盘交互测试
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-repl-'));

try {
  test('loadRules: 正确读取规则 JSON，文件缺失时返回 null', () => {
    const rulesPath = path.join(tmpDir, 'utils.replacements.json');
    fs.writeFileSync(rulesPath, JSON.stringify([['foo', 'bar']]), 'utf8');

    const rules = loadRules(tmpDir, 'utils');
    assert.deepStrictEqual(rules, [['foo', 'bar']]);

    const missing = loadRules(tmpDir, 'nonexistent');
    assert.strictEqual(missing, null);
  });

  test('patchTargetFile: 正常执行落盘改动', () => {
    const targetFile = path.join(tmpDir, 'target.js');
    const rulesFile = path.join(tmpDir, 'test.replacements.json');
    fs.writeFileSync(targetFile, 'const msg = "Hello";', 'utf8');
    fs.writeFileSync(rulesFile, JSON.stringify([['"Hello"', '"你好"']]), 'utf8');

    const stat = patchTargetFile(targetFile, rulesFile, { isDryRun: false });
    assert.strictEqual(stat.applied, 1);
    assert.strictEqual(stat.totalRules, 1);
    assert.strictEqual(stat.fileMissing, false);
    assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'const msg = "你好";');
  });

  test('patchTargetFile: dry-run 模式返回匹配计数但不修改磁盘文件', () => {
    const targetFile = path.join(tmpDir, 'target-dry.js');
    const rulesFile = path.join(tmpDir, 'test-dry.replacements.json');
    fs.writeFileSync(targetFile, 'const v = "dry";', 'utf8');
    fs.writeFileSync(rulesFile, JSON.stringify([['"dry"', '"干燥"']]), 'utf8');

    const stat = patchTargetFile(targetFile, rulesFile, { isDryRun: true });
    assert.strictEqual(stat.applied, 1);
    assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'const v = "dry";');
  });

  test('patchTargetFile: 目标文件或规则文件缺失时安全跳过不抛错', () => {
    const missingTarget = path.join(tmpDir, 'not-found.js');
    const missingRules = path.join(tmpDir, 'not-found.json');
    const stat1 = patchTargetFile(missingTarget, missingRules);
    assert.strictEqual(stat1.fileMissing, true);

    fs.writeFileSync(missingTarget, 'content', 'utf8');
    const stat2 = patchTargetFile(missingTarget, missingRules);
    assert.strictEqual(stat2.rulesMissing, true);
  });

  test('patchAllTargets: 批量替换目标文件并统计', () => {
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(path.join(staging, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'dist', 'utils.js'), 'const a = "Hello";', 'utf8');
    fs.writeFileSync(path.join(staging, 'dist', 'menu.js'), 'const b = "File";', 'utf8');

    const rulesDir = path.join(tmpDir, 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'utils.replacements.json'), JSON.stringify([['"Hello"', '"你好"']]), 'utf8');
    fs.writeFileSync(path.join(rulesDir, 'menu.replacements.json'), JSON.stringify([['"File"', '"文件"']]), 'utf8');

    const customTargets = {
      'utils': 'dist/utils.js',
      'menu': 'dist/menu.js',
      'missing': 'dist/missing.js',
    };

    const logs = [];
    const res = patchAllTargets(staging, rulesDir, customTargets, {
      isDryRun: false,
      logger: (msg) => logs.push(msg),
    });

    assert.strictEqual(res.totalApplied, 2);
    assert.strictEqual(res.fileStats.utils.applied, 1);
    assert.strictEqual(res.fileStats.menu.applied, 1);
    assert.strictEqual(res.fileStats.missing.skipped, true);
    assert.strictEqual(fs.readFileSync(path.join(staging, 'dist', 'utils.js'), 'utf8'), 'const a = "你好";');
    assert.strictEqual(fs.readFileSync(path.join(staging, 'dist', 'menu.js'), 'utf8'), 'const b = "文件";');
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nREPLACEMENT-ENGINE 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
