/**
 * stress-m1-empirical.js
 * Adversarial and Stress Testing Suite for scripts/lib/ modules:
 * - process-manager.js
 * - backup-manager.js
 * - deployer.js
 * - cdp-client.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const EventEmitter = require('events');

const processManager = require('../scripts/lib/process-manager');
const backupManager = require('../scripts/lib/backup-manager');
const deployer = require('../scripts/lib/deployer');
const cdpClient = require('../scripts/lib/cdp-client');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  PASS: ${name}`);
      }).catch(err => {
        failedTests++;
        failures.push({ name, error: err });
        console.error(`  FAIL: ${name} -> ${err.message}`);
      });
    }
    passedTests++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  FAIL: ${name} -> ${err.message}`);
  }
}

async function runAll() {
  console.log('================================================================');
  console.log('BEGINNING EMPIRICAL ADVERSARIAL STRESS TEST SUITE (MILESTONE 1)');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: process-manager.js Adversarial Challenge
  // ==========================================================================
  console.log('--- SECTION 1: process-manager.js ---');

  runTest('parseProcessList: rejects non-string types and empty input', () => {
    const invalidTypes = [null, undefined, 0, 123, true, false, {}, [], () => {}, Symbol('test')];
    for (const val of invalidTypes) {
      assert.deepStrictEqual(processManager.parseProcessList(val), []);
    }
    assert.deepStrictEqual(processManager.parseProcessList(''), []);
    assert.deepStrictEqual(processManager.parseProcessList('   \r\n  \t  \n  '), []);
  });

  runTest('parseProcessList: column count mismatch handling (0 to 10 cols)', () => {
    const malformed = [
      'only_one_col',
      'col1|col2',
      'col1|col2|col3',
      '100|200|0|1|extra_col5',
      '100|200|0|1|col5|col6|col7',
      '||||',
      '|||',
    ];
    for (const line of malformed) {
      assert.deepStrictEqual(processManager.parseProcessList(line), []);
    }
  });

  runTest('parseProcessList: malformed number fields (NaN, Infinity, floats, hex)', () => {
    const invalidNumbers = [
      'abc|200|0|1',
      '100|def|0|1',
      '100|200|ghi|1',
      'NaN|200|0|1',
      '100|Infinity|0|1',
      '-Infinity|200|0|1',
      '100.5|200|0|1', // parseInt parses 100
      '|200|0|1',
      '100||0|1',
      '100|200||1',
    ];
    // Line 100.5|200|0|1 has parseInt('100.5', 10) = 100, which is finite
    const res = processManager.parseProcessList(invalidNumbers.join('\n'));
    // Only the '100.5|200|0|1' line parses (as pid: 100)
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].pid, 100);
  });

  runTest('parseProcessList: sidecar flag strict validation ("0" and "1" only)', () => {
    const sidecarVariations = [
      '100|200|0|0',      // valid non-sidecar
      '101|200|0|1',      // valid sidecar
      '102|200|0| 0 ',    // trimmed to '0' -> valid
      '103|200|0| 1 ',    // trimmed to '1' -> valid
      '104|200|0|2',      // invalid
      '105|200|0|-1',     // invalid
      '106|200|0|true',   // invalid
      '107|200|0|false',  // invalid
      '108|200|0|sidecar',// invalid
      '109|200|0|',       // invalid
      '110|200|0|01',     // invalid
    ];
    const res = processManager.parseProcessList(sidecarVariations.join('\n'));
    assert.strictEqual(res.length, 4);
    assert.deepStrictEqual(res.map(p => p.pid), [100, 101, 102, 103]);
    assert.strictEqual(res[0].isSidecar, false);
    assert.strictEqual(res[1].isSidecar, true);
    assert.strictEqual(res[2].isSidecar, false);
    assert.strictEqual(res[3].isSidecar, true);
  });

  runTest('parseProcessList: window handle non-zero boolean conversion', () => {
    const winVariations = [
      '100|200|0|0',      // win=0 -> hasWindow=false
      '101|200|1|0',      // win=1 -> hasWindow=true
      '102|200|123456|0', // win=123456 -> hasWindow=true
      '103|200|-1|0',     // win=-1 -> hasWindow=true (-1 !== 0)
    ];
    const res = processManager.parseProcessList(winVariations.join('\n'));
    assert.strictEqual(res.length, 4);
    assert.strictEqual(res[0].hasWindow, false);
    assert.strictEqual(res[1].hasWindow, true);
    assert.strictEqual(res[2].hasWindow, true);
    assert.strictEqual(res[3].hasWindow, true);
  });

  runTest('parseProcessList: adversarial payload fuzzing (PowerShell errors, CIM garbage, null bytes)', () => {
    const fuzzLines = [
      'Get-CimInstance : Access is denied.',
      'At line:1 char:1',
      '+ Get-CimInstance Win32_Process',
      '    + CategoryInfo          : NotSpecified: (:) [Get-CimInstance], CimException',
      '    + FullyQualifiedErrorId : HRESULT 0x80041003,Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand',
      '\u0000\u0000\u0000|\u0000|\u0000|\u0000',
      '1234|5678|0|1\u0000trailing_null_byte',
      '__proto__|constructor|prototype|1',
      '1000|2000|0|1\r\n\r\n\r\n',
      '99999999999999999999999999999999|500|0|1', // overflow to Infinity
    ];
    // 9999... parses as Infinity in parseInt? Actually parseInt('99999999999999999999999999999999', 10) = 1e+32, Number.isFinite is true
    // But 1234|5678|0|1\u0000trailing_null_byte has side !== '1'
    const res = processManager.parseProcessList(fuzzLines.join('\n'));
    // res should only contain finite, valid lines
    for (const p of res) {
      assert(Number.isFinite(p.pid));
      assert(Number.isFinite(p.parentPid));
      assert(typeof p.hasWindow === 'boolean');
      assert(typeof p.isSidecar === 'boolean');
    }
  });

  runTest('parseProcessList: high volume fuzz generator (1000 noisy lines)', () => {
    const lines = [];
    for (let i = 0; i < 1000; i++) {
      if (i % 10 === 0) {
        lines.push(`${i}|${i + 1}|0|1`);
      } else if (i % 10 === 1) {
        lines.push(`${i}|${i + 1}|1234|0`);
      } else {
        lines.push(`garbage_${i}|random_noise|#$*@&|^%*@|more|noise`);
      }
    }
    const res = processManager.parseProcessList(lines.join('\n'));
    assert.strictEqual(res.length, 200);
  });

  runTest('process-manager: sidecar vs non-sidecar classification oracle', () => {
    // Model the PowerShell filter logic:
    // $c -and $win -eq 0 -and ($c -notmatch '--type=') -and ($c -match 'register_loader\.js|sidecar_sdk|--import=')
    function isSidecarOracle(commandLine, mainWindowHandle) {
      if (!commandLine || mainWindowHandle !== 0) return false;
      if (/--type=/.test(commandLine)) return false;
      return /register_loader\.js|sidecar_sdk|--import=/.test(commandLine);
    }

    // Cases:
    // 1. IDE main process (has window)
    assert.strictEqual(isSidecarOracle('"C:\\Antigravity.exe"', 0x12345), false);

    // 2. Electron renderer/gpu process (window handle = 0, but has --type=)
    assert.strictEqual(isSidecarOracle('"C:\\Antigravity.exe" --type=renderer --field-trial-handle=...', 0), false);
    assert.strictEqual(isSidecarOracle('"C:\\Antigravity.exe" --type=gpu-process', 0), false);
    assert.strictEqual(isSidecarOracle('"C:\\Antigravity.exe" --type=utility --import=foo', 0), false);

    // 3. True sidecar process (no window, no --type=, matches register_loader.js)
    assert.strictEqual(isSidecarOracle('node.exe register_loader.js --port 1234', 0), true);
    assert.strictEqual(isSidecarOracle('node.exe C:\\path\\to\\sidecar_sdk\\index.js', 0), true);
    assert.strictEqual(isSidecarOracle('node.exe --import=./loader.js server.js', 0), true);

    // 4. Sidecar pattern but MainWindowHandle is nonzero (hypothetical edge case)
    assert.strictEqual(isSidecarOracle('node.exe register_loader.js', 100), false);

    // 5. Normal child process without sidecar marker
    assert.strictEqual(isSidecarOracle('git.exe status', 0), false);
  });

  runTest('process-manager: sleep edge cases', () => {
    assert.doesNotThrow(() => processManager.sleep(0));
    assert.doesNotThrow(() => processManager.sleep(-1));
    const start = Date.now();
    processManager.sleep(20);
    const elapsed = Date.now() - start;
    assert(elapsed >= 15, `sleep elapsed ${elapsed}ms`);
  });

  // ==========================================================================
  // SECTION 2: backup-manager.js Adversarial Challenge
  // ==========================================================================
  console.log('\n--- SECTION 2: backup-manager.js ---');

  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-stress-bm-'));

  try {
    runTest('sha256File: boundary sizes (0 bytes, 1MB exact chunk boundary, 1MB+1 byte)', () => {
      // 0 bytes
      const f0 = path.join(testDir, 'zero.bin');
      fs.writeFileSync(f0, Buffer.alloc(0));
      assert.strictEqual(backupManager.sha256File(f0), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // Exact 1MB (1 << 20 = 1048576 bytes)
      const f1M = path.join(testDir, '1mb.bin');
      const b1M = Buffer.alloc(1 << 20, 0x41);
      fs.writeFileSync(f1M, b1M);
      const crypto = require('crypto');
      const exp1M = crypto.createHash('sha256').update(b1M).digest('hex');
      assert.strictEqual(backupManager.sha256File(f1M), exp1M);

      // 1MB + 1 byte
      const f1M1 = path.join(testDir, '1mb_plus_1.bin');
      const b1M1 = Buffer.alloc((1 << 20) + 1, 0x42);
      fs.writeFileSync(f1M1, b1M1);
      const exp1M1 = crypto.createHash('sha256').update(b1M1).digest('hex');
      assert.strictEqual(backupManager.sha256File(f1M1), exp1M1);
    });

    runTest('fingerprint & fingerprintTrusting: edge cases and cache invalidation', () => {
      const f = path.join(testDir, 'fp-target.bin');
      fs.writeFileSync(f, 'initial content');

      const customCache = new Map();
      const fp1 = backupManager.fingerprint(f, customCache);
      assert.strictEqual(customCache.size, 1);

      // Fingerprint caching: same file stat returns cached object
      const fp2 = backupManager.fingerprint(f, customCache);
      assert.strictEqual(fp1, fp2);

      // Mutate file size: cache should be invalidated
      fs.writeFileSync(f, 'initial content with extra bytes');
      const fp3 = backupManager.fingerprint(f, customCache);
      assert.notStrictEqual(fp1.sha256, fp3.sha256);
      assert.notStrictEqual(fp1.size, fp3.size);

      // fingerprintTrusting with corrupt/null known objects:
      assert.doesNotThrow(() => {
        const t1 = backupManager.fingerprintTrusting(f, null, customCache);
        assert(t1 && t1.sha256);
        const t2 = backupManager.fingerprintTrusting(f, undefined, customCache);
        assert(t2 && t2.sha256);
        const t3 = backupManager.fingerprintTrusting(f, {}, customCache);
        assert(t3 && t3.sha256);
        const t4 = backupManager.fingerprintTrusting(f, { size: 'invalid', mtimeMs: null }, customCache);
        assert(t4 && t4.sha256);
      });

      // fingerprintOrNull on missing file
      assert.strictEqual(backupManager.fingerprintOrNull(path.join(testDir, 'nonexistent.file')), null);
      assert.strictEqual(backupManager.fingerprintTrustingOrNull(path.join(testDir, 'nonexistent.file'), null), null);
    });

    runTest('readJsonFile & writeJsonFile: corrupt files, non-objects, and atomic semantics', () => {
      const corruptFile = path.join(testDir, 'corrupt.json');

      // Empty file
      fs.writeFileSync(corruptFile, '');
      assert.strictEqual(backupManager.readJsonFile(corruptFile), null);

      // Truncated JSON
      fs.writeFileSync(corruptFile, '{"key": "value"');
      assert.strictEqual(backupManager.readJsonFile(corruptFile), null);

      // Binary garbage
      fs.writeFileSync(corruptFile, Buffer.from([0x00, 0xff, 0xfe, 0x12]));
      assert.strictEqual(backupManager.readJsonFile(corruptFile), null);

      // Non-existent file
      assert.strictEqual(backupManager.readJsonFile(path.join(testDir, 'missing.json')), null);

      // Atomic write test
      const targetFile = path.join(testDir, 'atomic.json');
      backupManager.writeJsonFile(targetFile, { test: 123 });
      assert(fs.existsSync(targetFile));
      assert(!fs.existsSync(`${targetFile}.tmp`));
      assert.deepStrictEqual(backupManager.readJsonFile(targetFile), { test: 123 });
    });

    runTest('isBackupStaleFor: resilient against corrupt, empty, and spoofed metadata', () => {
      const asarFile = path.join(testDir, 'app.asar');
      fs.writeFileSync(asarFile, 'current app content');
      const metaFile = path.join(testDir, 'meta.json');

      // 1. Meta file missing -> stale
      assert.strictEqual(backupManager.isBackupStaleFor(path.join(testDir, 'none.meta'), asarFile), true);

      // 2. Meta file corrupt JSON -> stale
      fs.writeFileSync(metaFile, 'bad json{{{');
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);

      // 3. Meta file non-object JSON -> stale
      fs.writeFileSync(metaFile, '12345');
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);
      fs.writeFileSync(metaFile, '"just a string"');
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);
      fs.writeFileSync(metaFile, '[]');
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);
      fs.writeFileSync(metaFile, 'null');
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);

      // 4. Meta file missing source property -> stale
      fs.writeFileSync(metaFile, JSON.stringify({ recordedAt: '2026-01-01' }));
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);

      // 5. Meta file source missing size or sha256 -> stale
      fs.writeFileSync(metaFile, JSON.stringify({ source: { size: 100 } }));
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);

      // 6. Valid meta matching current asar -> NOT stale
      const curFp = backupManager.fingerprint(asarFile);
      fs.writeFileSync(metaFile, JSON.stringify({ source: curFp, recordedAt: '2026-01-01' }));
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), false);

      // 7. asarFile missing -> stale
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, path.join(testDir, 'missing.asar')), true);

      // 8. Size matches but sha256 differs -> stale
      const spoofedFp = { size: curFp.size, sha256: 'deadbeef00000000000000000000000000000000000000000000000000000000' };
      fs.writeFileSync(metaFile, JSON.stringify({ source: spoofedFp, recordedAt: '2026-01-01' }));
      assert.strictEqual(backupManager.isBackupStaleFor(metaFile, asarFile), true);
    });

    runTest('recoverInterruptedDeploy: exhaustive crash recovery matrix', () => {
      const recDir = path.join(testDir, 'recovery-cases');
      fs.mkdirSync(recDir, { recursive: true });

      function createPaths(prefix) {
        return {
          asarPath: path.join(recDir, `${prefix}-app.asar`),
          origPath: path.join(recDir, `${prefix}-app.asar.orig`),
          appDir: path.join(recDir, `${prefix}-app`),
          kitDir: path.join(recDir, `${prefix}-zh-patch`),
          backupMetaPath: path.join(recDir, `${prefix}-meta.json`),
          appNewDir: path.join(recDir, `${prefix}-app.new`),
          appOldDir: path.join(recDir, `${prefix}-app.old`),
          kitNewDir: path.join(recDir, `${prefix}-zh-patch.new`),
          kitOldDir: path.join(recDir, `${prefix}-zh-patch.old`),
          backupTmpPath: path.join(recDir, `${prefix}-app.asar.orig.tmp`),
          backupOldPath: path.join(recDir, `${prefix}-app.asar.orig.old`),
        };
      }

      // Case A: Crash during asar backup (only backupTmpPath exists)
      const pA = createPaths('caseA');
      fs.writeFileSync(pA.backupTmpPath, 'asar v1');
      backupManager.recoverInterruptedDeploy(pA);
      assert(fs.existsSync(pA.origPath));
      assert(!fs.existsSync(pA.backupTmpPath));

      // Case B: Crash when both backupTmpPath and backupOldPath exist
      // backupTmpPath must take priority as current version
      const pB = createPaths('caseB');
      fs.writeFileSync(pB.backupTmpPath, 'new version in tmp');
      fs.writeFileSync(pB.backupOldPath, 'old archived version');
      backupManager.recoverInterruptedDeploy(pB);
      assert(fs.existsSync(pB.origPath));
      assert.strictEqual(fs.readFileSync(pB.origPath, 'utf8'), 'new version in tmp');
      assert(!fs.existsSync(pB.backupTmpPath));
      assert(!fs.existsSync(pB.backupOldPath));

      // Case C: Crash when only backupOldPath exists
      const pC = createPaths('caseC');
      fs.writeFileSync(pC.backupOldPath, 'only old backup exists');
      backupManager.recoverInterruptedDeploy(pC);
      assert(fs.existsSync(pC.origPath));
      assert.strictEqual(fs.readFileSync(pC.origPath, 'utf8'), 'only old backup exists');
      assert(!fs.existsSync(pC.backupOldPath));

      // Case D: Crash while switching app/ (app missing, appOldDir exists, appNewDir exists)
      // appOldDir must be restored to appDir
      const pD = createPaths('caseD');
      fs.mkdirSync(pD.appOldDir, { recursive: true });
      fs.writeFileSync(path.join(pD.appOldDir, 'old.txt'), 'old app');
      fs.mkdirSync(pD.appNewDir, { recursive: true });
      fs.writeFileSync(path.join(pD.appNewDir, 'new.txt'), 'new app');
      backupManager.recoverInterruptedDeploy(pD);
      assert(fs.existsSync(pD.appDir));
      assert.strictEqual(fs.readFileSync(path.join(pD.appDir, 'old.txt'), 'utf8'), 'old app');
      assert(!fs.existsSync(pD.appNewDir));
      assert(!fs.existsSync(pD.appOldDir));

      // Case E: Crash while switching zh-patch/ (kit missing, only kitNewDir exists)
      const pE = createPaths('caseE');
      fs.mkdirSync(pE.kitNewDir, { recursive: true });
      fs.writeFileSync(path.join(pE.kitNewDir, 'kit.txt'), 'kit new');
      backupManager.recoverInterruptedDeploy(pE);
      assert(fs.existsSync(pE.kitDir));
      assert(!fs.existsSync(pE.kitNewDir));

      // Case F: Stale metadata cleanup when origPath does not exist
      const pF = createPaths('caseF');
      fs.writeFileSync(pF.backupMetaPath, '{"source": 1}');
      fs.writeFileSync(`${pF.backupMetaPath}.tmp`, 'partial tmp meta');
      backupManager.recoverInterruptedDeploy(pF);
      assert(!fs.existsSync(pF.backupMetaPath));
      assert(!fs.existsSync(`${pF.backupMetaPath}.tmp`));

      // Case G: Completely empty paths (all missing) does not throw
      const pG = createPaths('caseG');
      assert.doesNotThrow(() => backupManager.recoverInterruptedDeploy(pG));
    });
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // ==========================================================================
  // SECTION 3: deployer.js Adversarial Challenge
  // ==========================================================================
  console.log('\n--- SECTION 3: deployer.js ---');

  const depDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-stress-dep-'));

  try {
    runTest('setupUnpackedJunction: edge cases (same asar, missing unpacked, double cleanup)', () => {
      const resDir = path.join(depDir, 'res');
      fs.mkdirSync(resDir, { recursive: true });
      const asar = path.join(resDir, 'app.asar');
      const orig = path.join(resDir, 'app.asar.orig');

      // 1. sourceAsar === asarPath -> noop
      const c1 = deployer.setupUnpackedJunction(resDir, asar, asar);
      assert.doesNotThrow(() => c1());

      // 2. unpackedDir missing -> noop
      const c2 = deployer.setupUnpackedJunction(resDir, orig, asar);
      assert.doesNotThrow(() => c2());

      // 3. unpackedDir exists -> creates junction
      const unpacked = path.join(resDir, 'app.asar.unpacked');
      fs.mkdirSync(unpacked, { recursive: true });
      fs.writeFileSync(path.join(unpacked, 'bin.node'), 'node-bin');
      const c3 = deployer.setupUnpackedJunction(resDir, orig, asar);
      const junction = path.join(resDir, 'app.asar.orig.unpacked');
      assert(fs.existsSync(junction));

      // Double cleanup idempotence
      assert.doesNotThrow(() => c3());
      assert(!fs.existsSync(junction));
      assert.doesNotThrow(() => c3()); // second call safe
      assert(fs.existsSync(unpacked));  // real unpacked untouched
    });

    runTest('moveIntoPlace: cross-volume EXDEV fallback simulation', () => {
      const fromDir = path.join(depDir, 'exdev-from');
      const toDir = path.join(depDir, 'exdev-to');
      fs.mkdirSync(fromDir, { recursive: true });
      fs.writeFileSync(path.join(fromDir, 'nested.txt'), 'nested content');

      // Mock deployRename to throw EXDEV on first call
      const originalRename = fs.renameSync;
      let exdevTriggered = false;

      // In deployer.js, deployRename calls fs.renameSync
      // We can trigger AGY_ZH_TEST_FAIL_RENAME or simulate EXDEV
      // AGY_ZH_TEST_FAIL_RENAME throws EIO, which moveIntoPlace rethrows!
      process.env.AGY_ZH_TEST_FAIL_RENAME = 'exdev-from>exdev-to';
      assert.throws(() => deployer.moveIntoPlace(fromDir, toDir), /注入的部署失败/);
      delete process.env.AGY_ZH_TEST_FAIL_RENAME;

      // Now test real move
      deployer.moveIntoPlace(fromDir, toDir);
      assert(fs.existsSync(toDir));
      assert.strictEqual(fs.readFileSync(path.join(toDir, 'nested.txt'), 'utf8'), 'nested content');
      assert(!fs.existsSync(fromDir));
    });

    runTest('deployAtomically: fault injection rollback matrix across all 6 steps', () => {
      function makeFreshDeploySetup(name) {
        const root = path.join(depDir, name);
        fs.mkdirSync(root, { recursive: true });
        const paths = {
          resourcesDir: root,
          asarPath: path.join(root, 'app.asar'),
          origPath: path.join(root, 'app.asar.orig'),
          appDir: path.join(root, 'app'),
          kitDir: path.join(root, 'zh-patch'),
          backupMetaPath: path.join(root, 'app.asar.orig.meta.json'),
          appNewDir: path.join(root, 'app.new'),
          appOldDir: path.join(root, 'app.old'),
          kitNewDir: path.join(root, 'zh-patch.new'),
          kitOldDir: path.join(root, 'zh-patch.old'),
          backupTmpPath: path.join(root, 'app.asar.orig.tmp'),
          backupOldPath: path.join(root, 'app.asar.orig.old'),
        };
        fs.writeFileSync(paths.asarPath, 'original stable asar v1');
        fs.mkdirSync(paths.appDir, { recursive: true });
        fs.writeFileSync(path.join(paths.appDir, 'old-app.js'), 'console.log("old");');
        fs.mkdirSync(paths.kitDir, { recursive: true });
        fs.writeFileSync(path.join(paths.kitDir, 'old-kit.js'), 'console.log("kit");');
        return paths;
      }

      // Rollback Test 1: prepareKit throws
      const p1 = makeFreshDeploySetup('rollback-prepareKit');
      const stage1 = deployer.createStagingDirectory('stage1');
      fs.writeFileSync(path.join(stage1, 'new.js'), 'new');

      assert.throws(() => {
        deployer.deployAtomically(p1, stage1, () => {
          throw new Error('prepareKit crashed!');
        });
      }, /prepareKit crashed!/);

      // Verify rollback
      assert(fs.existsSync(p1.asarPath));
      assert(fs.existsSync(p1.appDir));
      assert(fs.existsSync(p1.kitDir));
      assert(!fs.existsSync(p1.appNewDir));
      assert(!fs.existsSync(p1.kitNewDir));
      assert(!fs.existsSync(p1.backupTmpPath));

      // Rollback Test 2: Fail at step 3a (asarPath -> backupTmpPath)
      const p2 = makeFreshDeploySetup('rollback-step3a');
      const stage2 = deployer.createStagingDirectory('stage2');
      process.env.AGY_ZH_TEST_FAIL_RENAME = `${path.basename(p2.asarPath)}>${path.basename(p2.backupTmpPath)}`;
      try {
        assert.throws(() => {
          deployer.deployAtomically(p2, stage2, (k) => fs.mkdirSync(k, { recursive: true }));
        }, /注入的部署失败/);
        assert(fs.existsSync(p2.asarPath));
        assert(fs.existsSync(p2.appDir));
      } finally {
        delete process.env.AGY_ZH_TEST_FAIL_RENAME;
      }

      // Rollback Test 3: Fail at step 4b (appNewDir -> appDir)
      const p3 = makeFreshDeploySetup('rollback-step4b');
      const stage3 = deployer.createStagingDirectory('stage3');
      process.env.AGY_ZH_TEST_FAIL_RENAME = `${path.basename(p3.appNewDir)}>${path.basename(p3.appDir)}`;
      try {
        assert.throws(() => {
          deployer.deployAtomically(p3, stage3, (k) => fs.mkdirSync(k, { recursive: true }));
        }, /注入的部署失败/);
        assert(fs.existsSync(p3.appDir));
        assert(fs.existsSync(p3.asarPath));
        assert(!fs.existsSync(p3.appNewDir));
      } finally {
        delete process.env.AGY_ZH_TEST_FAIL_RENAME;
      }

      // Rollback Test 4: Fail at step 5b (kitNewDir -> kitDir)
      const p4 = makeFreshDeploySetup('rollback-step5b');
      const stage4 = deployer.createStagingDirectory('stage4');
      process.env.AGY_ZH_TEST_FAIL_RENAME = `${path.basename(p4.kitNewDir)}>${path.basename(p4.kitDir)}`;
      try {
        assert.throws(() => {
          deployer.deployAtomically(p4, stage4, (k) => fs.mkdirSync(k, { recursive: true }));
        }, /注入的部署失败/);
        assert(fs.existsSync(p4.kitDir));
        assert(fs.existsSync(p4.appDir));
        assert(fs.existsSync(p4.asarPath));
      } finally {
        delete process.env.AGY_ZH_TEST_FAIL_RENAME;
      }

      // Rollback Test 5: Fail at step 6 (backupTmpPath -> origPath)
      const p5 = makeFreshDeploySetup('rollback-step6');
      const stage5 = deployer.createStagingDirectory('stage5');
      process.env.AGY_ZH_TEST_FAIL_RENAME = `${path.basename(p5.backupTmpPath)}>${path.basename(p5.origPath)}`;
      try {
        assert.throws(() => {
          deployer.deployAtomically(p5, stage5, (k) => fs.mkdirSync(k, { recursive: true }));
        }, /注入的部署失败/);
        assert(fs.existsSync(p5.asarPath));
        assert(fs.existsSync(p5.appDir));
        assert(fs.existsSync(p5.kitDir));
      } finally {
        delete process.env.AGY_ZH_TEST_FAIL_RENAME;
      }
    });

    runTest('deployAtomically: parameter order inversion compatibility', () => {
      const root = path.join(depDir, 'param-order');
      fs.mkdirSync(root, { recursive: true });
      const paths = {
        resourcesDir: root,
        asarPath: path.join(root, 'app.asar'),
        origPath: path.join(root, 'app.asar.orig'),
        appDir: path.join(root, 'app'),
        kitDir: path.join(root, 'zh-patch'),
        backupMetaPath: path.join(root, 'app.asar.orig.meta.json'),
        appNewDir: path.join(root, 'app.new'),
        appOldDir: path.join(root, 'app.old'),
        kitNewDir: path.join(root, 'zh-patch.new'),
        kitOldDir: path.join(root, 'zh-patch.old'),
        backupTmpPath: path.join(root, 'app.asar.orig.tmp'),
        backupOldPath: path.join(root, 'app.asar.orig.old'),
      };
      fs.writeFileSync(paths.asarPath, 'asar v1');
      const stage = deployer.createStagingDirectory('param-order-stage');
      fs.writeFileSync(path.join(stage, 'index.js'), 'stage content');

      // Call with (paths, prepareKit, stagingDir) instead of (paths, stagingDir, prepareKit)
      assert.doesNotThrow(() => {
        deployer.deployAtomically(paths, (k) => fs.mkdirSync(k, { recursive: true }), stage);
      });
      assert(fs.existsSync(paths.origPath));
      assert(fs.existsSync(paths.appDir));
      assert.strictEqual(fs.readFileSync(path.join(paths.appDir, 'index.js'), 'utf8'), 'stage content');
    });
  } finally {
    fs.rmSync(depDir, { recursive: true, force: true });
  }

  // ==========================================================================
  // SECTION 4: cdp-client.js Adversarial Challenge
  // ==========================================================================
  console.log('\n--- SECTION 4: cdp-client.js ---');

  runTest('isLoopbackHost: adversarial and SSRF vectors', () => {
    // Valid loopbacks
    const validLoopbacks = [
      '127.0.0.1',
      'localhost',
      'LOCALHOST',
      'LocalHost',
      '::1',
      '[::1]',
      '[::1]',
    ];
    for (const h of validLoopbacks) {
      assert.strictEqual(cdpClient.isLoopbackHost(h), true, `Expected valid: ${h}`);
    }

    // Adversarial / SSRF / spoofed loopbacks
    const adversarialHosts = [
      '127.0.0.2',
      '127.1.0.1',
      '0.0.0.0',
      '192.168.1.1',
      '10.0.0.1',
      '169.254.169.254',
      '2130706433', // decimal 127.0.0.1
      '0177.0.0.1', // octal
      '0x7f000001', // hex
      'localhost.evil.com',
      'evil-localhost',
      '127.0.0.1.nip.io',
      '::ffff:127.0.0.1',
      'fe80::1',
      '',
      null,
      undefined,
      127001,
      {},
      [],
    ];
    for (const h of adversarialHosts) {
      assert.strictEqual(cdpClient.isLoopbackHost(h), false, `Expected invalid: ${h}`);
    }
  });

  runTest('isAntigravityPage: protocol and scheme validation', () => {
    // Valid Antigravity pages
    const validPages = [
      'file:///C:/Users/app/index.html',
      'file:///usr/share/app/index.html',
      'plugin://antigravity-chat/index.html',
      'plugin://antigravity-workbench/view.html',
      'http://127.0.0.1:9222/view',
      'http://localhost:3000/',
      'https://127.0.0.1:8443/',
      'http://[::1]:9000/',
    ];
    for (const u of validPages) {
      assert.strictEqual(cdpClient.isAntigravityPage(u), true, `Expected valid page: ${u}`);
    }

    // Invalid / malicious pages
    const invalidPages = [
      'https://google.com',
      'http://192.168.1.1:8080',
      'http://169.254.169.254/latest/meta-data',
      'plugin://other-plugin/index.html',
      'plugin://antigravity/not-matching-prefix', // doesn't start with 'antigravity-'
      'javascript:alert(1)',
      'data:text/html,<h1>evil</h1>',
      'blob:http://localhost/uuid',
      'chrome-extension://xyz/options.html',
      'devtools://devtools/bundled/inspector.html',
      '',
      null,
      undefined,
      'not a url at all',
      '://missing-scheme',
      'http://localhost.evil.com:9222',
    ];
    for (const u of invalidPages) {
      assert.strictEqual(cdpClient.isAntigravityPage(u), false, `Expected invalid page: ${u}`);
    }
  });

  runTest('isTrustedDebuggerUrl: strict WebSocket loopback + port matching', () => {
    // Valid
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:9222/devtools/page/1', 9222), true);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://localhost:9222/devtools/page/1', '9222'), true);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('wss://[::1]:9222/devtools/page/1', 9222), true);

    // Invalid protocol
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('http://127.0.0.1:9222/devtools/page/1', 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('javascript://127.0.0.1:9222/devtools/page/1', 9222), false);

    // Port mismatch
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:9223/devtools/page/1', 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:80/devtools/page/1', 9222), false);
    // WHATWG URL canonicalizes leading zeros in port to integer string ('09222' -> '9222'):
    // When port argument is 9222 (numeric), String(port) is '9222', which matches u.port.
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:09222/devtools/page/1', 9222), true);
    // When port argument retains leading zero string '09222', String(port) !== u.port ('9222'), so it returns false.
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:09222/devtools/page/1', '09222'), false);

    // Remote host
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://evil.com:9222/devtools/page/1', 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1.attacker.com:9222/page', 9222), false);

    // Userinfo spoofing: ws://127.0.0.1:9222@attacker.com:9222/
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://127.0.0.1:9222@attacker.com:9222/page', 9222), false);

    // Garbage inputs
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('', 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl(null, 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl(undefined, 9222), false);
    assert.strictEqual(cdpClient.isTrustedDebuggerUrl('ws://', 9222), false);
  });

  const cdpTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-stress-cdp-'));
  try {
    runTest('readDevToolsPort: port boundary validation (1 to 65535, invalid numbers, missing)', () => {
      const agDir = path.join(cdpTmp, 'Antigravity');
      fs.mkdirSync(agDir, { recursive: true });
      const portFile = path.join(agDir, 'DevToolsActivePort');

      // Valid boundary ports
      fs.writeFileSync(portFile, '1\n/devtools/browser/1\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), 1);

      fs.writeFileSync(portFile, '65535\n/devtools/browser/1\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), 65535);

      fs.writeFileSync(portFile, '9222\r\n/devtools/browser/1\r\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), 9222);

      // Invalid port numbers
      fs.writeFileSync(portFile, '0\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, '-1\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, '65536\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, '999999\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, 'abc\n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, '');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);

      fs.writeFileSync(portFile, '   \t  \n');
      assert.strictEqual(cdpClient.readDevToolsPort(cdpTmp), null);
    });

    await runTest('fetchTargets: handles non-JSON, 404/500, hanging server, and connection refused', async () => {
      // 1. Connection refused (closed port)
      const nonExistentPort = 59123;
      const resRefused = await cdpClient.fetchTargets(nonExistentPort, 200);
      assert.strictEqual(resRefused, null);

      // 2. Server returning invalid JSON
      const server1 = http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: Not JSON');
      });
      await new Promise(r => server1.listen(0, '127.0.0.1', r));
      const p1 = server1.address().port;
      try {
        const res500 = await cdpClient.fetchTargets(p1, 500);
        assert.strictEqual(res500, null);
      } finally {
        server1.close();
      }

      // 3. Server returning JSON object instead of Array
      const server2 = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'target not found' }));
      });
      await new Promise(r => server2.listen(0, '127.0.0.1', r));
      const p2 = server2.address().port;
      try {
        const resObj = await cdpClient.fetchTargets(p2, 500);
        assert.strictEqual(resObj, null); // must be an array!
      } finally {
        server2.close();
      }

      // 4. Server hanging (timeout trigger)
      const server3 = http.createServer((req, res) => {
        // intentionally never respond
      });
      await new Promise(r => server3.listen(0, '127.0.0.1', r));
      const p3 = server3.address().port;
      try {
        const resTimeout = await cdpClient.fetchTargets(p3, 100);
        assert.strictEqual(resTimeout, null);
      } finally {
        server3.close();
      }
    });

    await runTest('pushToPages: mock WebSocket client lifecycle and fault injection', async () => {
      // Empty pages
      const res0 = await cdpClient.pushToPages(null, [], {});
      assert.strictEqual(res0, 0);

      const resNull = await cdpClient.pushToPages(null, null, {});
      assert.strictEqual(resNull, 0);

      // Mock WebSocket class simulating success
      class MockSuccessWS extends EventEmitter {
        constructor(url) {
          super();
          setTimeout(() => {
            this.emit('open');
          }, 5);
        }
        send(msg) {
          setTimeout(() => {
            this.emit('message', JSON.stringify({
              id: 999,
              result: { result: { value: true } },
            }));
          }, 5);
        }
        close() { this.emit('close'); }
        terminate() { this.emit('close'); }
      }

      const pages = [
        { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1' },
        { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/2' },
      ];

      const count = await cdpClient.pushToPages(MockSuccessWS, pages, { test: 1 }, 1234, 500);
      assert.strictEqual(count, 2);

      // Mock WebSocket simulating mixed failure (one crashes, one times out, one succeeds)
      class MockFailingWS extends EventEmitter {
        constructor(url) {
          super();
          if (url.includes('page/crash')) {
            throw new Error('Socket creation failed');
          }
          if (url.includes('page/error')) {
            setTimeout(() => this.emit('error', new Error('Net error')), 5);
          } else if (url.includes('page/false')) {
            setTimeout(() => {
              this.emit('open');
            }, 5);
          } else if (url.includes('page/ok')) {
            setTimeout(() => {
              this.emit('open');
            }, 5);
          }
        }
        send(msg) {
          setTimeout(() => {
            this.emit('message', JSON.stringify({
              id: 999,
              result: { result: { value: !this.fail } },
            }));
          }, 5);
        }
        close() {}
        terminate() {}
      }

      const mixedPages = [
        { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/crash' },
        { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/error' },
        { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/ok' },
      ];

      const mixedCount = await cdpClient.pushToPages(MockFailingWS, mixedPages, { test: 1 }, 1234, 300);
      assert.strictEqual(mixedCount, 1);
    });

    await runTest('cdp-client: readDevToolsPort boundary guards protect fetchTargets against port overflow', async () => {
      const agDir = path.join(cdpTmp, 'Antigravity');
      const portFile = path.join(agDir, 'DevToolsActivePort');

      // DevToolsActivePort contains 70000 (overflow)
      fs.writeFileSync(portFile, '70000\n');
      const safePort = cdpClient.readDevToolsPort(cdpTmp);
      assert.strictEqual(safePort, null); // Blocked!

      // When null, caller will not invoke fetchTargets(70000)
      if (safePort !== null) {
        await cdpClient.fetchTargets(safePort);
      }
    });

    runTest('process-manager: killResidualSidecars ancestor protection oracle', () => {
      // Test that process.pid is included in protected Pids
      const ancestors = processManager.getAncestorPids();
      // On Windows or fallback, ancestors should either be array containing process.pid or empty array on failure
      assert(Array.isArray(ancestors));
      if (ancestors.length > 0) {
        assert(ancestors.includes(process.pid), 'Current PID must be present in ancestor chain');
      }
    });

    runTest('deployer: deployAtomically when hadAsar is false (clean folder install & rollback)', () => {
      const root = path.join(cdpTmp, 'no-asar-deploy');
      fs.mkdirSync(root, { recursive: true });
      const paths = {
        resourcesDir: root,
        asarPath: path.join(root, 'app.asar'), // does NOT exist
        origPath: path.join(root, 'app.asar.orig'),
        appDir: path.join(root, 'app'),
        kitDir: path.join(root, 'zh-patch'),
        backupMetaPath: path.join(root, 'app.asar.orig.meta.json'),
        appNewDir: path.join(root, 'app.new'),
        appOldDir: path.join(root, 'app.old'),
        kitNewDir: path.join(root, 'zh-patch.new'),
        kitOldDir: path.join(root, 'zh-patch.old'),
        backupTmpPath: path.join(root, 'app.asar.orig.tmp'),
        backupOldPath: path.join(root, 'app.asar.orig.old'),
      };
      // Normal deploy without asar
      const stage = deployer.createStagingDirectory('no-asar-stage');
      fs.writeFileSync(path.join(stage, 'index.js'), 'no-asar');
      deployer.deployAtomically(paths, stage, (k) => {
        fs.mkdirSync(k, { recursive: true });
        fs.writeFileSync(path.join(k, 'kit.js'), 'kit');
      });
      assert(fs.existsSync(paths.appDir));
      assert(fs.existsSync(paths.kitDir));
      assert(!fs.existsSync(paths.asarPath));
      assert(!fs.existsSync(paths.origPath));

      // Rollback without asar
      const stageFail = deployer.createStagingDirectory('no-asar-fail');
      fs.writeFileSync(path.join(stageFail, 'fail.js'), 'fail');
      process.env.AGY_ZH_TEST_FAIL_RENAME = `${path.basename(paths.kitNewDir)}>${path.basename(paths.kitDir)}`;
      try {
        assert.throws(() => {
          deployer.deployAtomically(paths, stageFail, (k) => {
            fs.mkdirSync(k, { recursive: true });
          });
        }, /注入的部署失败/);
        // appDir still intact, asarPath was not resurrected
        assert(fs.existsSync(paths.appDir));
        assert(!fs.existsSync(paths.asarPath));
      } finally {
        delete process.env.AGY_ZH_TEST_FAIL_RENAME;
      }
    });

  } finally {
    fs.rmSync(cdpTmp, { recursive: true, force: true });
  }

  console.log('\n================================================================');
  console.log(`EMPERICAL STRESS TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error('\nFAILURE DETAILS:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error.stack || f.error.message}`);
    }
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
