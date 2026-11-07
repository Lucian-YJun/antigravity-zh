const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  DEFAULT_TARGETS,
  applyReplacements,
  applyReplacementsWithFallback,
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
test('DEFAULT_TARGETS: 每个原生替换表都有非空 scope 映射', () => {
  const nativeDir = path.join(__dirname, '../src/native');
  const scopes = fs.readdirSync(nativeDir)
    .filter(f => f.endsWith('.replacements.json'))
    .map(f => f.slice(0, -'.replacements.json'.length));
  assert(scopes.length > 0, 'src/native 下应至少有一个替换表');
  for (const scope of scopes) {
    assert(typeof DEFAULT_TARGETS[scope] === 'string' && DEFAULT_TARGETS[scope].length > 0,
      `scope ${scope} 缺少 DEFAULT_TARGETS 映射`);
  }
  for (const k of Object.keys(DEFAULT_TARGETS)) {
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

// 3. Rust 语义对拍：替换契约以 Rust 侧 Aho-Corasick(LeftmostFirst) 为准。
// 下面用一个独立的参考模型（不走被测代码）随机对拍，任何一侧改了语义都会在这里红。
// 参考模型刻意写成最直白的逐字符扫描，避免与被测实现共享思路。
function rustReferenceModel(input, rules) {
  const pats = rules.map(r => r[0]);
  let out = '';
  let i = 0;
  let occurrences = 0;
  const hit = new Set();
  while (i < input.length) {
    let chosen = -1;
    for (let k = 0; k < pats.length; k++) {
      if (pats[k] && input.startsWith(pats[k], i)) { chosen = k; break; }
    }
    if (chosen >= 0) {
      out += rules[chosen][1];
      i += pats[chosen].length;
      occurrences++;
      hit.add(chosen);
    } else {
      out += input[i];
      i++;
    }
  }
  return { out, occurrences, rulesHit: hit.size };
}

test('Rust 语义对拍: 2000 组随机输入与参考模型逐字节一致', () => {
  const alphabet = ['a', 'b', 'c', 'ab', 'bc', 'abc', '$', '&', "'", '`', '1', '你'];
  let seed = 20260104;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const mkStr = (len) => Array.from({ length: len }, () => alphabet[rnd(alphabet.length)]).join('');
  for (let c = 0; c < 2000; c++) {
    const input = mkStr(2 + rnd(14));
    const nRules = 1 + rnd(3);
    const rules = Array.from({ length: nRules }, () => [mkStr(1 + rnd(3)), mkStr(rnd(4))]);
    const got = applyReplacements(input, rules);
    const want = rustReferenceModel(input, rules);
    const ctx = `input=${JSON.stringify(input)} rules=${JSON.stringify(rules)}`;
    assert.strictEqual(got.content, want.out, `内容分歧 ${ctx}`);
    assert.strictEqual(got.replacements, want.occurrences, `替换处数分歧 ${ctx}`);
    assert.strictEqual(got.appliedCount, want.rulesHit, `命中规则数分歧 ${ctx}`);
  }
});

test('Rust 语义: 全量替换 + 单遍 + 字面量（三条不变量）', () => {
  // 全量：String.replace(str,..) 只换首处，Rust 换全部
  assert.strictEqual(
    applyReplacements('Hello Hello Hello', [['Hello', 'ZH']]).content,
    'ZH ZH ZH'
  );
  // 单遍：后一条规则不得匹配前一条刚写入的文本
  assert.strictEqual(
    applyReplacements('abc', [['abc', 'xyz'], ['xyz', 'QQQ']]).content,
    'xyz'
  );
  // 字面量：$ 序列不得被当成替换模式
  for (const rep of ['X$&Y', '保存 $$', "A$'B", 'B$`C', '$1', '$99']) {
    assert.strictEqual(
      applyReplacements('Hello world', [['Hello', rep]]).content,
      `${rep} world`,
      `$ 序列被展开了: ${JSON.stringify(rep)}`
    );
  }
});

test('Rust 语义: 最左优先，同位置按规则声明顺序取舍', () => {
  // 对应 rust/crates/replacer/src/automaton.rs 的 test_leftmost_longest_precedence
  assert.strictEqual(
    applyReplacements('We are testing now.', [['test', 'A'], ['testing', 'B']]).content,
    'We are Aing now.'
  );
});

test('Rust 语义: 空 pattern 与结构非法的规则必须报错', () => {
  // aho-corasick 拒绝空 pattern；JS 侧空串会在每个字符间隙匹配并切碎文本
  assert.throws(() => applyReplacements('abc', [['', 'Z']]), TypeError);
  // serde 反序列化会失败，Node 不能悄悄当成「无此规则」
  assert.throws(() => applyReplacements('abc', [['a', 'b'], null]), TypeError);
  assert.throws(() => applyReplacements('abc', [123]), TypeError);
});

test('Rust 语义: 结构体形态规则 {search, replace} 与元组等价', () => {
  // rust/crates/replacer/src/rules.rs 的 untagged 枚举同时接受两种形态
  assert.strictEqual(
    applyReplacements('Hello world', [{ search: 'Hello', replace: '你好' }]).content,
    '你好 world'
  );
  // 字段类型不对时按既有约定跳过，不抛错
  assert.strictEqual(
    applyReplacements('123 456', [[123, 'x'], ['456', 'four-five-six']]).content,
    '123 four-five-six'
  );
});

test('multiMatch: 命中多于一次时必须被暴露而不是悄悄处理', () => {
  const res = applyReplacements('a a a', [['a', 'b']]);
  assert.deepStrictEqual(res.multiMatch, [0]);
  assert.strictEqual(res.replacements, 3);
  assert.strictEqual(res.appliedCount, 1);
});

test('正则元字符在 target 里按字面量处理', () => {
  const meta = 'a.b*c (d) [e] {f} ^g$ |h\\i';
  assert.strictEqual(applyReplacements(meta, [[meta, 'OK']]).content, 'OK');
  assert.strictEqual(applyReplacements('xa.b*cy', [['a.b*c', 'Z']]).content, 'xZy');
});

// 3b. 强制 fallback 路径回归（Codex finding I4）。
// 旧 fallback 是「逐条 String.replace」，会让后一条规则匹配到前一条刚写入的产物，
// 破坏单遍语义。applyReplacementsWithFallback 让测试不用构造超大规则集就能覆盖这条分支。
test('模块导出: 原有 8 个导出保持不变，新增 forceFallback 入口', () => {
  const engine = require('../scripts/lib/replacement-engine');
  for (const key of [
    'DEFAULT_TARGETS', 'escapeRegExp', 'normalizeRule', 'applyReplacements',
    'loadRules', 'patchTargetFile', 'patchAllTargets', 'patchTargetFiles',
  ]) {
    assert.notStrictEqual(engine[key], undefined, `导出缺失: ${key}`);
  }
  assert.strictEqual(typeof engine.applyReplacementsWithFallback, 'function');
});

test('fallback: 单遍反例 A→B / B→C 对 "A" 输出 "B"（正常路径同值）', () => {
  const rules = [['A', 'B'], ['B', 'C']];
  const normal = applyReplacements('A', rules);
  const fb = applyReplacementsWithFallback('A', rules);
  assert.strictEqual(normal.content, 'B');
  assert.strictEqual(fb.content, 'B', 'fallback 把新写入的 B 又替换成了 C');
  assert.deepStrictEqual(fb, normal);
  // 显式走 options 与该入口等价
  assert.deepStrictEqual(applyReplacements('A', rules, { forceFallback: true }), fb);
});

test('fallback: 全量替换 A→X 对 "A A A"（含计数与 multiMatch）', () => {
  const rules = [['A', 'X']];
  const normal = applyReplacements('A A A', rules);
  const fb = applyReplacementsWithFallback('A A A', rules);
  assert.strictEqual(normal.content, 'X X X');
  assert.deepStrictEqual(fb, normal);
  assert.strictEqual(fb.replacements, 3);
  assert.deepStrictEqual(fb.multiMatch, [0]);
});

test('fallback: 译文里的 $& / $$ / $` / $\' / $1 / $99 按字面量写入', () => {
  for (const rep of ['X$&Y', '保存 $$', "A$'B", 'B$`C', '$1', '$99']) {
    const rules = [['Hello', rep]];
    const fb = applyReplacementsWithFallback('Hello world', rules);
    assert.strictEqual(fb.content, `${rep} world`, `$ 序列被展开了: ${JSON.stringify(rep)}`);
    assert.deepStrictEqual(fb, applyReplacements('Hello world', rules));
  }
});

test('fallback: 最左优先 test/testing 对 "testing" 输出 "Aing"', () => {
  const rules = [['test', 'A'], ['testing', 'B']];
  const fb = applyReplacementsWithFallback('We are testing now.', rules);
  assert.strictEqual(fb.content, 'We are Aing now.');
  assert.deepStrictEqual(fb, applyReplacements('We are testing now.', rules));
});

test('fallback: 重复字面量、结构体规则、正则元字符、代理对均与正常路径一致', () => {
  const cases = [
    ['ab ab', [['ab', 'X'], ['ab', 'Y']]],
    ['a ab', [['a', 'P'], ['ab', 'Q'], ['a', 'R']]],
    ['Hello world', [{ search: 'Hello', replace: '你好' }]],
    ['xa.b*cy', [['a.b*c', 'Z']]],
    ['😀a😀b', [['a', '中'], ['😀', '文']]],
    ['123 456', [[123, 'x'], ['456', 'four-five-six']]],
    ['', [['foo', 'bar']]],
    ['no match', [['zzz', 'q']]],
  ];
  for (const [content, rules] of cases) {
    const ctx = `input=${JSON.stringify(content)} rules=${JSON.stringify(rules)}`;
    assert.deepStrictEqual(
      applyReplacementsWithFallback(content, rules),
      applyReplacements(content, rules),
      `fallback 与正常路径分歧 ${ctx}`
    );
  }
});

test('fallback 随机对拍: 2000 组与正常路径及 Rust 参考模型全字段一致', () => {
  const alphabet = ['a', 'b', 'c', 'ab', 'bc', 'abc', '$', '&', "'", '`', '1', '你', '😀'];
  let seed = 20261106;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const mkStr = (len) => Array.from({ length: len }, () => alphabet[rnd(alphabet.length)]).join('');
  for (let c = 0; c < 2000; c++) {
    const input = mkStr(2 + rnd(14));
    const nRules = 1 + rnd(4);
    const rules = Array.from({ length: nRules }, () => [mkStr(1 + rnd(3)), mkStr(rnd(5))]);
    const normal = applyReplacements(input, rules);
    const fb = applyReplacementsWithFallback(input, rules);
    const want = rustReferenceModel(input, rules);
    const ctx = `input=${JSON.stringify(input)} rules=${JSON.stringify(rules)}`;
    assert.deepStrictEqual(fb, normal, `fallback 与正常路径分歧 ${ctx}`);
    assert.strictEqual(fb.content, want.out, `fallback 与参考模型内容分歧 ${ctx}`);
    assert.strictEqual(fb.replacements, want.occurrences, `fallback 替换处数分歧 ${ctx}`);
    assert.strictEqual(fb.appliedCount, want.rulesHit, `fallback 命中规则数分歧 ${ctx}`);
  }
});

// 4. loadRules 与 patchTargetFile 磁盘交互测试
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
