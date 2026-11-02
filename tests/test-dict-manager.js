const assert = require('assert');
const {
  parseTermLine,
  buildNormalizationIndex,
  checkRedundancy,
  validateDictionary,
  findRedundantVariants,
  processTerms,
} = require('../scripts/lib/dict-manager');

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

// 1. parseTermLine 解析器测试
test('parseTermLine: 注释与空白行返回 null', () => {
  assert.strictEqual(parseTermLine(''), null);
  assert.strictEqual(parseTermLine('   '), null);
  assert.strictEqual(parseTermLine('# 这是一行注释'), null);
  assert.strictEqual(parseTermLine(null), null);
});

test('parseTermLine: 格式 1（只给原文）', () => {
  const item = parseTermLine('Search automations...');
  assert.deepStrictEqual(item, { src: 'Search automations...', dst: null });
});

test('parseTermLine: 格式 2（= 分隔符）', () => {
  const item = parseTermLine('Dashboard = 仪表盘');
  assert.deepStrictEqual(item, { src: 'Dashboard', dst: '仪表盘' });
});

test('parseTermLine: 格式 3（=> 分隔符）', () => {
  const item = parseTermLine('Settings => 设置');
  assert.deepStrictEqual(item, { src: 'Settings', dst: '设置' });
});

test('parseTermLine: 格式 4（中文冒号 ： 分隔符）', () => {
  const item = parseTermLine('Help ： 帮助');
  assert.deepStrictEqual(item, { src: 'Help', dst: '帮助' });
});

test('parseTermLine: 非法行校验（首尾空格、缺失原文、缺失译文）', () => {
  assert.deepStrictEqual(parseTermLine('  Term = 术语'), { invalid: true });
  assert.deepStrictEqual(parseTermLine('Term = 术语  '), { invalid: true });
  assert.deepStrictEqual(parseTermLine('= 只有译文'), { invalid: true });
  assert.deepStrictEqual(parseTermLine('Term = '), { invalid: true });
});

// 2. 归一化与冗余检测测试
// 模拟简易归一化函数：忽略大小写，保留标点区别
const mockNormKey = (s) => String(s || '').trim().toLowerCase();

test('buildNormalizationIndex: 分组构建归一化倒排索引', () => {
  const dict = { 'Dashboard': '仪表盘', 'Home': '首页' };
  const idx = buildNormalizationIndex(dict, mockNormKey);
  assert.deepStrictEqual(idx.get('dashboard'), ['Dashboard']);
  assert.deepStrictEqual(idx.get('home'), ['Home']);
});

test('checkRedundancy: 准确拦截大小写与相同译文冗余，不误拦不同译文', () => {
  const dict = { 'Dashboard': '仪表盘' };
  const idx = buildNormalizationIndex(dict, mockNormKey);

  // 同译文冗余
  const r1 = checkRedundancy('dashboard', '仪表盘', dict, idx, mockNormKey);
  assert.strictEqual(r1.isRedundant, true);
  assert.strictEqual(r1.existingKey, 'Dashboard');

  // 只给原文的冗余（防止占位符遮蔽既有译文）
  const r2 = checkRedundancy('dashboard', null, dict, idx, mockNormKey);
  assert.strictEqual(r2.isRedundant, true);

  // 不同译文不应判定为冗余
  const r3 = checkRedundancy('dashboard', '控制台', dict, idx, mockNormKey);
  assert.strictEqual(r3.isRedundant, false);
});

// 3. validateDictionary 格式健康体检
test('validateDictionary: 捕获空 key、空值、首尾空格', () => {
  const cleanDict = { 'Hello': '你好', 'World': '世界' };
  assert.strictEqual(validateDictionary(cleanDict).length, 0);

  const dirtyDict = {
    '': '空键',
    'Bad': '',
    ' Space ': '值',
    'Key': ' 尾部空格 ',
  };
  const problems = validateDictionary(dirtyDict);
  assert.strictEqual(problems.length, 4);
});

// 4. findRedundantVariants 清理
test('findRedundantVariants: 识别同归一化键且译文相同的冗余变体', () => {
  const dict = {
    'Dashboard': '仪表盘',
    'dashboard': '仪表盘',
    'Save': '保存',
    'Save...': '保存...', // 标点变体译文不同，整组保留
  };
  // 模拟引擎归一化函数：去除大小写和首尾空格
  const norm = (k) => k.toLowerCase();
  const res = findRedundantVariants(dict, norm);
  // 规范形态（如全小写恒等变换）被保留，另一条被移除
  assert.strictEqual(res.removed.length, 1);
  assert.strictEqual(dict['dashboard'], '仪表盘');
  assert.strictEqual(dict['Dashboard'], undefined);
  assert.strictEqual(dict['Save'], '保存');
  assert.strictEqual(dict['Save...'], '保存...');
});

// 5. processTerms 批量处理
test('processTerms: 综合批量处理词条添加与跳过', () => {
  const dict = { 'File': '文件' };
  const lines = [
    'Edit = 编辑',
    'File = 新文件',
    'file = 文件', // 冗余
    'Invalid = ',
    '# 注释',
  ];
  const res = processTerms(lines, dict, { normKeyFn: mockNormKey });
  assert.strictEqual(res.added.length, 1);
  assert.strictEqual(res.added[0][0], 'Edit');
  assert.strictEqual(res.skipped.length, 1);
  assert.strictEqual(res.skipped[0], 'File');
  assert.strictEqual(res.redundant.length, 1);
  assert.strictEqual(res.invalid.length, 1);
  assert.strictEqual(dict['Edit'], '编辑');
});

console.log(`\nDICT-MANAGER 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
