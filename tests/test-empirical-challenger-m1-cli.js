/**
 * Empirical Adversarial Challenger & Stress Test Suite for Milestone M1:
 * Target Binaries:
 *   - dist/antigravity-tool.exe
 *   - rust/target/release/antigravity-tool.exe
 *
 * Verifies:
 *   1. Clean clap dispatch and help/version across all root & subcommands.
 *   2. Invalid subcommands, unknown flags, and type/argument mismatches exit with code 2 and no panic.
 *   3. Missing positional and named arguments exit with code 2 and no panic.
 *   4. Check subcommand handles default and nonexistent paths gracefully (exit code 0, no panic).
 *   5. ASAR operations handle nonexistent paths, 0-byte empty files, truncated headers,
 *      corrupted pickle fields, invalid JSON payloads, and out-of-bounds offsets cleanly (code 1, no panic).
 *   6. ASAR path traversal / Zip-slip vulnerability assessment.
 *   7. Replacer operations handle nonexistent files, empty files, malformed JSON rules gracefully (code 1, no panic).
 *   8. Process commands (list, kill-sidecars, close) execute cleanly (code 0, no panic).
 *   9. Binary equivalence / parity between dist/ and rust/target/release/.
 *  10. Zero panics under RUST_BACKTRACE=1 across all adversarial vectors.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { DEFAULT_TARGETS } = require('../scripts/lib/replacement-engine');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];
const failures = [];

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_BIN = path.join(ROOT_DIR, 'dist', 'antigravity-tool.exe');
const RELEASE_BIN = path.join(ROOT_DIR, 'rust', 'target', 'release', 'antigravity-tool.exe');

function runTool(binPath, args, options = {}) {
  const env = { ...process.env, RUST_BACKTRACE: '1', ...options.env };
  const res = spawnSync(binPath, args, {
    cwd: ROOT_DIR,
    env,
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const status = res.status;
  const panicked = stderr.includes('panicked at') || stdout.includes('panicked at');

  return { status, stdout, stderr, panicked, error: res.error };
}

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

console.log('=== STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M1 CLI) ===\n');

// 缺产物不再静默 exit(0)：旧行为会让这 36 个 Rust CLI 测试在任何没跑过
// `npm run build:rust` 的机器（包括 CI）上整片消失，而 npm test 依然全绿。
const ALLOW_MISSING_ARTIFACTS = process.env.AGY_ZH_ALLOW_MISSING_ARTIFACTS === '1';
if (!fs.existsSync(DIST_BIN) || !fs.existsSync(RELEASE_BIN)) {
  const msg = [
    '目标二进制缺失: dist/antigravity-tool.exe 或 rust/target/release/antigravity-tool.exe',
    '   请先运行 `npm run build:rust`。',
    '   缺产物即视为失败，以免本套件静默消失而整体仍然全绿。',
    '   确实只想跑其余套件时，显式设置 AGY_ZH_ALLOW_MISSING_ARTIFACTS=1。',
  ].join('\n');
  if (ALLOW_MISSING_ARTIFACTS) {
    console.log('⚠️ [SKIP]\n' + msg);
    process.exit(0);
  }
  console.error('❌ ' + msg);
  process.exit(1);
}

// ============================================================================
// SUITE 1: BINARY EXISTENCE & PARITY
// ============================================================================
console.log('--- SUITE 1: Binary Existence & Parity ---');

runTest('BIN', 'Target binaries exist and are non-empty', () => {
  assert(fs.existsSync(DIST_BIN), `Missing dist binary: ${DIST_BIN}`);
  assert(fs.existsSync(RELEASE_BIN), `Missing release binary: ${RELEASE_BIN}`);
  const distStat = fs.statSync(DIST_BIN);
  const relStat = fs.statSync(RELEASE_BIN);
  assert(distStat.size > 500000, `Dist binary unexpectedly small: ${distStat.size} bytes`);
  assert(relStat.size > 500000, `Release binary unexpectedly small: ${relStat.size} bytes`);
});

runTest('BIN', 'dist/ copy is byte-identical to rust/target/release/', () => {
  // 注意这一条的真实含义：它只证明 build:rust 里的 copyFileSync 生效了。
  // 因为 dist/ 就是从 target/release/ 复制来的，两者永远相等 —— 它无法发现
  // 「改了 .rs 却忘了重新构建」这种真正的过期风险。那由下一条守卫。
  const distBuf = fs.readFileSync(DIST_BIN);
  const relBuf = fs.readFileSync(RELEASE_BIN);
  const distHash = crypto.createHash('sha256').update(distBuf).digest('hex');
  const relHash = crypto.createHash('sha256').update(relBuf).digest('hex');
  assert.strictEqual(distHash, relHash, `Hash mismatch: dist=${distHash} vs release=${relHash}`);
});

runTest('BIN', 'dist binary is not stale relative to the Rust sources', () => {
  // 这条才有实际价值：源码改过但二进制没重新构建时，上面那条依然全绿，
  // 于是「测试通过」的二进制和仓库里的源码根本不是同一个东西。
  const rustRoot = path.join(__dirname, '..', 'rust');
  const binMtime = fs.statSync(DIST_BIN).mtimeMs;
  const newest = { mtime: 0, file: '' };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'target' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (/\.(rs|toml|lock)$/.test(e.name)) {
        const m = fs.statSync(full).mtimeMs;
        if (m > newest.mtime) { newest.mtime = m; newest.file = full; }
      }
    }
  };
  walk(rustRoot);
  assert(
    binMtime >= newest.mtime,
    `dist/antigravity-tool.exe 比最新的 Rust 源文件还旧，本套件跑的不是当前源码构建出的二进制。\n`
    + `       二进制 mtime: ${new Date(binMtime).toISOString()}\n`
    + `       最新源文件:   ${newest.file} @ ${new Date(newest.mtime).toISOString()}\n`
    + `       请运行 \`npm run build:rust\`。`
  );
});

// ============================================================================
// SUITE 2: CLI VERSION & HELP COMMAND DISPATCH
// ============================================================================
console.log('\n--- SUITE 2: CLI Version & Help Command Dispatch ---');

for (const [binName, binPath] of [['dist', DIST_BIN], ['release', RELEASE_BIN]]) {
  runTest('DISPATCH', `${binName}: --version returns code 0 and correct version`, () => {
    const res = runTool(binPath, ['--version']);
    assert.strictEqual(res.status, 0);
    assert(!res.panicked, 'Panic detected');
    // 从 package.json 读取期望版本，不再写死 —— 写死时版本一升就红，
    // 而真正该守的是「二进制自报版本与仓库版本一致」。
    const expected = require(path.join(__dirname, '..', 'package.json')).version;
    assert(
      res.stdout.includes(`antigravity-tool ${expected}`),
      `Unexpected version: ${res.stdout.trim()} (expected antigravity-tool ${expected})`
    );
  });

  runTest('DISPATCH', `${binName}: --help lists all 7 registered subcommands`, () => {
    const res = runTool(binPath, ['--help']);
    assert.strictEqual(res.status, 0);
    assert(!res.panicked, 'Panic detected');
    const expectedSubs = ['install', 'revert', 'sync', 'asar', 'process', 'replacer', 'check'];
    for (const sub of expectedSubs) {
      assert(res.stdout.includes(sub), `Help missing subcommand '${sub}'`);
    }
  });

  const subcommandsWithHelp = [
    ['install'],
    ['revert'],
    ['sync'],
    ['asar'],
    ['asar', 'extract'],
    ['asar', 'pack'],
    ['asar', 'list'],
    ['process'],
    ['process', 'list'],
    ['process', 'kill-sidecars'],
    ['process', 'close'],
    ['replacer'],
    ['replacer', 'apply'],
    ['replacer', 'batch'],
    ['check'],
  ];

  for (const cmdArgs of subcommandsWithHelp) {
    const cmdStr = cmdArgs.join(' ');
    runTest('DISPATCH', `${binName}: ${cmdStr} --help returns code 0 without panic`, () => {
      const res = runTool(binPath, [...cmdArgs, '--help']);
      assert.strictEqual(res.status, 0, `Expected 0 for ${cmdStr} --help, got ${res.status}`);
      assert(!res.panicked, `Panic detected on ${cmdStr} --help`);
      assert(res.stdout.toLowerCase().includes('usage:'), `Expected Usage output for ${cmdStr}`);
    });
  }
}

// ============================================================================
// SUITE 3: INVALID SUBCOMMANDS, UNKNOWN FLAGS & TYPE ERRORS
// ============================================================================
console.log('\n--- SUITE 3: Invalid Subcommands, Unknown Flags & Type Errors ---');

const invalidArgsMatrix = [
  { args: ['unknown_subcommand_foo'], desc: 'unrecognized root subcommand' },
  { args: ['--unknown-global-flag'], desc: 'unknown root flag' },
  { args: ['install', '--invalid-install-flag'], desc: 'unknown flag in install' },
  { args: ['revert', '--invalid-revert-flag'], desc: 'unknown flag in revert' },
  { args: ['sync', '--invalid-sync-flag'], desc: 'unknown flag in sync' },
  { args: ['sync', '--port', 'not_a_number'], desc: 'non-numeric port in sync' },
  { args: ['sync', '--port', '999999'], desc: 'overflowing u16 port in sync' },
  { args: ['asar', 'unknown_asar_sub'], desc: 'unrecognized asar subcommand' },
  { args: ['asar', 'extract', '--bogus'], desc: 'unknown flag in asar extract' },
  { args: ['process', 'unknown_proc_sub'], desc: 'unrecognized process subcommand' },
  { args: ['process', 'close', '--timeout', 'invalid_num'], desc: 'non-numeric timeout in process close' },
  { args: ['replacer', 'unknown_repl_sub'], desc: 'unrecognized replacer subcommand' },
  { args: ['replacer', 'apply', '--dry-run', '--unknown'], desc: 'unknown flag in replacer apply' },
  { args: ['check', '--invalid-check-flag'], desc: 'unknown flag in check' },
];

for (const item of invalidArgsMatrix) {
  runTest('MALFORMED', `CLI rejects ${item.desc} with code 2 and no panic`, () => {
    const res = runTool(DIST_BIN, item.args);
    assert.strictEqual(res.status, 2, `Expected code 2 for args [${item.args.join(' ')}], got ${res.status}`);
    assert(!res.panicked, `Panic detected on args [${item.args.join(' ')}]`);
    assert(res.stderr.toLowerCase().includes('error:'), `Stderr should state error for [${item.args.join(' ')}]`);
  });
}

// ============================================================================
// SUITE 4: MISSING REQUIRED ARGUMENTS
// ============================================================================
console.log('\n--- SUITE 4: Missing Required Arguments ---');

const missingArgsMatrix = [
  { args: ['asar', 'extract'], desc: 'asar extract without input and output' },
  { args: ['asar', 'extract', 'file.asar'], desc: 'asar extract without output' },
  { args: ['asar', 'pack'], desc: 'asar pack without input and output' },
  { args: ['asar', 'pack', 'some_dir'], desc: 'asar pack without output' },
  { args: ['asar', 'list'], desc: 'asar list without input' },
  { args: ['replacer', 'apply'], desc: 'replacer apply without --rules and --target' },
  { args: ['replacer', 'apply', '--rules', 'r.json'], desc: 'replacer apply without --target' },
  { args: ['replacer', 'batch'], desc: 'replacer batch without --rules-dir and --staging-dir' },
];

for (const item of missingArgsMatrix) {
  runTest('REQUIRED_ARGS', `CLI rejects ${item.desc} with code 2 and no panic`, () => {
    const res = runTool(DIST_BIN, item.args);
    assert.strictEqual(res.status, 2, `Expected code 2, got ${res.status}`);
    assert(!res.panicked, `Panic detected on ${item.desc}`);
    assert(res.stderr.toLowerCase().includes('error:'), `Expected error message in stderr`);
  });
}

// ============================================================================
// SUITE 5: CHECK SUBCOMMAND ADVERSARIAL STRESS
// ============================================================================
console.log('\n--- SUITE 5: Check Subcommand Adversarial Stress ---');

runTest('CHECK', 'Default check without arguments succeeds with code 0 without panic', () => {
  const res = runTool(DIST_BIN, ['check']);
  assert.strictEqual(res.status, 0, `Expected 0, got ${res.status}`);
  assert(!res.panicked, 'Panic detected');
  assert(res.stdout.includes('Antigravity Installation Health Check'));
});

runTest('CHECK', 'Check with nonexistent resources directory succeeds with code 0 and reports status', () => {
  const nonExistDir = path.join(os.tmpdir(), `nonexistent_dir_${Date.now()}`);
  const res = runTool(DIST_BIN, ['check', '--resources-dir', nonExistDir]);
  assert.strictEqual(res.status, 0, `Expected 0, got ${res.status}`);
  assert(!res.panicked, 'Panic detected');
  assert(res.stdout.includes('Resources directory:'));
  assert(res.stdout.includes('app.asar: Missing'));
});

runTest('CHECK', 'Check with a file path instead of directory handles cleanly without panic', () => {
  const tempFile = path.join(os.tmpdir(), `temp_file_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, 'dummy content');
  try {
    const res = runTool(DIST_BIN, ['check', '--resources-dir', tempFile]);
    assert.strictEqual(res.status, 0, `Expected 0, got ${res.status}`);
    assert(!res.panicked, 'Panic detected');
  } finally {
    fs.unlinkSync(tempFile);
  }
});

// ============================================================================
// SUITE 6: ASAR ADVERSARIAL STRESS (EMPTY, MALFORMED, NONEXISTENT, TRUNCATED)
// ============================================================================
console.log('\n--- SUITE 6: ASAR Adversarial Stress ---');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-stress-'));

try {
  runTest('ASAR', 'asar list on nonexistent archive exits with code 1 and no panic', () => {
    const nonExist = path.join(tempDir, 'does-not-exist.asar');
    const res = runTool(DIST_BIN, ['asar', 'list', nonExist]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('ASAR operation failed') || res.stderr.includes('I/O error'));
  });

  runTest('ASAR', 'asar extract on nonexistent archive exits with code 1 and no panic', () => {
    const nonExist = path.join(tempDir, 'does-not-exist.asar');
    const outDir = path.join(tempDir, 'out1');
    const res = runTool(DIST_BIN, ['asar', 'extract', nonExist, outDir]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('ASAR operation failed'));
  });

  runTest('ASAR', 'asar pack on nonexistent source dir exits with code 1 and no panic', () => {
    const nonExist = path.join(tempDir, 'no_source_dir');
    const outAsar = path.join(tempDir, 'out.asar');
    const res = runTool(DIST_BIN, ['asar', 'pack', nonExist, outAsar]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('ASAR operation failed'));
  });

  runTest('ASAR', 'asar list on 0-byte empty file exits with code 1 and no panic', () => {
    const emptyFile = path.join(tempDir, 'empty.asar');
    fs.writeFileSync(emptyFile, Buffer.alloc(0));
    const res = runTool(DIST_BIN, ['asar', 'list', emptyFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected on 0-byte file');
    assert(res.stderr.includes('Invalid ASAR header') || res.stderr.includes('smaller than 16-byte'));
  });

  runTest('ASAR', 'asar extract on 0-byte empty file exits with code 1 and no panic', () => {
    const emptyFile = path.join(tempDir, 'empty.asar');
    const outDir = path.join(tempDir, 'empty_out');
    const res = runTool(DIST_BIN, ['asar', 'extract', emptyFile, outDir]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected on 0-byte extract');
    assert(res.stderr.includes('Invalid ASAR header'));
  });

  runTest('ASAR', 'asar list on truncated file (10 bytes < 16-byte header) exits code 1', () => {
    const truncFile = path.join(tempDir, 'trunc10.asar');
    fs.writeFileSync(truncFile, Buffer.alloc(10, 0xAA));
    const res = runTool(DIST_BIN, ['asar', 'list', truncFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('smaller than 16-byte pickle header'));
  });

  runTest('ASAR', 'asar list on invalid pickle magic (offset indicator != 4) exits code 1', () => {
    const badMagicFile = path.join(tempDir, 'badmagic.asar');
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(999, 0); // Invalid indicator
    fs.writeFileSync(badMagicFile, buf);
    const res = runTool(DIST_BIN, ['asar', 'list', badMagicFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('Invalid pickle payload offset'));
  });

  runTest('ASAR', 'asar list with json_len exceeding file buffer exits code 1', () => {
    const badLenFile = path.join(tempDir, 'badlen.asar');
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(4, 0);
    buf.writeUInt32LE(1000, 4);
    buf.writeUInt32LE(996, 8);
    buf.writeUInt32LE(992, 12); // json_len = 992, but file is 16 bytes
    fs.writeFileSync(badLenFile, buf);
    const res = runTool(DIST_BIN, ['asar', 'list', badLenFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('exceeds total buffer size'));
  });

  runTest('ASAR', 'asar list with malformed JSON header exits code 1', () => {
    const badJsonFile = path.join(tempDir, 'badjson.asar');
    const junkJson = Buffer.from('this is completely invalid json!', 'utf8');
    const buf = Buffer.alloc(16 + junkJson.length);
    buf.writeUInt32LE(4, 0);
    buf.writeUInt32LE(junkJson.length + 8, 4);
    buf.writeUInt32LE(junkJson.length + 4, 8);
    buf.writeUInt32LE(junkJson.length, 12);
    junkJson.copy(buf, 16);
    fs.writeFileSync(badJsonFile, buf);
    const res = runTool(DIST_BIN, ['asar', 'list', badJsonFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('JSON header parse failure'));
  });

  runTest('ASAR', 'asar extract with out-of-bounds offset/size exits code 1 and no panic', () => {
    const oobFile = path.join(tempDir, 'oob.asar');
    const jsonStr = JSON.stringify({ files: { 'test.js': { size: 1000000, offset: '500' } } });
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const buf = Buffer.alloc(16 + jsonBuf.length);
    buf.writeUInt32LE(4, 0);
    buf.writeUInt32LE(jsonBuf.length + 8, 4);
    buf.writeUInt32LE(jsonBuf.length + 4, 8);
    buf.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(buf, 16);
    fs.writeFileSync(oobFile, buf);
    const outDir = path.join(tempDir, 'oob_out');
    const res = runTool(DIST_BIN, ['asar', 'extract', oobFile, outDir]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected on OOB archive');
    assert(res.stderr.includes('exceed archive size'));
  });

  runTest('ASAR', 'asar pack and round-trip extract on empty directory', () => {
    const emptyInputDir = path.join(tempDir, 'empty_dir');
    fs.mkdirSync(emptyInputDir);
    const packedAsar = path.join(tempDir, 'packed_empty.asar');
    const resPack = runTool(DIST_BIN, ['asar', 'pack', emptyInputDir, packedAsar]);
    assert.strictEqual(resPack.status, 0);
    assert(!resPack.panicked, 'Panic detected on pack empty dir');
    assert(fs.existsSync(packedAsar));

    const resList = runTool(DIST_BIN, ['asar', 'list', packedAsar]);
    assert.strictEqual(resList.status, 0);
    assert(resList.stdout.includes('Archive contains 0 entries'));

    const extractedDir = path.join(tempDir, 'extracted_empty');
    const resExtract = runTool(DIST_BIN, ['asar', 'extract', packedAsar, extractedDir]);
    assert.strictEqual(resExtract.status, 0);
    assert(fs.existsSync(extractedDir));
  });

  runTest('ASAR', 'asar pack and round-trip extract on directory with nested files and UTF-8 content', () => {
    const dataDir = path.join(tempDir, 'data_tree');
    fs.mkdirSync(path.join(dataDir, 'sub', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'root.txt'), 'Hello Root! 汉化测试 🚀');
    fs.writeFileSync(path.join(dataDir, 'sub', 'nested', 'deep.js'), 'console.log("Deep Nested!");');

    const packedAsar = path.join(tempDir, 'tree.asar');
    const resPack = runTool(DIST_BIN, ['asar', 'pack', dataDir, packedAsar]);
    assert.strictEqual(resPack.status, 0);
    assert(!resPack.panicked, 'Panic detected');

    const resList = runTool(DIST_BIN, ['asar', 'list', packedAsar]);
    assert.strictEqual(resList.status, 0);
    assert(resList.stdout.includes('root.txt'));
    assert(resList.stdout.includes('deep.js'));

    const extractedDir = path.join(tempDir, 'tree_extracted');
    const resExtract = runTool(DIST_BIN, ['asar', 'extract', packedAsar, extractedDir]);
    assert.strictEqual(resExtract.status, 0);
    assert.strictEqual(
      fs.readFileSync(path.join(extractedDir, 'root.txt'), 'utf8'),
      'Hello Root! 汉化测试 🚀'
    );
    assert.strictEqual(
      fs.readFileSync(path.join(extractedDir, 'sub', 'nested', 'deep.js'), 'utf8'),
      'console.log("Deep Nested!");'
    );
  });

  // Empirical Adversarial Challenge: ASAR Path Traversal (Zip Slip)
  runTest('ASAR', 'Adversarial Challenge: ASAR extraction with parent path navigation (..)', () => {
    const slipFile = path.join(tempDir, 'slip.asar');
    const payload = Buffer.from('CANARY_ESCAPED', 'utf8');
    const jsonStr = JSON.stringify({
      files: {
        '..': {
          files: {
            'canary.txt': { size: payload.length, offset: '0' },
          },
        },
      },
    });
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const buf = Buffer.alloc(16 + jsonBuf.length + payload.length);
    buf.writeUInt32LE(4, 0);
    buf.writeUInt32LE(jsonBuf.length + 8, 4);
    buf.writeUInt32LE(jsonBuf.length + 4, 8);
    buf.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(buf, 16);
    payload.copy(buf, 16 + jsonBuf.length);
    fs.writeFileSync(slipFile, buf);

    const targetSubdir = path.join(tempDir, 'sandbox', 'target_dir');
    fs.mkdirSync(targetSubdir, { recursive: true });

    const canaryPath = path.join(tempDir, 'sandbox', 'canary.txt');
    if (fs.existsSync(canaryPath)) fs.unlinkSync(canaryPath);

    const res = runTool(DIST_BIN, ['asar', 'extract', slipFile, targetSubdir]);
    assert(!res.panicked, 'Panic detected during extraction');

    if (fs.existsSync(canaryPath)) {
      // canary 被写到目标目录之外 = 确定的路径穿越 / 任意文件写回归，绝不能只「报告」
      // 一下就让本套件 exit(0)。先清理，再同时记入高危 findings（末尾 blockingFindings
      // 门禁会拦）并 assert.fail 直接把本用例判 FAIL（计入 failedTests，带完整现场）。
      fs.unlinkSync(canaryPath);
      findings.push({
        severity: 'CRITICAL_SECURITY_REGRESSION',
        title: 'Asar extraction does not sanitize relative path navigation (Zip Slip escape)',
        detail: `Archive containing '..' written outside target destination to ${canaryPath}`,
      });
      assert.fail(
        `Zip Slip regression: '..' entry escaped the extraction target and wrote ${canaryPath}. `
        + `stdout: ${res.stdout} | stderr: ${res.stderr}`
      );
    }
  });

} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ============================================================================
// SUITE 7: REPLACER ADVERSARIAL STRESS
// ============================================================================
console.log('\n--- SUITE 7: Replacer Adversarial Stress ---');

const replacerTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replacer-stress-'));

try {
  runTest('REPLACER', 'apply with nonexistent rules file exits code 1 and no panic', () => {
    const nonExistRules = path.join(replacerTmpDir, 'nonexistent_rules.json');
    const targetFile = path.join(replacerTmpDir, 'target.js');
    fs.writeFileSync(targetFile, 'content');
    const res = runTool(DIST_BIN, ['replacer', 'apply', '--rules', nonExistRules, '--target', targetFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('Rule file not found') || res.stderr.includes('I/O error'));
  });

  runTest('REPLACER', 'apply with 0-byte empty rules file exits code 1 and no panic', () => {
    const emptyRules = path.join(replacerTmpDir, 'empty_rules.json');
    fs.writeFileSync(emptyRules, '');
    const targetFile = path.join(replacerTmpDir, 'target.js');
    const res = runTool(DIST_BIN, ['replacer', 'apply', '--rules', emptyRules, '--target', targetFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('JSON parse error'));
  });

  runTest('REPLACER', 'apply with malformed JSON rules file exits code 1 and no panic', () => {
    const malformedRules = path.join(replacerTmpDir, 'malformed.json');
    fs.writeFileSync(malformedRules, '{ not valid json');
    const targetFile = path.join(replacerTmpDir, 'target.js');
    const res = runTool(DIST_BIN, ['replacer', 'apply', '--rules', malformedRules, '--target', targetFile]);
    assert.strictEqual(res.status, 1);
    assert(!res.panicked, 'Panic detected');
    assert(res.stderr.includes('JSON parse error'));
  });

  runTest('REPLACER', 'apply with valid rules executes cleanly (dry-run and live)', () => {
    const rulesFile = path.join(replacerTmpDir, 'valid_rules.json');
    fs.writeFileSync(
      rulesFile,
      JSON.stringify([
        ['Hello World', '你好世界'],
        ['Goodbye', '再见'],
      ])
    );
    const targetFile = path.join(replacerTmpDir, 'target.js');
    fs.writeFileSync(targetFile, 'console.log("Hello World");\nconsole.log("Goodbye");');

    // Dry-run
    const resDry = runTool(DIST_BIN, [
      'replacer',
      'apply',
      '--rules',
      rulesFile,
      '--target',
      targetFile,
      '--dry-run',
    ]);
    assert.strictEqual(resDry.status, 0);
    assert(!resDry.panicked, 'Panic detected in dry-run');
    // 输出格式已改：旧版把「替换处数」除以「规则总数」，多命中时会打出
    // "2/1 matches" 这种自相矛盾的行。现在分别报「命中规则数/规则总数」与「替换处数」。
    assert(resDry.stdout.includes('2/2 条规则命中'), `unexpected output: ${resDry.stdout}`);
    assert(resDry.stdout.includes('2 处替换'), `missing occurrence count: ${resDry.stdout}`);
    assert(
      resDry.stdout.includes('modified: false'),
      `dry-run must report modified: false (nothing was written): ${resDry.stdout}`
    );
    assert.strictEqual(
      fs.readFileSync(targetFile, 'utf8'),
      'console.log("Hello World");\nconsole.log("Goodbye");',
      'Dry-run must not modify file'
    );

    // Live run
    const resLive = runTool(DIST_BIN, [
      'replacer',
      'apply',
      '--rules',
      rulesFile,
      '--target',
      targetFile,
    ]);
    assert.strictEqual(resLive.status, 0);
    assert(!resLive.panicked, 'Panic detected in live run');
    assert(resLive.stdout.includes('2/2 条规则命中'), `unexpected output: ${resLive.stdout}`);
    assert(
      resLive.stdout.includes('modified: true'),
      `live run must report modified: true: ${resLive.stdout}`
    );
    assert.strictEqual(
      fs.readFileSync(targetFile, 'utf8'),
      'console.log("你好世界");\nconsole.log("再见");'
    );
  });

  runTest('REPLACER', 'batch replacer with nonexistent dirs reports every skipped scope without panic', () => {
    const nonExistDir1 = path.join(replacerTmpDir, 'no_rules');
    const nonExistDir2 = path.join(replacerTmpDir, 'no_staging');
    const res = runTool(DIST_BIN, [
      'replacer',
      'batch',
      '--rules-dir',
      nonExistDir1,
      '--staging-dir',
      nonExistDir2,
    ]);
    assert.strictEqual(res.status, 0);
    assert(!res.panicked, 'Panic detected');
    // 所有配置的 scope 的规则文件都不存在：必须逐条报「文件缺失，跳过」，
    // 不能再像旧版那样把它们静默丢掉、假装是 0 scopes 的正常空跑。
    const totalM = /Batch replacement completed \((\d+) scopes\)/.exec(res.stdout);
    const skippedM = /(\d+) scopes skipped/.exec(res.stdout);
    assert(totalM, `missing scope report; stdout: ${res.stdout}`);
    assert(skippedM, `missing skipped total; stdout: ${res.stdout}`);
    const scopeTotal = Number(totalM[1]);
    const scopeSkipped = Number(skippedM[1]);
    assert(scopeTotal > 0, 'scope 总数必须大于 0');
    assert.strictEqual(scopeSkipped, scopeTotal, '规则目录不存在时每个 scope 都应被跳过');
    assert.strictEqual(scopeTotal, Object.keys(DEFAULT_TARGETS).length,
      'Rust default_targets() 的 scope 数必须与 Node DEFAULT_TARGETS 一致');
    assert(
      res.stdout.includes('文件缺失，跳过'),
      `missing per-scope skip warning; stdout: ${res.stdout}`
    );
  });

} finally {
  fs.rmSync(replacerTmpDir, { recursive: true, force: true });
}

// ============================================================================
// SUITE 8: PROCESS SUBCOMMANDS
// ============================================================================
console.log('\n--- SUITE 8: Process Subcommands ---');

runTest('PROCESS', 'process list executes with code 0 and conforms to expected format', () => {
  const res = runTool(DIST_BIN, ['process', 'list']);
  assert.strictEqual(res.status, 0, `Expected 0, got ${res.status}`);
  assert(!res.panicked, 'Panic detected in process list');
  assert(res.stdout.includes('Active Antigravity processes ('), 'Missing header');
  // Match regex: PID \d+ \(PPID \d+\) \[window: (true|false), sidecar: (true|false)\]
  const lines = res.stdout.trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    assert(
      /PID\s+\d+\s+\(PPID\s+\d+\)\s+\[window:\s+(true|false),\s+sidecar:\s+(true|false)\]/.test(line),
      `Line did not match process format: ${line}`
    );
  }
});

runTest('PROCESS', 'process kill-sidecars executes cleanly with code 0 without panic', () => {
  const res = runTool(DIST_BIN, ['process', 'kill-sidecars']);
  assert.strictEqual(res.status, 0);
  assert(!res.panicked, 'Panic detected in kill-sidecars');
  assert(res.stdout.includes('Terminated') && res.stdout.includes('sidecar process(es)'));
});

// 本用例有两种合法结果：在 IDE 外部终端能正常关闭（code 0）；在 IDE 内部终端
// 则会命中产品刻意的安全护栏——拒绝关闭作为当前进程祖先的 IDE 进程（code 1）。
// 两者都不是缺陷，但任何 panic、缺少护栏特征或其他退出码都必须判 FAIL。
// 只认这条具体错误的完整结构，避免任何含「拒绝执行」四字的无关 exit 1 被误判通过：
//   1) main.rs 的 `Error:` + CliError::Installer 的 `Installer operation failed:`
//      + InstallerError::ProcessRunning 的 `Process still active:`（错误类型标识）；
//   2) rust/crates/installer/src/process.rs:473 的 `是当前进程的祖先进程`；
//   3) 同文件 474 行的 `因此拒绝执行`。
// 三者必须同时出现，单独一个词不再算命中。
function isAncestorGuardRejection(res) {
  const output = res.stdout + res.stderr;
  const signature =
    /Error:\s*Installer operation failed:\s*Process still active:[\s\S]*?是当前进程的祖先进程[\s\S]*?因此拒绝执行/;
  return signature.test(output);
}

runTest('PROCESS', 'process close with 1s timeout exits 0 cleanly or 1 with ancestor-guard signature, without panic', () => {
  const res = runTool(DIST_BIN, ['process', 'close', '--timeout', '1']);
  assert(!res.panicked, 'Panic detected in process close');
  if (res.status === 0) {
    assert(res.stdout.includes('Requesting graceful close'));
  } else if (res.status === 1) {
    assert(
      isAncestorGuardRejection(res),
      `exit 1 without ancestor-guard signature; stdout: ${res.stdout} | stderr: ${res.stderr}`
    );
  } else {
    assert.fail(`Unexpected exit status ${res.status}; stdout: ${res.stdout} | stderr: ${res.stderr}`);
  }
});

// ============================================================================
// SUITE 9: INSTALL & REVERT ADVERSARIAL STRESS
// ============================================================================
console.log('\n--- SUITE 9: Install & Revert Adversarial Stress ---');

runTest('INSTALL', 'install --dry-run with nonexistent resources-dir reports error and exits code 1', () => {
  const nonExistDir = path.join(os.tmpdir(), `nonexistent_res_${Date.now()}`);
  const res = runTool(DIST_BIN, ['install', '--dry-run', '--resources-dir', nonExistDir]);
  assert.strictEqual(res.status, 1, `Expected code 1, got ${res.status}`);
  assert(!res.panicked, 'Panic detected in install --dry-run');
  assert(res.stderr.includes('Error:'));
});

runTest('REVERT', 'revert with nonexistent resources-dir reports error and exits code 1', () => {
  const nonExistDir = path.join(os.tmpdir(), `nonexistent_res_${Date.now()}`);
  const res = runTool(DIST_BIN, ['revert', '--resources-dir', nonExistDir]);
  assert.strictEqual(res.status, 1, `Expected code 1, got ${res.status}`);
  assert(!res.panicked, 'Panic detected in revert');
  assert(res.stderr.includes('Error:'));
});

runTest('INSTALL', 'install with missing source assets fails with exit code 1 and leaves disk untouched', () => {
  const tmpSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-cli-no-assets-'));
  const resDir = path.join(tmpSandbox, 'resources');
  fs.mkdirSync(resDir, { recursive: true });
  const asarPath = path.join(resDir, 'app.asar');
  const dummyPayload = Buffer.from('FAKE_ASAR_PAYLOAD_FOR_TEST');
  fs.writeFileSync(asarPath, dummyPayload);
  const beforeHash = crypto.createHash('sha256').update(dummyPayload).digest('hex');

  const emptyAssetsDir = path.join(tmpSandbox, 'empty_assets');
  fs.mkdirSync(emptyAssetsDir, { recursive: true });

  const res = runTool(DIST_BIN, ['install', '--resources-dir', resDir, '--project-root', emptyAssetsDir]);
  assert.strictEqual(res.status, 1, `Expected code 1, got ${res.status}`);
  assert(!res.panicked, 'Panic detected');
  assert(res.stderr.includes('Localization source assets not found') || res.stderr.includes('Error:'));

  // Assert disk invariant: app.asar untouched, no backup, no app, no zh-patch
  assert(fs.existsSync(asarPath), 'app.asar must remain on disk');
  const afterHash = crypto.createHash('sha256').update(fs.readFileSync(asarPath)).digest('hex');
  assert.strictEqual(afterHash, beforeHash, 'app.asar content must be 100% byte-for-byte unmodified');
  assert(!fs.existsSync(path.join(resDir, 'app.asar.orig')), 'app.asar.orig must NOT be created');
  assert(!fs.existsSync(path.join(resDir, 'app')), 'app directory must NOT be created');
  assert(!fs.existsSync(path.join(resDir, 'zh-patch')), 'zh-patch directory must NOT be created');

  fs.rmSync(tmpSandbox, { recursive: true, force: true });
});

runTest('SYNC', 'sync with nonexistent --project-root fails early with code 1 and no panic', () => {
  const nonExistDir = path.join(os.tmpdir(), `nonexistent_root_${Date.now()}`);
  const res = runTool(DIST_BIN, ['sync', '--project-root', nonExistDir]);
  assert.strictEqual(res.status, 1, `Expected code 1, got ${res.status}`);
  assert(!res.panicked, 'Panic detected in sync with nonexistent project-root');
  assert(res.stderr.includes('Specified project root does not exist') || res.stderr.includes('Error:'));
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log(`EMPIRICAL STRESS TEST COMPLETE:`);
console.log(`Total tests:  ${totalTests}`);
console.log(`Passed tests: ${passedTests}`);
console.log(`Failed tests: ${failedTests}`);
if (findings.length > 0) {
  console.log(`Adversarial Security / Hardening Findings: ${findings.length}`);
  for (const f of findings) {
    console.log(`  - [${f.severity}] ${f.title}`);
  }
}
console.log('================================================================\n');

// findings 此前只被打印、从不参与退出码判定：一条真实的 zip-slip / 路径穿越
// 回归（SUITE 6 的 .. canary）会照常让本套件以 exit(0) 收场。
// 现在 SUITE 6 的 canary 命中会直接 assert.fail（计入 failedTests），同时被标为
// CRITICAL 记入 findings；末尾 blockingFindings 再兜一层，任何 CRITICAL/HIGH/SEVERE
// 发现都会 exit(1)。低危 findings 仍只报告，避免噪声门禁。
const blockingFindings = findings.filter(f => /critical|high|severe/i.test(String(f.severity || '')));

if (failedTests > 0 || blockingFindings.length > 0) {
  if (blockingFindings.length > 0) {
    console.error(`\n❌ ${blockingFindings.length} 条高危安全发现（此前不会让测试失败）：`);
    for (const f of blockingFindings) {
      console.error(`   - [${f.severity}] ${f.title}`);
      if (f.detail) console.error(`     ${f.detail}`);
    }
  }
  process.exit(1);
} else {
  process.exit(0);
}
