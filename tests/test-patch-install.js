// 安装流程集成测试：在临时目录里用 asar 构造合成安装目录，真实 spawn scripts/patch.js。
// 全程不改动 %LOCALAPPDATA% 下的真实安装（通过覆盖 LOCALAPPDATA 指向沙箱），
// 也不做主流程 require（patch.js 有 require.main !== module 守卫，require 只会导出纯函数）。
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const patchScript = path.join(__dirname, '..', 'scripts', 'patch.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ---- 沙箱准备 ----
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-install-test-'));
const sandboxLocalAppData = path.join(root, 'LocalAppData');
const appRoot = path.join(sandboxLocalAppData, 'Programs', 'antigravity');
const resourcesDir = path.join(appRoot, 'resources');
const asarPath = path.join(resourcesDir, 'app.asar');
const origPath = path.join(resourcesDir, 'app.asar.orig');
const metaPath = path.join(resourcesDir, 'app.asar.orig.meta.json');
const appDir = path.join(resourcesDir, 'app');
const kitDir = path.join(resourcesDir, 'zh-patch');

fs.mkdirSync(resourcesDir, { recursive: true });
fs.writeFileSync(path.join(appRoot, 'Antigravity.exe'), 'stub');

// 进程枚举必须在子进程里被 stub：真实 Antigravity 正在本机运行，脚本会拒绝执行。
// 用 --require 预加载，覆写 execSync。PowerShell 走 -EncodedCommand，需要解码后再判断
// 是「枚举 Antigravity」还是「取祖先链」。
const preloadPath = path.join(root, 'stub-process.js').split(path.sep).join('/');
fs.writeFileSync(preloadPath, `'use strict';
const child_process = require('child_process');
const original = child_process.execSync;

function decodePowerShell(command) {
  const m = /-EncodedCommand\\s+([A-Za-z0-9+/=]+)/.exec(command);
  if (!m) return null;
  try { return Buffer.from(m[1], 'base64').toString('utf16le'); } catch { return null; }
}

child_process.execSync = function (command, options) {
  const cmd = String(command);
  if (cmd.includes('powershell')) {
    const decoded = decodePowerShell(cmd) || '';
    // 祖先链查询返回自身 PID；进程枚举返回空列表（即 IDE 未运行）
    if (decoded.includes('ParentProcessId')) return String(process.pid) + '\\n';
    if (decoded.includes('Get-CimInstance Win32_Process')) return '';
    return '';
  }
  if (cmd.includes('tasklist')) return 'INFO: No tasks are running which match the specified criteria.';
  if (cmd.includes('taskkill')) return '';
  return original.apply(this, arguments);
};
`);

const targets = {
  utils: 'dist/utils.js',
  menu: 'dist/menu.js',
  main: 'dist/main.js',
  tray: 'dist/tray.js',
  updater: 'dist/updater.js',
  ipchandlers: 'dist/ipcHandlers.js',
  wizard: 'dist/ideInstall/wizardHtml.js',
};

// 用真实的替换规则构造「能被补丁改动」的源文件：文件内容就是第一条规则的原文，
// 这样每条规则必然命中，部署结果一眼可辨。
function buildAsar(tag) {
  const src = path.join(root, 'src-' + tag);
  fs.rmSync(src, { recursive: true, force: true });
  for (const [scope, rel] of Object.entries(targets)) {
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'native', `${scope}.replacements.json`), 'utf8'));
    const file = path.join(src, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `// BUILD:${tag}\n` + rules[0][0], 'utf8');
  }
  const out = path.join(root, `${tag}.asar`);
  fs.rmSync(out, { force: true });
  // asar.createPackage 是异步的，放进子进程同步等待
  execFileSync(process.execPath, [
    '-e',
    `require('asar').createPackage(${JSON.stringify(src)}, ${JSON.stringify(out)})` +
    `.catch(e => { console.error(e); process.exit(1); })`,
  ], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  return out;
}

