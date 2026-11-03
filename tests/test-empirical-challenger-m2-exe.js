/**
 * tests/test-empirical-challenger-m2-exe.js
 * 
 * Empirical Adversarial Challenger Test Suite for packaged binary `dist/Antigravity-zh-patch.exe`.
 * 
 * Verifies:
 * 1. Target binary integrity (PE header, bundle size, existence).
 * 2. Missing LOCALAPPDATA environment resolution (clean exit 1).
 * 3. Nonexistent Programs/antigravity/resources directory (clean exit 1).
 * 4. Missing app.asar archive in resources directory (clean exit 1).
 * 5. Corrupted app.asar handling:
 *    - 0-byte empty file
 *    - Truncated header (invalid magic/length)
 *    - Random binary garbage payload
 *    - Malformed JSON header
 *    - Assert clean exit 1, graceful error message, no V8 snapshot crash or uncaught rejections.
 * 6. Fail-safe process detection in normal install mode:
 *    - Detects running Antigravity IDE and refuses execution (clean exit 1).
 *    - Does NOT terminate running host IDE processes.
 *    - Zero file mutation in sandbox.
 * 7. Fail-safe process detection in revert mode:
 *    - Detects running Antigravity IDE and refuses revert (clean exit 1).
 *    - Does NOT terminate running host IDE processes.
 * 8. Dry-run preview execution:
 *    - Bypasses running IDE block and succeeds (exit 0).
 *    - Matches all 7 native replacement rules.
 *    - Leaves sandbox files 100% byte-for-byte unchanged.
 * 9. Temp staging directory leak detection:
 *    - Verifies staging directories are cleaned up after failure cases.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const exePath = path.join(__dirname, '..', 'dist', 'Antigravity-zh-patch.exe');
const rootDir = path.join(__dirname, '..');

if (!fs.existsSync(exePath)) {
  console.log('⚠️ [SKIP] Target binary not found (dist/Antigravity-zh-patch.exe).');
  console.log('   Run `npm run build:exe` before executing M2 EXE empirical stress test suite.');
  process.exit(0);
}

let pass = 0;
let fail = 0;
const results = [];

function check(name, condition, details = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${name}`);
    results.push({ name, status: 'PASS', details });
  } else {
    fail++;
    console.error(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
    results.push({ name, status: 'FAIL', details });
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function createSandbox() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-challenger-m2-'));
  const localAppData = path.join(tempDir, 'LocalAppData');
  const appRoot = path.join(localAppData, 'Programs', 'antigravity');
  const resourcesDir = path.join(appRoot, 'resources');
  return { tempDir, localAppData, appRoot, resourcesDir };
}

const targets = {
  utils: 'dist/utils.js',
  menu: 'dist/menu.js',
  main: 'dist/main.js',
  tray: 'dist/tray.js',
  updater: 'dist/updater.js',
  ipchandlers: 'dist/ipcHandlers.js',
  wizard: 'dist/ideInstall/wizardHtml.js',
};

function buildValidAsar(tempDir) {
  const src = path.join(tempDir, 'src-asar-test');
  fs.rmSync(src, { recursive: true, force: true });
  for (const [scope, rel] of Object.entries(targets)) {
    const rulesFile = path.join(rootDir, 'src', 'native', `${scope}.replacements.json`);
    const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    const file = path.join(src, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `// ADVERSARIAL_MOCK:${scope}\n` + rules[0][0], 'utf8');
  }
  const out = path.join(tempDir, 'valid.asar');
  fs.rmSync(out, { force: true });
  execFileSync(process.execPath, [
    '-e',
    `require('asar').createPackage(${JSON.stringify(src)}, ${JSON.stringify(out)})` +
    `.catch(e => { console.error(e); process.exit(1); })`,
  ], { stdio: 'pipe', cwd: rootDir });
  return out;
}

function runExe(args = [], customEnv = {}) {
  const mergedEnv = Object.assign({}, process.env, customEnv);
  const res = spawnSync(exePath, args, {
    env: mergedEnv,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error,
  };
}

console.log('=== Challenger M2: Empirical Adversarial Stress Test ===\n');

// -----------------------------------------------------------------------------
// Test Group 1: Binary Existence and Header Sanity
// -----------------------------------------------------------------------------
console.log('Group 1: Target Binary Sanity');
check('1.1 Binary exists on disk', fs.existsSync(exePath), `Path: ${exePath}`);
if (fs.existsSync(exePath)) {
  const stat = fs.statSync(exePath);
  check('1.2 Binary file size is valid pkg executable (> 30MB)', stat.size > 30 * 1024 * 1024, `Size: ${stat.size} bytes`);
  const buf = Buffer.alloc(2);
  const fd = fs.openSync(exePath, 'r');
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  check('1.3 Binary has valid Windows PE MZ header', buf.toString('ascii') === 'MZ', `Header: ${buf.toString('hex')}`);
}

// -----------------------------------------------------------------------------
// Test Group 2: Nonexistent Environment & Paths
// -----------------------------------------------------------------------------
console.log('\nGroup 2: Environment Fault Injection');

// 2.1 Missing LOCALAPPDATA
{
  const minimalEnv = {
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    PATH: process.env.PATH || '',
    LOCALAPPDATA: '',
  };
  const r = runExe([], minimalEnv);
  check('2.1 Empty LOCALAPPDATA exits with code 1', r.status === 1, `Status: ${r.status}`);
  check('2.2 Empty LOCALAPPDATA outputs clear error message',
    (r.stderr + r.stdout).includes('找不到 LOCALAPPDATA 环境变量'),
    `Output: ${r.stderr || r.stdout}`);
  check('2.3 No uncaught V8 exception trace dumped',
    !(r.stderr + r.stdout).includes('UnhandledPromiseRejection') &&
    !(r.stderr + r.stdout).includes('TypeError [ERR_'),
    `Stderr: ${r.stderr}`);
}

// 2.2 Nonexistent resources directory
{
  const { tempDir, localAppData } = createSandbox();
  try {
    const r = runExe([], { LOCALAPPDATA: localAppData });
    check('2.4 Nonexistent resources dir exits with code 1', r.status === 1, `Status: ${r.status}`);
    check('2.5 Nonexistent resources dir reports missing directory path',
      (r.stderr + r.stdout).includes('未找到 Antigravity 资源目录'),
      `Output: ${r.stderr || r.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 2.3 Resources directory exists, but app.asar is missing
{
  const { tempDir, localAppData, resourcesDir } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    const r = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('2.6 Missing app.asar exits with code 1 in dry-run', r.status === 1, `Status: ${r.status}`);
    check('2.7 Missing app.asar outputs clear missing file message',
      (r.stderr + r.stdout).includes('找不到 app.asar'),
      `Output: ${r.stderr || r.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------------
// Test Group 3: Corrupted app.asar Fault Injection
// -----------------------------------------------------------------------------
console.log('\nGroup 3: Corrupted app.asar Stress Tests');

// 3.1 0-byte app.asar
{
  const { tempDir, localAppData, resourcesDir } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    const asarFile = path.join(resourcesDir, 'app.asar');
    fs.writeFileSync(asarFile, Buffer.alloc(0));
    const r = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('3.1 0-byte app.asar exits with code 1', r.status === 1, `Status: ${r.status}`);
    check('3.2 0-byte app.asar reports installation/extraction failure gracefully',
      (r.stderr + r.stdout).includes('安装失败'),
      `Output: ${r.stderr || r.stdout}`);
    check('3.3 0-byte app.asar does not crash Node V8 runtime',
      r.status !== null && r.status !== 3221225477, // STATUS_ACCESS_VIOLATION
      `Status: ${r.status}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 3.2 Truncated header (e.g. 12 random bytes)
{
  const { tempDir, localAppData, resourcesDir } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    const asarFile = path.join(resourcesDir, 'app.asar');
    fs.writeFileSync(asarFile, crypto.randomBytes(12));
    const r = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('3.4 Truncated 12-byte header exits with code 1', r.status === 1, `Status: ${r.status}`);
    check('3.5 Truncated header caught gracefully without unhandled abort',
      (r.stderr + r.stdout).includes('安装失败'),
      `Output: ${r.stderr || r.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 3.3 Garbage binary payload (4KB pseudo-random bytes)
{
  const { tempDir, localAppData, resourcesDir } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    const asarFile = path.join(resourcesDir, 'app.asar');
    fs.writeFileSync(asarFile, crypto.randomBytes(4096));
    const r = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('3.6 4KB random binary payload exits with code 1', r.status === 1, `Status: ${r.status}`);
    check('3.7 4KB random payload reports clean failure',
      (r.stderr + r.stdout).includes('安装失败'),
      `Output: ${r.stderr || r.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 3.4 Invalid JSON in header structure
{
  const { tempDir, localAppData, resourcesDir } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    const asarFile = path.join(resourcesDir, 'app.asar');
    // Minimal custom corrupt header: [uint32: 4, uint32: headerSize + 8, uint32: headerSize + 4, uint32: headerSize, "{corrupt_json...}"]
    const badJson = '{"files": {"invalid';
    const headerBuf = Buffer.from(badJson, 'utf8');
    const headerSize = headerBuf.length;
    const headerWrapper = Buffer.alloc(16 + headerSize);
    headerWrapper.writeUInt32LE(4, 0);
    headerWrapper.writeUInt32LE(headerSize + 8, 4);
    headerWrapper.writeUInt32LE(headerSize + 4, 8);
    headerWrapper.writeUInt32LE(headerSize, 12);
    headerBuf.copy(headerWrapper, 16);
    fs.writeFileSync(asarFile, headerWrapper);

    const r = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('3.8 Invalid JSON header in asar exits with code 1', r.status === 1, `Status: ${r.status}`);
    check('3.9 Malformed JSON caught without snapshot crash',
      (r.stderr + r.stdout).includes('安装失败'),
      `Output: ${r.stderr || r.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------------
// Test Group 4: Process Fail-Safe & Running IDE Protection
// -----------------------------------------------------------------------------
console.log('\nGroup 4: Fail-Safe Process Detection & Host Protection');

let hostIdeRunning = false;
try {
  const psCheck = spawnSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-Process -Name Antigravity -ErrorAction SilentlyContinue).Count',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });
  const procCount = parseInt((psCheck.stdout || '').trim(), 10);
  hostIdeRunning = Number.isFinite(procCount) && procCount > 0;
} catch {
  hostIdeRunning = false;
}

if (!hostIdeRunning) {
  console.log('  ⚠️ [SKIP] Host Antigravity IDE is not running. Skipping Group 4 running-process protection tests.');
} else {
  const { tempDir, localAppData, resourcesDir, appRoot } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'Antigravity.exe'), 'stub-exe');
    const validAsar = buildValidAsar(tempDir);
    const asarFile = path.join(resourcesDir, 'app.asar');
    fs.copyFileSync(validAsar, asarFile);
    const initialHash = sha256(asarFile);

    // 4.1 Normal Install with running IDE
    const rInstall = runExe([], { LOCALAPPDATA: localAppData });
    check('4.1 Normal mode detects running IDE and exits with code 1',
      rInstall.status === 1,
      `Status: ${rInstall.status}`);
    check('4.2 Normal mode displays fail-safe running warning',
      (rInstall.stderr + rInstall.stdout).includes('检测到 Antigravity 正在运行，请先完全退出'),
      `Output: ${rInstall.stderr || rInstall.stdout}`);
    check('4.3 Normal mode leaves sandboxed app.asar untouched',
      sha256(asarFile) === initialHash,
      'Hash must match initialHash');
    check('4.4 Normal mode does not create zh-patch or app folder',
      !fs.existsSync(path.join(resourcesDir, 'zh-patch')) &&
      !fs.existsSync(path.join(resourcesDir, 'app')),
      'No patch directories created');

    // 4.2 Revert mode with running IDE
    const rRevert = runExe(['--revert'], { LOCALAPPDATA: localAppData });
    check('4.5 Revert mode detects running IDE and exits with code 1',
      rRevert.status === 1,
      `Status: ${rRevert.status}`);
    check('4.6 Revert mode displays fail-safe running warning',
      (rRevert.stderr + rRevert.stdout).includes('检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再还原。'),
      `Output: ${rRevert.stderr || rRevert.stdout}`);

    // 4.3 Verify Host IDE is still running
    const psCheck = spawnSync('powershell', ['-Command', '(Get-Process -Name Antigravity -ErrorAction SilentlyContinue).Count'], {
      encoding: 'utf8',
    });
    const procCount = parseInt((psCheck.stdout || '').trim(), 10);
    check('4.7 Host Antigravity IDE processes were NOT terminated (fail-safe intact)',
      Number.isFinite(procCount) && procCount > 0,
      `Alive count: ${procCount}`);

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------------
// Test Group 5: Dry-Run Mode vs Normal Mode
// -----------------------------------------------------------------------------
console.log('\nGroup 5: Dry-Run Mode Preview Behavior');

{
  const { tempDir, localAppData, resourcesDir, appRoot } = createSandbox();
  try {
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'Antigravity.exe'), 'stub-exe');
    const validAsar = buildValidAsar(tempDir);
    const asarFile = path.join(resourcesDir, 'app.asar');
    fs.copyFileSync(validAsar, asarFile);
    const beforeHash = sha256(asarFile);

    const rDry = runExe(['--dry-run'], { LOCALAPPDATA: localAppData });
    check('5.1 Dry-run mode exits cleanly with code 0', rDry.status === 0, `Status: ${rDry.status}`);
    check('5.2 Dry-run mode announces preview mode',
      rDry.stdout.includes('🚀 Antigravity 中文汉化补丁 (Next-Gen) [预览模式]'),
      `Stdout: ${rDry.stdout}`);
    check('5.3 Dry-run matches all 7 target native rules',
      rDry.stdout.includes('原生规则共匹配 7 条，未修改任何文件'),
      `Stdout: ${rDry.stdout}`);
    check('5.4 Target files were completely unmodified during dry-run',
      sha256(asarFile) === beforeHash,
      'app.asar hash strictly unchanged');
    check('5.5 No patch files or backups created in resources dir',
      !fs.existsSync(path.join(resourcesDir, 'app.asar.orig')) &&
      !fs.existsSync(path.join(resourcesDir, 'zh-patch')),
      'Clean resources dir');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------------
// Test Group 6: Staging Leaks & Temp File Hygiene
// -----------------------------------------------------------------------------
console.log('\nGroup 6: Resource Cleanup and Staging Hygiene');

{
  const tmpEntries = fs.readdirSync(os.tmpdir());
  const stagingDirs = tmpEntries.filter(name => name.startsWith('agy-staging-'));
  check('6.1 No orphaned agy-staging-* directories left in %TEMP%',
    stagingDirs.length === 0,
    `Found leaked: ${stagingDirs.join(', ')}`);
}

// -----------------------------------------------------------------------------
// Summary and Verdict
// -----------------------------------------------------------------------------
console.log('\n========================================');
console.log(`Results: ${pass} PASSED, ${fail} FAILED`);
console.log(`Final Verdict: ${fail === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
console.log('========================================');

process.exit(fail === 0 ? 0 : 1);
