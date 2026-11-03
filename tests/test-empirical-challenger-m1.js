/**
 * Empirical Adversarial Challenger & Stress Test Suite for M1 Modular Scripts:
 * - scripts/lib/replacement-engine.js
 * - scripts/lib/dict-manager.js
 * - scripts/lib/zip.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const replacementEngine = require('../scripts/lib/replacement-engine');
const dictManager = require('../scripts/lib/dict-manager');
const zipLib = require('../scripts/lib/zip');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(suite, name, fn) {
  totalTests++;
  const label = `[${suite}] ${name}`;
  try {
    fn();
    console.log(`  ✓ PASS: ${label}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${label}\n    Error: ${err.message}`);
    failures.push({ label, error: err.stack || err.message });
    failedTests++;
  }
}

console.log('=== STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE ===\n');

// ============================================================================
// SUITE 1: REPLACEMENT ENGINE
// ============================================================================
console.log('--- SUITE 1: replacement-engine.js ---');

// 1.1 Input boundaries & malformed arguments
runTest('REPL', 'applyReplacements: handles empty string content', () => {
  const res = replacementEngine.applyReplacements('', [['foo', 'bar']]);
  assert.strictEqual(res.content, '');
  assert.strictEqual(res.appliedCount, 0);
  assert.strictEqual(res.matchedRules, 0);
});

runTest('REPL', 'applyReplacements: handles non-array rules gracefully', () => {
  const content = 'hello world';
  assert.strictEqual(replacementEngine.applyReplacements(content, null).content, content);
  assert.strictEqual(replacementEngine.applyReplacements(content, undefined).content, content);
  assert.strictEqual(replacementEngine.applyReplacements(content, {}).content, content);
  assert.strictEqual(replacementEngine.applyReplacements(content, 'rule').content, content);
  assert.strictEqual(replacementEngine.applyReplacements(content, 123).content, content);
  assert.strictEqual(replacementEngine.applyReplacements(content, []).content, content);
});

runTest('REPL', 'applyReplacements: handles malformed rule items (null, non-iterable, numbers)', () => {
  const content = 'foo bar baz';
  // Array containing non-destructurable elements
  try {
    replacementEngine.applyReplacements(content, [
      ['foo', 'FOO'],
      null,
      ['bar', 'BAR'],
    ]);
    assert.fail('Should throw TypeError on null element in rules array');
  } catch (err) {
    assert(err instanceof TypeError, 'Expected TypeError on null rule element');
  }
});

runTest('REPL', 'applyReplacements: non-string oldStr ignored safely', () => {
  const content = '123 456';
  const rules = [
    [123, 'one-two-three'],
    [null, 'null'],
    [undefined, 'undefined'],
    [{}, 'obj'],
    ['456', 'four-five-six'],
  ];
  const res = replacementEngine.applyReplacements(content, rules);
  assert.strictEqual(res.content, '123 four-five-six');
  assert.strictEqual(res.appliedCount, 1);
});

runTest('REPL', 'applyReplacements: empty string oldStr behavior', () => {
  const content = 'abc';
  // In JS: "abc".includes("") is true, and "abc".replace("", "Z") -> "Zabc"
  const res = replacementEngine.applyReplacements(content, [['', 'Z']]);
  assert.strictEqual(res.content, 'Zabc');
  assert.strictEqual(res.appliedCount, 1);
});

// 1.2 Replacement behavior: single vs multiple occurrence semantics
runTest('REPL', 'applyReplacements: behavior on multiple identical occurrences (single replacement)', () => {
  const content = 'token token token';
  const res = replacementEngine.applyReplacements(content, [['token', 'replaced']]);
  // JavaScript String.prototype.replace(string, string) replaces the FIRST occurrence
  assert.strictEqual(res.content, 'replaced token token');
  assert.strictEqual(res.appliedCount, 1);
});

// 1.3 Cascading and order-dependent replacements
runTest('REPL', 'applyReplacements: cascading rule evaluation order', () => {
  const content = 'ALPHA';
  const rules = [
    ['ALPHA', 'BETA'],
    ['BETA', 'GAMMA'],
  ];
  const res = replacementEngine.applyReplacements(content, rules);
  // Sequential replacement: ALPHA -> BETA, then BETA -> GAMMA
  assert.strictEqual(res.content, 'GAMMA');
  assert.strictEqual(res.appliedCount, 2);
  assert.strictEqual(res.matchedRules, 2);
});

// 1.4 Dollar sign and regex special patterns in newStr
runTest('REPL', 'applyReplacements: special replacement patterns ($$, $&, $\', $`) in newStr', () => {
  const content = 'const price = "OLD";';
  const res = replacementEngine.applyReplacements(content, [
    ['"OLD"', '"$100"'],
  ]);
  assert.strictEqual(res.content, 'const price = "$100";');

  const res2 = replacementEngine.applyReplacements('TAG', [
    ['TAG', '[$$]'], // $$ becomes $ in String.prototype.replace
  ]);
  assert.strictEqual(res2.content, '[$]');

  const res3 = replacementEngine.applyReplacements('X', [
    ['X', '[$&]'], // $& inserts matched string 'X'
  ]);
  assert.strictEqual(res3.content, '[X]');
});

// 1.5 Unicode, Emoji, CJK, and Zero-Width characters
runTest('REPL', 'applyReplacements: complex Unicode, Emojis, and multi-byte characters', () => {
  const content = '欢迎使用 🚀 Antigravity 汉化补丁！\u200D\uFEFF【测试文本】';
  const rules = [
    ['欢迎使用', 'Welcome to'],
    ['🚀', '✨'],
    ['\u200D\uFEFF', ''],
    ['【测试文本】', '[Test Text]'],
  ];
  const res = replacementEngine.applyReplacements(content, rules);
  assert.strictEqual(res.content, 'Welcome to ✨ Antigravity 汉化补丁！[Test Text]');
  assert.strictEqual(res.appliedCount, 4);
});

// 1.6 Stress: High-volume content and rules
runTest('REPL', 'applyReplacements: 2,500 replacements in large 600KB buffer stress test', () => {
  const lines = [];
  const rules = [];
  for (let i = 0; i < 8000; i++) {
    lines.push(`const var_${i} = "original_value_${i}_with_some_longer_padding_text_for_volume";`);
    if (i % 2 === 0 && rules.length < 2500) {
      rules.push([`"original_value_${i}_with_some_longer_padding_text_for_volume"`, `"localized_value_${i}"`]);
    }
  }
  const bigContent = lines.join('\n');
  assert(bigContent.length > 500000, `Buffer length was ${bigContent.length}`);

  const start = process.hrtime.bigint();
  const res = replacementEngine.applyReplacements(bigContent, rules);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.strictEqual(res.appliedCount, 2500);
  assert.strictEqual(res.matchedRules, 2500);
  assert(res.content.includes('"localized_value_0"'));
  assert(res.content.includes('"original_value_1_with_some_longer_padding_text_for_volume"'));
  console.log(`      (2,500 rules applied to 6,000 lines (${(bigContent.length / 1024).toFixed(1)}KB) in ${durationMs.toFixed(2)}ms)`);
  assert(durationMs < 5000, 'Replacement performance exceeded 5s threshold');
});

// 1.7 Filesystem: Malformed JSON rules and dry-run guarantees
runTest('REPL', 'patchTargetFile: malformed JSON rules file handled cleanly without crash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-malformed-'));
  try {
    const target = path.join(tmp, 'app.js');
    const rules = path.join(tmp, 'bad.rules.json');
    fs.writeFileSync(target, 'const x = 1;', 'utf8');
    fs.writeFileSync(rules, '{"invalid_json": [missing bracket', 'utf8');

    const stat = replacementEngine.patchTargetFile(target, rules);
    assert.strictEqual(stat.applied, 0);
    assert.strictEqual(stat.rulesMissing, true);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'const x = 1;');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

runTest('REPL', 'patchTargetFile: dry-run strictly prevents file write', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-dry-'));
  try {
    const target = path.join(tmp, 'target.js');
    const rules = path.join(tmp, 'rules.json');
    fs.writeFileSync(target, 'const a = "foo";', 'utf8');
    fs.writeFileSync(rules, JSON.stringify([['"foo"', '"bar"']]), 'utf8');

    const mtimeBefore = fs.statSync(target).mtimeMs;
    const stat = replacementEngine.patchTargetFile(target, rules, { isDryRun: true });
    const mtimeAfter = fs.statSync(target).mtimeMs;

    assert.strictEqual(stat.applied, 1);
    assert.strictEqual(mtimeBefore, mtimeAfter);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'const a = "foo";');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

runTest('REPL', 'patchAllTargets: silent when logger is null', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-logger-'));
  try {
    const res = replacementEngine.patchAllTargets(tmp, tmp, {}, { logger: null });
    assert.strictEqual(res.totalApplied, 0);
    assert.deepStrictEqual(res.fileStats, {});
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


// ============================================================================
// SUITE 2: DICTIONARY MANAGER
// ============================================================================
console.log('\n--- SUITE 2: dict-manager.js ---');

// 2.1 parseTermLine delimiter precedence and edge cases
runTest('DICT', 'parseTermLine: delimiter precedence (=> over = when both exist)', () => {
  const item = dictManager.parseTermLine('Action => Execute');
  assert.deepStrictEqual(item, { src: 'Action', dst: 'Execute' });

  const item2 = dictManager.parseTermLine('Equation => x = y + 1');
  assert.deepStrictEqual(item2, { src: 'Equation', dst: 'x = y + 1' });

  const item3 = dictManager.parseTermLine('key = val = extra');
  assert.deepStrictEqual(item3, { src: 'key', dst: 'val = extra' });

  const item4 = dictManager.parseTermLine('Label ： 标签');
  assert.deepStrictEqual(item4, { src: 'Label', dst: '标签' });
});

runTest('DICT', 'parseTermLine: strict whitespace rule (zero-tolerance for edge spaces)', () => {
  assert.deepStrictEqual(dictManager.parseTermLine(' Leading = val'), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('Trailing = val '), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('Term = val\t'), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('\tTerm = val'), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine(''), null);
  assert.deepStrictEqual(dictManager.parseTermLine('   '), null);
  assert.deepStrictEqual(dictManager.parseTermLine('# comment'), null);
});

runTest('DICT', 'parseTermLine: delimiter at index 0 is invalid', () => {
  assert.deepStrictEqual(dictManager.parseTermLine('= only translation'), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('=> only translation'), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('：只有译文'), { invalid: true });
});

runTest('DICT', 'parseTermLine: empty destination after delimiter is invalid', () => {
  assert.deepStrictEqual(dictManager.parseTermLine('Term ='), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('Term =>   '), { invalid: true });
  assert.deepStrictEqual(dictManager.parseTermLine('Term ：'), { invalid: true });
});

// 2.2 Security: Prototype Pollution and Special Key resistance
runTest('DICT', 'dict-manager: prototype pollution resistance on standard object', () => {
  const dict = {};
  const maliciousLines = [
    '__proto__ = [polluted]',
    'constructor = [polluted]',
    'toString = [polluted]',
    'valueOf = [polluted]',
    'hasOwnProperty = [polluted]',
  ];
  dictManager.processTerms(maliciousLines, dict);

  // Verify Object prototype was not polluted
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(Object.prototype.polluted, undefined);
  assert.strictEqual(typeof ({}).toString, 'function');
  assert.strictEqual(typeof ({}).hasOwnProperty, 'function');

  // Verify dict itself safely recorded the keys
  assert.strictEqual(dict['toString'], '[polluted]');
  assert.strictEqual(dict['constructor'], '[polluted]');
});

// 2.3 Redundancy & Normalization checks
const standardNorm = (s) => s.toLowerCase().trim().replace(/[.!?…]+$/, '');

runTest('DICT', 'checkRedundancy: detects case and punctuation variants accurately', () => {
  const dict = {
    'Save': '保存',
    'Open...': '打开...',
  };
  const idx = dictManager.buildNormalizationIndex(dict, standardNorm);

  // Identical normalized key + identical translation => redundant
  const r1 = dictManager.checkRedundancy('save', '保存', dict, idx, standardNorm);
  assert.strictEqual(r1.isRedundant, true);
  assert.strictEqual(r1.existingKey, 'Save');

  // Identical normalized key + null translation (placeholder) => redundant (prevents shadowing)
  const r2 = dictManager.checkRedundancy('SAVE', null, dict, idx, standardNorm);
  assert.strictEqual(r2.isRedundant, true);

  // Identical normalized key + different translation => NOT redundant (meaningful variant)
  const r3 = dictManager.checkRedundancy('Save', '存储', dict, idx, standardNorm);
  assert.strictEqual(r3.isRedundant, false);
});

runTest('DICT', 'findRedundantVariants: removes redundant variants while keeping canonical', () => {
  const dict = {
    'Dashboard': '仪表盘',
    'dashboard': '仪表盘',
    'DASHBOARD': '仪表盘',
    'Close': '关闭',
    'Close...': '关闭...', // different translation
  };
  const norm = (s) => s.toLowerCase();
  const res = dictManager.findRedundantVariants(dict, norm);

  assert.strictEqual(res.removed.length, 2); // 'Dashboard' and 'DASHBOARD' removed, 'dashboard' kept
  assert.strictEqual(dict['dashboard'], '仪表盘');
  assert.strictEqual(dict['Dashboard'], undefined);
  assert.strictEqual(dict['DASHBOARD'], undefined);
  assert.strictEqual(dict['Close'], '关闭');
  assert.strictEqual(dict['Close...'], '关闭...');
});

// 2.4 High-volume dictionary processing stress test
runTest('DICT', 'processTerms: batch stress with 20,000 mixed lines', () => {
  const lines = [];
  for (let i = 0; i < 10000; i++) {
    lines.push(`Item ${i} = 项目 ${i}`);
    lines.push(`item ${i} = 项目 ${i}`); // lowercase redundant
  }
  const dict = {};
  const start = process.hrtime.bigint();
  const res = dictManager.processTerms(lines, dict, {
    normKeyFn: (s) => s.toLowerCase(),
  });
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.strictEqual(res.added.length, 10000);
  assert.strictEqual(res.redundant.length, 10000);
  assert.strictEqual(res.invalid.length, 0);
  assert.strictEqual(Object.keys(dict).length, 10000);
  console.log(`      (Processed 20,000 terms in ${durationMs.toFixed(2)}ms)`);
  assert(durationMs < 10000, 'Batch dictionary processing exceeded 10s threshold');
});

runTest('DICT', 'validateDictionary: static audit catches empty keys/values and untrimmed tokens', () => {
  const badDict = {
    '': 'empty key',
    'emptyVal': '',
    ' leadingSpace': 'val',
    'trailingSpace ': 'val',
    'key': ' valWithLeadingSpace',
    'key2': 'valWithTrailingSpace ',
  };
  const problems = dictManager.validateDictionary(badDict);
  assert.strictEqual(problems.length, 6);
});


// ============================================================================
// SUITE 3: ZIP ENCODER / DECODER
// ============================================================================
console.log('\n--- SUITE 3: zip.js ---');

// 3.1 CRC32 edge cases and standard vectors
runTest('ZIP', 'crc32: standard vectors, zero-length, and large buffer', () => {
  assert.strictEqual(zipLib.crc32(Buffer.alloc(0)), 0);
  assert.strictEqual(zipLib.crc32(Buffer.from('123456789', 'utf8')), 0xcbf43926);
  assert.strictEqual(zipLib.crc32(Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8')), 0x414fa339);

  // Large 5MB buffer CRC32
  const largeBuf = Buffer.alloc(5 * 1024 * 1024, 0x42);
  const start = process.hrtime.bigint();
  const crc = zipLib.crc32(largeBuf);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert(typeof crc === 'number' && Number.isInteger(crc) && crc >= 0);
  console.log(`      (5MB CRC32 computed in ${durationMs.toFixed(2)}ms, CRC=0x${crc.toString(16)})`);
});

// 3.2 dosDateTime boundary testing
runTest('ZIP', 'dosDateTime: boundary years and epoch clamping', () => {
  // Epoch 0 (1970) -> Clamped to 1980
  const d0 = zipLib.dosDateTime(0);
  assert.strictEqual(d0.date >> 9, 0); // 1980 - 1980 = 0

  // Negative epoch -> Clamped to 1980
  const dNeg = zipLib.dosDateTime(-1000);
  assert.strictEqual(dNeg.date >> 9, 0);

  // NaN / invalid string -> Clamped to 1980
  const dNaN = zipLib.dosDateTime('invalid');
  assert.strictEqual(dNaN.date >> 9, 0);

  // Normal date
  const dNormal = zipLib.dosDateTime(1704067200); // 2024-01-01 00:00:00 UTC
  const yearOffset = dNormal.date >> 9;
  assert.strictEqual(yearOffset, 2024 - 1980);
});

// 3.3 Zero-length entries and empty zip
runTest('ZIP', 'buildZip & readZip: 0 entries (empty zip container)', () => {
  const zipBuf = zipLib.buildZip([], { time: 0, date: 0 });
  assert.strictEqual(zipBuf.length, 22); // Exactly 22 bytes EOCD
  const entries = zipLib.readZip(zipBuf);
  assert.deepStrictEqual(entries, []);
});

runTest('ZIP', 'buildZip & readZip: entries with 0-byte payload', () => {
  const entries = [
    { name: 'empty1.txt', data: Buffer.alloc(0) },
    { name: 'empty2.txt', data: Buffer.alloc(0) },
    { name: 'normal.txt', data: Buffer.from('hello', 'utf8') },
  ];
  const zipBuf = zipLib.buildZip(entries, { time: 10, date: 10 });
  const read = zipLib.readZip(zipBuf);
  assert.strictEqual(read.length, 3);
  assert.strictEqual(read[0].name, 'empty1.txt');
  assert.strictEqual(read[0].size, 0);
  assert.strictEqual(read[0].crc, 0);
  assert.strictEqual(read[2].size, 5);
});

// 3.4 Unicode, path traversal names, and deep directories
runTest('ZIP', 'buildZip & readZip: Chinese, emoji, and path traversal filenames', () => {
  const entries = [
    { name: '汉字目录/测试文件.json', data: Buffer.from('{"ok":true}', 'utf8') },
    { name: '🚀/emoji_name.txt', data: Buffer.from('emoji', 'utf8') },
    { name: '../../traversal/test.bat', data: Buffer.from('echo test', 'utf8') },
  ];
  const zipBuf = zipLib.buildZip(entries, { time: 100, date: 100 });
  const read = zipLib.readZip(zipBuf);
  assert.strictEqual(read.length, 3);
  assert.strictEqual(read[0].name, '汉字目录/测试文件.json');
  assert.strictEqual(read[1].name, '🚀/emoji_name.txt');
  assert.strictEqual(read[2].name, '../../traversal/test.bat');
});

// 3.5 High entry count stress test (1,000 files in ZIP)
runTest('ZIP', 'buildZip & readZip: 1,000 files in-memory stress test', () => {
  const entries = [];
  for (let i = 0; i < 1000; i++) {
    entries.push({
      name: `sub/path_${i}/file_${i}.txt`,
      data: Buffer.from(`file content for entry ${i}\n`, 'utf8'),
    });
  }
  const start = process.hrtime.bigint();
  const zipBuf = zipLib.buildZip(entries, { time: 50, date: 50 });
  const read = zipLib.readZip(zipBuf);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.strictEqual(read.length, 1000);
  assert.strictEqual(read[500].name, 'sub/path_500/file_500.txt');
  console.log(`      (Packed and parsed 1,000 zip entries in ${durationMs.toFixed(2)}ms, size=${zipBuf.length} bytes)`);
  assert(durationMs < 5000, 'Zip processing for 1,000 entries exceeded 5s threshold');
});

// 3.6 Corrupted buffer fuzzing & robust error detection
runTest('ZIP', 'readZip: buffers under 22 bytes trigger clear exception', () => {
  assert.throws(() => zipLib.readZip(Buffer.alloc(0)), /不是有效的 zip/);
  assert.throws(() => zipLib.readZip(Buffer.alloc(10)), /不是有效的 zip/);
  assert.throws(() => zipLib.readZip(Buffer.alloc(21)), /不是有效的 zip/);
});

runTest('ZIP', 'readZip: corrupted signatures & data tampering fail cleanly', () => {
  const valid = zipLib.buildZip([{ name: 'test.txt', data: Buffer.from('abcdef') }], { time: 1, date: 1 });

  // 1. Corrupt EOCD signature (last 22 bytes)
  const badEocd = Buffer.from(valid);
  badEocd.writeUInt32LE(0x00000000, badEocd.length - 22);
  assert.throws(() => zipLib.readZip(badEocd), /不是有效的 zip/);

  // 2. Corrupt Central Directory signature
  const badCd = Buffer.from(valid);
  const cdOffset = badCd.readUInt32LE(badCd.length - 22 + 16);
  badCd.writeUInt32LE(0x99999999, cdOffset);
  assert.throws(() => zipLib.readZip(badCd), /中央目录条目签名错误/);

  // 3. Non-store method tampering
  const badMethod = Buffer.from(valid);
  badMethod.writeUInt16LE(8, cdOffset + 10);
  assert.throws(() => zipLib.readZip(badMethod), /不是 store 模式/);

  // 4. Missing UTF-8 flag tampering
  const badFlags = Buffer.from(valid);
  badFlags.writeUInt16LE(0x0000, cdOffset + 8);
  assert.throws(() => zipLib.readZip(badFlags), /未标记 UTF-8/);

  // 5. Corrupted data payload (CRC mismatch)
  const badData = Buffer.from(valid);
  badData[38] ^= 0xff; // Flip a byte in the payload
  assert.throws(() => zipLib.readZip(badData), /CRC 校验失败/);
});

runTest('ZIP', 'buildZip & readZip: supports directory entries with trailing slash and 0 bytes', () => {
  const entries = [
    { name: 'parent/', data: Buffer.alloc(0) },
    { name: 'parent/child.txt', data: Buffer.from('child content', 'utf8') },
  ];
  const zipBuf = zipLib.buildZip(entries, { time: 20, date: 20 });
  const read = zipLib.readZip(zipBuf);
  assert.strictEqual(read.length, 2);
  assert.strictEqual(read[0].name, 'parent/');
  assert.strictEqual(read[0].size, 0);
  assert.strictEqual(read[1].name, 'parent/child.txt');
});

runTest('ZIP', 'dosDateTime: epoch >= 2108 boundary causes RangeError due to 16-bit DOS date limit', () => {
  const stamp = zipLib.dosDateTime(4354819200); // Year 2108
  assert.throws(() => {
    zipLib.buildZip([{ name: 'future.txt', data: Buffer.from('data') }], stamp);
  }, /out of range/i);
});

runTest('ZIP', 'readZip: truncated local data triggers length mismatch error', () => {
  const valid = zipLib.buildZip([{ name: 'test.txt', data: Buffer.from('1234567890') }], { time: 1, date: 1 });
  // Truncate the buffer so the last 5 bytes of data are missing
  const truncated = valid.subarray(0, valid.length - 27); // cut into payload
  assert.throws(() => zipLib.readZip(truncated), /(不是有效的 zip|长度不符|CRC 校验失败)/);
});

runTest('ZIP', 'readZip: supports archive with valid trailing comment', () => {
  const valid = zipLib.buildZip([{ name: 'commented.txt', data: Buffer.from('content') }], { time: 1, date: 1 });
  // Append 100 bytes comment at the end of the ZIP
  const comment = Buffer.from('This is a trailing ZIP archive comment', 'utf8');
  // Update EOCD comment length field (offset 20 in EOCD)
  valid.writeUInt16LE(comment.length, valid.length - 2);
  const withComment = Buffer.concat([valid, comment]);

  const read = zipLib.readZip(withComment);
  assert.strictEqual(read.length, 1);
  assert.strictEqual(read[0].name, 'commented.txt');
});

runTest('ZIP', 'readZip: 500 fuzz iterations with random mutations catch errors gracefully', () => {
  const seedZip = zipLib.buildZip([
    { name: 'alpha.txt', data: Buffer.from('alpha payload', 'utf8') },
    { name: 'beta.json', data: Buffer.from('{"key":"value"}', 'utf8') },
  ], { time: 10, date: 10 });

  let handledErrors = 0;
  for (let i = 0; i < 500; i++) {
    const fuzzed = Buffer.from(seedZip);
    const mutateCount = 1 + Math.floor(Math.random() * 8);
    for (let m = 0; m < mutateCount; m++) {
      const idx = Math.floor(Math.random() * fuzzed.length);
      fuzzed[idx] ^= Math.floor(1 + Math.random() * 254);
    }
    const targetBuf = Math.random() < 0.2
      ? fuzzed.subarray(0, Math.floor(Math.random() * fuzzed.length))
      : fuzzed;

    try {
      zipLib.readZip(targetBuf);
    } catch (err) {
      assert(err instanceof Error);
      handledErrors++;
    }
  }
  console.log(`      (Fuzzing: 500 iterations executed, ${handledErrors} caught exceptions without process crash)`);
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n======================================================');
console.log(`CHALLENGER RESULTS: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
console.log('======================================================\n');

if (failedTests > 0) {
  console.error('FAILURES SUMMARY:');
  for (const f of failures) {
    console.error(`- ${f.label}\n  ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY.');
  process.exit(0);
}