const buildV1 = buildAsar('v1-old');
const buildV2 = buildAsar('v2-updated');
const buildV3 = buildAsar('v3-updated');

function runPatch(args, extraEnv) {
  const env = Object.assign({}, process.env, {
    LOCALAPPDATA: sandboxLocalAppData,
    NODE_OPTIONS: `--require "${preloadPath}"`,
  }, extraEnv || {});
  return spawnSync(process.execPath, [patchScript, ...args], {
    env,
    encoding: 'utf8',
    timeout: 120000,
  });
}

function deployedBuild() {
  const file = path.join(appDir, 'dist', 'utils.js');
  if (!fs.existsSync(file)) return null;
  const m = /\/\/ BUILD:(\S+)/.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1] : null;
}

// 目录快照：文件名 + 内容哈希，用来断言 --dry-run 没改动任何东西
function snapshot(dir) {
  const out = [];
  const walk = (cur, rel) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      const key = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { out.push(key + '/'); walk(abs, key); }
      else out.push(`${key}=${sha256(abs)}`);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out.sort().join('\n');
}

// ---- ① 全新安装 ----
fs.copyFileSync(buildV1, asarPath);
let r = runPatch([]);
check('① 全新安装退出码为 0', r.status === 0, (r.stderr || '') + (r.stdout || ''));
check('① 部署的是 app.asar 解包出的构建', deployedBuild() === 'v1-old', String(deployedBuild()));
check('① 原包已备份为 app.asar.orig', fs.existsSync(origPath) && sha256(origPath) === sha256(buildV1));
check('① 备份溯源 meta 已写入且 sha 匹配', (() => {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.source && meta.source.sha256 === sha256(buildV1) && meta.source.size === fs.statSync(buildV1).size;
})(), fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '无 meta');
check('① 翻译组件已部署', fs.existsSync(path.join(kitDir, 'zh-i18n.js')) && fs.existsSync(path.join(kitDir, 'cockpit-zh.json')));
check('① 注入规则已生效', fs.readFileSync(path.join(appDir, 'dist', 'utils.js'), 'utf8').includes('zh-patch/zh-i18n'));
check('① 部署后不残留中间目录', !fs.existsSync(path.join(resourcesDir, 'app.new')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.old')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.tmp')));

// ---- ④ --dry-run 不改动任何文件（在已打补丁状态上验证） ----
{
  const before = snapshot(resourcesDir);
  const dry = runPatch(['--dry-run']);
  const after = snapshot(resourcesDir);
  check('④ --dry-run 退出码为 0', dry.status === 0, (dry.stderr || '') + (dry.stdout || ''));
  check('④ --dry-run 未改动安装目录任何文件', before === after);
  check('④ --dry-run 未产生 app.new / app.old', !fs.existsSync(path.join(resourcesDir, 'app.new')) &&
    !fs.existsSync(path.join(resourcesDir, 'app.old')));
}

// ---- ② 客户端更新后重新打补丁：必须部署新构建而非过期备份 ----
fs.copyFileSync(buildV2, asarPath);
r = runPatch([]);
check('② 客户端更新后重新打补丁退出码为 0', r.status === 0, (r.stderr || '') + (r.stdout || ''));
check('② 部署的是新构建 v2-updated 而不是过期备份 v1-old', deployedBuild() === 'v2-updated', String(deployedBuild()));
check('② 备份已刷新为新版本（回滚仍能回到当前已装版本原版）',
  fs.existsSync(origPath) && sha256(origPath) === sha256(buildV2));
check('② 溯源 meta 已刷新', (() => {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.source.sha256 === sha256(buildV2);
})());

// 再次重打补丁：此时 app.asar 已改名成 .orig，应继续用 .orig 解包（干净英文态重建）
r = runPatch([]);
check('② 二次重打补丁仍使用同源备份并成功', r.status === 0 && deployedBuild() === 'v2-updated',
  String(deployedBuild()));

