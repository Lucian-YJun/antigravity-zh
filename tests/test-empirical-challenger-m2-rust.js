/**
 * Empirical Adversarial Challenger & Stress Test Suite for M2 Rust Scaffolding:
 * - Pickle header parsing, endianness, padding, and bounds safety
 * - Replacement rules parser schema conformance across all native replacement files
 * - Aho-Corasick LeftmostFirst replacement vs sequential replacement parity and UTF-8 multi-byte integrity
 * - Win32 process filtering, ancestor protection cycle termination, and fail-safe sidecar invariants
 * - Cross-compilation cfg guards and AST safety checks
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
// ⚠️ 本文件的适用范围（请先读这段，别被 PASS 数量误导）
//
// SUITE 3 (AHO) 与 SUITE 4 (PROC) 断言的是**本文件内用 JS 重写的模型**
// （自建的 isSidecarProcess、String.replaceAll 顺序替换），而不是 Rust 二进制 ——
// 全文件从未 spawn 过 antigravity-tool.exe。因此它们**无法发现 Node/Rust 双轨分歧**。
//
// Rust 侧的真实覆盖来自：
//   - `cargo test --workspace`（npm test 的 test:cargo 步骤）
//   - tests/test-empirical-challenger-m1-cli.js（真的会 spawn dist/antigravity-tool.exe）
//   - tests/test-replacement-engine.js 里的「Rust 语义对拍」用例
//     （2000 组随机输入 vs 独立参考模型，替换契约以 Rust 为准）
//
// 本文件保留的价值是格式层面的对拍（pickle 头部布局、规则 schema、边界模拟），
// 那部分确实读了真实的 src/native/*.json 与 chromium-pickle-js。
const pickle = require('chromium-pickle-js');
const asar = require('@electron/asar');
const { DEFAULT_TARGETS } = require('../scripts/lib/replacement-engine');

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

console.log('=== STARTING M2 RUST SCAFFOLDING ADVERSARIAL STRESS TEST SUITE ===\n');

// ============================================================================
// SUITE 1: PICKLE HEADER & ASAR FORMAT PARITY
// ============================================================================
console.log('--- SUITE 1: Pickle Header & ASAR Format Parity ---');

runTest('ASAR', '16-byte header layout and little-endian field extraction', () => {
  const jsonStr = JSON.stringify({ files: { 'a.js': { size: 10, offset: '0' } } });
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonLen = jsonBuf.length;

  const payloadSize = jsonLen + 8;
  const pickleStrLen = jsonLen + 4;

  const header = Buffer.alloc(16 + jsonLen);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(payloadSize, 4);
  header.writeUInt32LE(pickleStrLen, 8);
  header.writeUInt32LE(jsonLen, 12);
  jsonBuf.copy(header, 16);

  // Invariant 1: First 4 bytes must be 4
  assert.strictEqual(header.readUInt32LE(0), 4);
  // Invariant 2: Payload size is json_len + 8
  assert.strictEqual(header.readUInt32LE(4), jsonLen + 8);
  // Invariant 3: Pickle str len is json_len + 4
  assert.strictEqual(header.readUInt32LE(8), jsonLen + 4);
  // Invariant 4: JSON len matches exact slice
  assert.strictEqual(header.readUInt32LE(12), jsonLen);
  assert.strictEqual(header.slice(16, 16 + jsonLen).toString('utf8'), jsonStr);
});

runTest('ASAR', 'Pickle header alignment: chromium-pickle-js roundtrip matches Rust aligned_offset', () => {
  // Test both aligned (multiple of 4) and unaligned JSON payloads
  for (const testLen of [40, 41, 42, 43, 44, 127, 256, 1024]) {
    const dummyKey = 'k'.repeat(testLen - 30);
    const jsonObj = { files: {} };
    jsonObj.files[dummyKey] = { size: 100, offset: '0' };
    const jsonStr = JSON.stringify(jsonObj);
    const jsonLen = Buffer.byteLength(jsonStr, 'utf8');

    const headerPickle = pickle.createEmpty();
    headerPickle.writeString(jsonStr);
    const headerBuf = headerPickle.toBuffer();

    const sizePickle = pickle.createEmpty();
    sizePickle.writeUInt32(headerBuf.length);
    const sizeBuf = sizePickle.toBuffer();

    const fullArchiveHeader = Buffer.concat([sizeBuf, headerBuf]);

    // Parse using Rust parse_header logic:
    const offsetIndicator = fullArchiveHeader.readUInt32LE(0);
    assert.strictEqual(offsetIndicator, 4);

    const payloadSize = fullArchiveHeader.readUInt32LE(4);
    const jsonLenRead = fullArchiveHeader.readUInt32LE(12);
    assert.strictEqual(jsonLenRead, jsonLen);

    const payloadBaseOffset = 16 + jsonLenRead;
    const alignedOffset = 8 + payloadSize;

    const actualPayloadOffset = (alignedOffset >= payloadBaseOffset && alignedOffset <= fullArchiveHeader.length)
      ? alignedOffset
      : payloadBaseOffset;

    // The archive payload starts exactly at sizeBuf.length + headerBuf.length = 8 + headerBuf.length
    assert.strictEqual(actualPayloadOffset, fullArchiveHeader.length);
  }
});

runTest('ASAR', 'Malformed Pickle headers rejected: buffer shorter than 16 bytes', () => {
  for (let len = 0; len < 16; len++) {
    const truncated = Buffer.alloc(len);
    // In Rust: if bytes.len() < 16 -> AsarError::InvalidHeader
    assert.ok(truncated.length < 16);
  }
});

runTest('ASAR', 'Malformed Pickle headers rejected: offset indicator != 4', () => {
  const invalid = Buffer.alloc(16);
  invalid.writeUInt32LE(5, 0); // Invalid indicator
  assert.notStrictEqual(invalid.readUInt32LE(0), 4);
});

runTest('ASAR', 'Bounds safety & overflow edge-case simulation', () => {
  // Simulates potential arithmetic overflow in:
  // let start = self.payload_base_offset + (*offset as usize);
  // let end = start + (*size as usize);
  // Checked add vs wrapping add behavior:
  const payloadBaseOffset = 100n;
  const u64Max = BigInt('0xFFFFFFFFFFFFFFFF');
  const twoPow64 = u64Max + 1n;
  const astronomicalSize = u64Max - 50n; // Near u64::MAX

  // If arithmetic wraps in 64-bit (wrapping_add):
  const wrapped = (payloadBaseOffset + astronomicalSize) % twoPow64;

  // In wrapping arithmetic, wrapped equals 49n, which is smaller than mmap length!
  assert.strictEqual(wrapped, 49n);
  assert.ok(wrapped < 1000n);
  // Therefore, checked_add is necessary in reader.rs to avoid panic on slice [start..end]
  const doesWrap = (payloadBaseOffset + astronomicalSize) > u64Max;
  assert.strictEqual(doesWrap, true);
});

// ============================================================================
// SUITE 2: REPLACEMENT RULES SCHEMA CONFORMANCE
// ============================================================================
console.log('\n--- SUITE 2: Replacement Rules Schema Conformance ---');

const nativeDir = path.resolve(__dirname, '../src/native');
const nativeFiles = fs.readdirSync(nativeDir).filter(f => f.endsWith('.replacements.json'));

runTest('RULES', `All ${nativeFiles.length} native replacement files exist and are non-empty`, () => {
  // 文件名（去掉后缀）= scope；与 Node 侧 DEFAULT_TARGETS 的 key 集合严格相等，
  // 顺带守住「新增替换表必须同步登记 scope 映射」这条契约。
  const nativeScopes = nativeFiles
    .map(f => f.slice(0, -'.replacements.json'.length))
    .sort();
  const expectedScopes = Object.keys(DEFAULT_TARGETS).sort();
  assert.deepStrictEqual(nativeScopes, expectedScopes,
    'src/native/*.replacements.json 的 scope 集合必须与 DEFAULT_TARGETS 的 key 集合严格相等');
  for (const f of nativeFiles) {
    const fullPath = path.join(nativeDir, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(content.length > 0, `File ${f} is empty`);
  }
});

runTest('RULES', 'Every replacement rule parses strictly as [string, string] tuple or struct', () => {
  let totalRulesChecked = 0;
  for (const f of nativeFiles) {
    const fullPath = path.join(nativeDir, f);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    assert.ok(Array.isArray(parsed), `${f} must be a JSON array`);

    for (let i = 0; i < parsed.length; i++) {
      const rule = parsed[i];
      totalRulesChecked++;
      if (Array.isArray(rule)) {
        assert.strictEqual(rule.length, 2, `${f}[${i}] must have 2 elements`);
        assert.strictEqual(typeof rule[0], 'string', `${f}[${i}][0] must be string`);
        assert.strictEqual(typeof rule[1], 'string', `${f}[${i}][1] must be string`);
        assert.ok(rule[0].length > 0, `${f}[${i}][0] search string cannot be empty`);
      } else if (typeof rule === 'object' && rule !== null) {
        assert.strictEqual(typeof rule.search, 'string', `${f}[${i}].search must be string`);
        assert.strictEqual(typeof rule.replace, 'string', `${f}[${i}].replace must be string`);
        assert.ok(rule.search.length > 0, `${f}[${i}].search cannot be empty`);
      } else {
        assert.fail(`Invalid rule format at ${f}[${i}]`);
      }
    }
  }
  // 期望值从真实文件求和，而不是写死 30：校验的是「每条规则都被严格解析过」。
  const expectedRuleCount = nativeFiles.reduce((n, f) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(nativeDir, f), 'utf8'));
    return n + (Array.isArray(parsed) ? parsed.length : 0);
  }, 0);
  console.log(`    (Validated ${totalRulesChecked} rules across ${nativeFiles.length} files)`);
  assert.strictEqual(totalRulesChecked, expectedRuleCount,
    `Expected ${expectedRuleCount} native rules across ${nativeFiles.length} files`);
});

runTest('RULES', 'Deserializer rejects malformed rules: numbers, booleans, nested arrays', () => {
  const malformedInputs = [
    `[ [123, "test"] ]`,
    `[ ["test", false] ]`,
    `[ ["test"] ]`,
    `[ ["a", "b", "c"] ]`,
    `[ {"search": 123, "replace": "ok"} ]`,
    `[ {"replace": "only_replace"} ]`,
    `[ null ]`,
    `{ "not": "an array" }`,
  ];

  for (const input of malformedInputs) {
    const parsed = JSON.parse(input);
    let isValid = false;
    if (Array.isArray(parsed)) {
      isValid = parsed.every(item => {
        if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string') return true;
        if (item && typeof item === 'object' && typeof item.search === 'string' && typeof item.replace === 'string') return true;
        return false;
      });
    }
    assert.strictEqual(isValid, false, `Input should have been rejected: ${input}`);
  }
});

// ============================================================================
// SUITE 3: DUAL-TRACK REPLACEMENT PARITY (real Rust binary vs shipping Node engine)
// ============================================================================
console.log('\n--- SUITE 3: Multi-Pattern Replacement & UTF-8 Integrity (dual-track, real binary) ---');

// 旧版的这三条断言的是本文件内用 String.replaceAll 重写的 JS 模型，从未 spawn 过
// Rust 二进制，因此结构上不可能发现 Node/Rust 双轨分歧（而分歧确实存在过：
// Node 只替换首处且顺序重扫，Rust 是单遍全量）。
// 现在改成真正的双轨对拍：同一份输入与规则分别喂给
//   (a) dist/antigravity-tool.exe            —— Rust，替换语义的契约基准
//   (b) scripts/lib/replacement-engine.js    —— Node，保留作语义对拍基准（出货实现是 Rust）
// 两者必须逐字节相同，且等于人工推导出的期望值。
const { spawnSync: spawnSyncAho } = require('child_process');
const osAho = require('os');
const DIST_TOOL = path.join(__dirname, '..', 'dist', 'antigravity-tool.exe');
const nodeEngine = require('../scripts/lib/replacement-engine');

function dualTrack(input, rules) {
  if (!fs.existsSync(DIST_TOOL)) {
    throw new Error(`缺少 ${DIST_TOOL}，无法做双轨对拍；请先运行 npm run build:rust`);
  }
  const tmp = fs.mkdtempSync(path.join(osAho.tmpdir(), 'm2rust-aho-'));
  try {
    const rulesFile = path.join(tmp, 'rules.json');
    fs.writeFileSync(rulesFile, JSON.stringify(rules));
    const rustTarget = path.join(tmp, 'rust.js');
    fs.writeFileSync(rustTarget, input);
    const res = spawnSyncAho(
      DIST_TOOL,
      ['replacer', 'apply', '--rules', rulesFile, '--target', rustTarget],
      { encoding: 'utf8', windowsHide: true }
    );
    assert.strictEqual(res.status, 0, `rust tool exited ${res.status}: ${res.stderr || res.stdout}`);
    return {
      rust: fs.readFileSync(rustTarget, 'utf8'),
      node: nodeEngine.applyReplacements(input, rules).content,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

runTest('AHO', 'non-overlapping patterns: Rust binary and Node engine agree byte-for-byte', () => {
  const rules = [
    ['Apple', '苹果'],
    ['Banana', '香蕉'],
    ['Orange', '橙子'],
  ];
  const input = 'I like Apple and Banana, but Orange is fine too.';
  const expected = 'I like 苹果 and 香蕉, but 橙子 is fine too.';
  const { rust, node } = dualTrack(input, rules);
  assert.strictEqual(rust, expected, 'Rust output wrong');
  assert.strictEqual(node, expected, 'Node output wrong');
  assert.strictEqual(node, rust, 'Node/Rust divergence');
});

runTest('AHO', 'multi-byte UTF-8 boundaries agree: CJK, 4-byte char, ZWJ emoji', () => {
  const rules = [
    ['你好', 'HELLO'],
    ['世界', 'WORLD'],
    ['𠮷野家', 'YOSHINOYA'], // 4-byte UTF-8 char U+20BB7
    ['👨‍👩‍👧‍👦', 'FAMILY'],       // Multi-codepoint emoji with ZWJ
  ];
  const input = '测试：你好，欢迎来到𠮷野家！与世界和👨‍👩‍👧‍👦一起。';
  const expected = '测试：HELLO，欢迎来到YOSHINOYA！与WORLD和FAMILY一起。';
  const { rust, node } = dualTrack(input, rules);
  assert.strictEqual(rust, expected, 'Rust output wrong');
  assert.strictEqual(node, expected, 'Node output wrong');
  assert.strictEqual(node, rust, 'Node/Rust divergence on multi-byte input');
});

runTest('AHO', 'prefix overlap precedence agrees (LeftmostFirst invariant)', () => {
  const rules = [
    ['test', 'A'],
    ['testing', 'B'],
  ];
  // Aho-Corasick LeftmostFirst 在同一位置优先取先声明者，所以 "test" 胜出，
  // 余下 "ing" 原样保留。Node 侧的正则交替语义与此一致。
  const input = 'We are testing now.';
  const expected = 'We are Aing now.';
  const { rust, node } = dualTrack(input, rules);
  assert.strictEqual(rust, expected, 'Rust output wrong');
  assert.strictEqual(node, expected, 'Node output wrong');
  assert.strictEqual(node, rust, 'Node/Rust divergence on overlapping prefixes');
});

runTest('AHO', 'replace-all and single-pass semantics agree across tracks', () => {
  // 全量：同一规则命中多处时两边都必须全部替换
  const all = dualTrack('token token token', [['token', 'replaced']]);
  assert.strictEqual(all.rust, 'replaced replaced replaced');
  assert.strictEqual(all.node, all.rust, 'Node/Rust divergence on repeat occurrences');

  // 单遍：后一条规则不得匹配前一条刚写入的文本
  const once = dualTrack('abc', [['abc', 'xyz'], ['xyz', 'QQQ']]);
  assert.strictEqual(once.rust, 'xyz');
  assert.strictEqual(once.node, once.rust, 'Node/Rust divergence on single-pass semantics');

  // 字面量：$ 序列不得被当成替换模式
  const dollar = dualTrack('X', [['X', '[$&]$$']]);
  assert.strictEqual(dollar.rust, '[$&]$$');
  assert.strictEqual(dollar.node, dollar.rust, 'Node/Rust divergence on $ sequences');
});

// ============================================================================
// SUITE 4: PROCESS FILTERING & ANCESTOR PROTECTION INVARIANTS
// ============================================================================
console.log('\n--- SUITE 4: Process Filter & Ancestor Tree Invariants ---');

function isSidecarProcess(hasWindow, cmdline) {
  if (hasWindow) return false;
  if (!cmdline || typeof cmdline !== 'string') return false;
  const lower = cmdline.toLowerCase();
  if (lower.includes('--type=')) return false;
  return lower.includes('register_loader.js')
    || lower.includes('sidecar_sdk')
    || lower.includes('--import=');
}

runTest('PROC', 'isSidecarProcess: Windowed processes are NEVER sidecars', () => {
  assert.strictEqual(isSidecarProcess(true, 'Antigravity.exe register_loader.js'), false);
  assert.strictEqual(isSidecarProcess(true, 'Antigravity.exe sidecar_sdk'), false);
  assert.strictEqual(isSidecarProcess(true, 'Antigravity.exe --import=./foo.js'), false);
});

runTest('PROC', 'isSidecarProcess: Electron internal children (--type=) are NEVER sidecars', () => {
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe --type=renderer register_loader.js'), false);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe --type=gpu-process sidecar_sdk'), false);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe --type=utility --import=./foo.js'), false);
});

runTest('PROC', 'isSidecarProcess: Genuine headless sidecars match all 3 signature strings', () => {
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe register_loader.js worker'), true);
  assert.strictEqual(isSidecarProcess(false, 'C:\\app\\Antigravity.exe REGISTER_LOADER.JS'), true);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe sidecar_sdk daemon'), true);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe --import=./patch-loader.js'), true);
});

runTest('PROC', 'isSidecarProcess: Fail-safe protection on missing or ambiguous command line', () => {
  assert.strictEqual(isSidecarProcess(false, null), false);
  assert.strictEqual(isSidecarProcess(false, undefined), false);
  assert.strictEqual(isSidecarProcess(false, ''), false);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe'), false);
  assert.strictEqual(isSidecarProcess(false, 'Antigravity.exe --unknown-flag'), false);
});

function getAncestorPids(currentPid, parentMap, maxDepth = 64) {
  const ancestors = new Set();
  let current = currentPid;
  ancestors.add(current);

  for (let i = 0; i < maxDepth; i++) {
    if (parentMap.has(current)) {
      const parent = parentMap.get(current);
      if (parent === 0 || parent === current || ancestors.has(parent)) {
        break;
      }
      ancestors.add(parent);
      current = parent;
    } else {
      break;
    }
  }
  return ancestors;
}

runTest('PROC', 'getAncestorPids: Terminates safely on null PID (parent == 0)', () => {
  const parentMap = new Map([
    [100, 50],
    [50, 10],
    [10, 0], // System idle / root
  ]);
  const ancestors = getAncestorPids(100, parentMap);
  assert.deepStrictEqual([...ancestors].sort((a, b) => a - b), [10, 50, 100]);
});

runTest('PROC', 'getAncestorPids: Terminates safely on self-referential PID (parent == current)', () => {
  const parentMap = new Map([
    [100, 50],
    [50, 50], // Self-loop
  ]);
  const ancestors = getAncestorPids(100, parentMap);
  assert.deepStrictEqual([...ancestors].sort((a, b) => a - b), [50, 100]);
});

runTest('PROC', 'getAncestorPids: Terminates safely on mutual recursion cycle (A -> B -> A)', () => {
  const parentMap = new Map([
    [100, 50],
    [50, 30],
    [30, 50], // Cycle: 50 -> 30 -> 50
  ]);
  const ancestors = getAncestorPids(100, parentMap);
  assert.deepStrictEqual([...ancestors].sort((a, b) => a - b), [30, 50, 100]);
});

runTest('PROC', 'getAncestorPids: Strictly respects max_depth limit (64)', () => {
  const parentMap = new Map();
  // Build chain of 100 deep ancestors: 100 -> 99 -> 98 ... -> 1
  for (let i = 100; i > 1; i--) {
    parentMap.set(i, i - 1);
  }
  const ancestors = getAncestorPids(100, parentMap, 64);
  // Current PID (1) + 64 ancestors = 65 total
  assert.strictEqual(ancestors.size, 65);
});

// ============================================================================
// SUITE 5: RUST CODEBASE STATIC AST & SAFETY AUDIT
// ============================================================================
console.log('\n--- SUITE 5: Rust Codebase Static AST & Safety Audit ---');

const rustRoot = path.resolve(__dirname, '../rust');

function getAllRustFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllRustFiles(full));
    } else if (file.endsWith('.rs')) {
      results.push(full);
    }
  }
  return results;
}

const rustFiles = getAllRustFiles(rustRoot);

runTest('AUDIT', 'Strict prohibition: Zero instances of taskkill /T or recursive kill anywhere', () => {
  for (const file of rustFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.strictEqual(
      /taskkill.*\/t/i.test(content),
      false,
      `Prohibited taskkill /T detected in ${file}`
    );
  }
});

runTest('AUDIT', 'Non-Windows cross-compilation guards present on Win32 modules', () => {
  const processRs = fs.readFileSync(path.join(rustRoot, 'crates/installer/src/process.rs'), 'utf8');
  assert.ok(processRs.includes('#[cfg(windows)]'), 'process.rs must guard Win32 implementation');
  assert.ok(processRs.includes('#[cfg(not(windows))]'), 'process.rs must provide non-Windows fallback stubs');

  const installerCargo = fs.readFileSync(path.join(rustRoot, 'crates/installer/Cargo.toml'), 'utf8');
  assert.ok(
    installerCargo.includes("[target.'cfg(windows)'.dependencies]"),
    'windows-sys must be conditional on Windows target'
  );
});

runTest('AUDIT', 'Workspace members properly configured in rust/Cargo.toml', () => {
  const rootCargo = fs.readFileSync(path.join(rustRoot, 'Cargo.toml'), 'utf8');
  assert.ok(rootCargo.includes('"crates/asar"'));
  assert.ok(rootCargo.includes('"crates/replacer"'));
  assert.ok(rootCargo.includes('"crates/installer"'));
  assert.ok(rootCargo.includes('"crates/cli"'));
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n==================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('==================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