// ---- ③ --revert 还原 ----
r = runPatch(['--revert']);
check('③ --revert 退出码为 0', r.status === 0, (r.stderr || '') + (r.stdout || ''));
check('③ app.asar 已还原为原版', fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV2));
check('③ app/ 与 zh-patch/ 已删除', !fs.existsSync(appDir) && !fs.existsSync(kitDir));
check('③ 还原后清理了溯源 meta', !fs.existsSync(metaPath));
check('③ 还原后不残留 app.asar.orig', !fs.existsSync(origPath));

// ---- ③b 客户端更新后直接还原：不能用过期备份把更新的包降级 ----
fs.copyFileSync(buildV2, asarPath);
r = runPatch([]);
check('③b 前置打补丁成功', r.status === 0 && fs.existsSync(origPath), (r.stderr || ''));
// 模拟客户端更新：写入新包，但 .orig 仍是 v2
fs.copyFileSync(buildV3, asarPath);
r = runPatch(['--revert']);
const staleOut = (r.stdout || '') + (r.stderr || '');
// 提示要用户能懂：说清发生了什么（客户端已更新）、当前状态（英文原版、补丁已移除）、
// 以及无需额外操作；同时不再出现「不同源」这类术语。
check('③b 过期备份场景还原退出码为 0，且提示说明了原因、现状与无需操作',
  r.status === 0 &&
  /客户端已经更新过/.test(staleOut) &&
  /英文原版/.test(staleOut) && /补丁已全部移除/.test(staleOut) &&
  /无需任何额外操作/.test(staleOut) && !/不同源/.test(staleOut),
  staleOut.slice(-300));
check('③b 保留客户端更新后的新包，不回退到旧版本',
  fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV3));
check('③b 丢弃过期备份与 meta', !fs.existsSync(origPath) && !fs.existsSync(metaPath));
check('③b 补丁产物已清除', !fs.existsSync(appDir) && !fs.existsSync(kitDir));

// ---- ⑤ 部署中途失败：安装目录仍可正常使用 ----
fs.copyFileSync(buildV3, asarPath);
// 先正常打补丁，制造「已部署 app/ + 有同源备份」的现场
r = runPatch([]);
check('⑤ 前置打补丁成功', r.status === 0 && deployedBuild() === 'v3-updated', String(deployedBuild()));

// 再模拟一次客户端更新，此时 app.asar 存在且 app/ 是已部署的 v3
fs.copyFileSync(buildV3, asarPath);
const injected = runPatch([], { AGY_ZH_TEST_FAIL_RENAME: 'app.new>app' });
const injectedOut = (injected.stdout || '') + (injected.stderr || '');
check('⑤ 注入失败后退出码非 0', injected.status !== 0, String(injected.status));
// 确认失败点真的落在「app.new → app」这一步：备份已改名到临时名、app 已退到 app.old，
// 才有资格证明后面的回滚把这两步都撤销了
check('⑤ 失败点确实命中了 app.new → app 这一步', /注入的部署失败/.test(injectedOut), injectedOut.slice(-300));
check('⑤ 失败后 app.asar 仍在（可启动）', fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV3));
check('⑤ 失败后已部署的 app/ 完好', deployedBuild() === 'v3-updated', String(deployedBuild()));
check('⑤ 失败后原版备份仍在', fs.existsSync(origPath) && sha256(origPath) === sha256(buildV3));
check('⑤ 失败后备份 meta 未被覆写为半成品状态', (() => {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.source.sha256 === sha256(buildV3);
})());
check('⑤ 失败后无中间目录残留', !fs.existsSync(path.join(resourcesDir, 'app.new')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.old')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.tmp')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.old')) &&
  !fs.existsSync(path.join(resourcesDir, 'zh-patch.new')));
check('⑤ 失败后回滚输出明确', /回滚/.test(injectedOut) && !/回滚「[^」]+」失败/.test(injectedOut), injectedOut.slice(-300));

// 失败点更靠后时（备份落位一步），app/ 与 zh-patch/ 已经切换完成，必须整段撤回
{
  const lateInjected = runPatch([], { AGY_ZH_TEST_FAIL_RENAME: 'app.asar.orig.tmp>app.asar.orig' });
  const lateOut = (lateInjected.stdout || '') + (lateInjected.stderr || '');
  check('⑤ 靠后失败点退出码非 0', lateInjected.status !== 0, String(lateInjected.status));
  check('⑤ 靠后失败点确实命中备份落位步', /app\.asar\.orig\.tmp → app\.asar\.orig/.test(lateOut), lateOut.slice(-300));
  check('⑤ 靠后失败后 app/ 已回滚到旧内容', deployedBuild() === 'v3-updated', String(deployedBuild()));
  check('⑤ 靠后失败后 app.asar 仍在且内容未变', fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV3));
  check('⑤ 靠后失败后备份仍在', fs.existsSync(origPath) && sha256(origPath) === sha256(buildV3));
  check('⑤ 靠后失败后无中间残留', !fs.existsSync(path.join(resourcesDir, 'app.new')) &&
    !fs.existsSync(path.join(resourcesDir, 'app.old')) &&
    !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.tmp')) &&
    !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.old')) &&
    !fs.existsSync(path.join(resourcesDir, 'zh-patch.new')) &&
    !fs.existsSync(path.join(resourcesDir, 'zh-patch.old')));
}

// 失败现场必须能继续使用：重试补丁应成功
r = runPatch([]);
check('⑤ 失败后重试补丁成功', r.status === 0 && deployedBuild() === 'v3-updated', (r.stderr || ''));

// 且仍能回滚到当前已装版本的原版代码
r = runPatch(['--revert']);
check('⑤ 失败后仍可还原到当前版本原版', r.status === 0 && fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV3));

// ---- ⑥ 全新安装时中途失败：不能留下「半部署」的 app/ ----
// 全新安装本来没有 app/ 与 zh-patch/；若后面的步骤失败却把 app/ 留下，
// Electron 会优先读解包目录，用户看到的其实是被改过的代码，与原状不符。
fs.writeFileSync(asarPath, fs.readFileSync(buildV3));
const freshFail = runPatch([], { AGY_ZH_TEST_FAIL_RENAME: 'app.asar.orig.tmp>app.asar.orig' });
const freshOut = (freshFail.stdout || '') + (freshFail.stderr || '');
check('⑥ 全新安装中途失败退出码非 0', freshFail.status !== 0, String(freshFail.status));
check('⑥ 失败点命中备份落位步', /app\.asar\.orig\.tmp → app\.asar\.orig/.test(freshOut), freshOut.slice(-300));
check('⑥ 失败后不残留 app/（不产生半部署）', !fs.existsSync(appDir), String(deployedBuild()));
check('⑥ 失败后不残留 zh-patch/', !fs.existsSync(kitDir));
check('⑥ 失败后 app.asar 完好', fs.existsSync(asarPath) && sha256(asarPath) === sha256(buildV3));
check('⑥ 失败后未留下溯源 meta', !fs.existsSync(metaPath) || (() => {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.source.sha256 === sha256(buildV3);
})());
check('⑥ 失败后无中间残留', !fs.existsSync(path.join(resourcesDir, 'app.new')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.old')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.tmp')) &&
  !fs.existsSync(path.join(resourcesDir, 'app.asar.orig.old')) &&
  !fs.existsSync(path.join(resourcesDir, 'zh-patch.new')) &&
  !fs.existsSync(path.join(resourcesDir, 'zh-patch.old')));

// ---- 清理 ----
fs.rmSync(root, { recursive: true, force: true });

console.log(`\n安装流程集成测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
