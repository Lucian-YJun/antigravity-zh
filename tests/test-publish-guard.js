// 发布脚本的副作用边界：require 它只能拿到函数，绝不允许发起真实发布。
// 发布是不可逆的外部操作（创建 Release + 上传资产），曾经因为入口守卫写成
// `require.main === undefined` 也被当成"直接执行"，导致一次探视性 require
// 真的发出了 Release。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const repo = path.join(__dirname, '..');
const script = path.join(repo, 'scripts', 'publish-release.js');
const src = fs.readFileSync(script, 'utf8');

// 1. 源码层面：守卫不得把 require.main === undefined 当成执行条件
check('入口守卫不把 require.main === undefined 视为直接执行',
    !/require\.main\s*===\s*undefined/.test(src),
    '这会让 `node -e "require(...)"` 触发真实发布');
check('入口守卫要求 require.main === module',
    /if\s*\(\s*require\.main\s*===\s*module\s*\)/.test(src));
check('导出纯函数供测试复用',
    /module\.exports\s*=/.test(src) && /getToken/.test(src));

// 2. 行为层面：在隔离沙箱里 require 它，必须零网络、零副作用、正常退出
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pubguard-'));
const scriptsDir = path.join(sandbox, 'scripts');
fs.mkdirSync(scriptsDir, { recursive: true });
fs.copyFileSync(script, path.join(scriptsDir, 'publish-release.js'));
// 复制整个仓库结构里被引用的文件（RELEASE_NOTES），模拟真实环境
// 发布文档已收进 docs/guide/，沙箱里也按同样的新结构摆放
fs.mkdirSync(path.join(sandbox, 'docs', 'guide'), { recursive: true });
try { fs.copyFileSync(path.join(repo, 'docs', 'guide', 'RELEASE_NOTES.md'), path.join(sandbox, 'docs', 'guide', 'RELEASE_NOTES.md')); } catch (e) { }
try { fs.copyFileSync(path.join(repo, 'package.json'), path.join(sandbox, 'package.json')); } catch (e) { }

// 内联一个探针：拦截 https.request / net.connect / dns.lookup，
// 任何一个被调用都记下来。同时把 token 环境变量清空，
// 这样即使主流程真的跑了也会因为没有 token 而提前退出——
// 双保险：既有网络探针，也有行为断言。
const probe = path.join(sandbox, 'probe.js');
fs.writeFileSync(probe, [
    "const https = require('https');",
    "const http = require('http');",
    "const net = require('net');",
    "const dns = require('dns');",
    "let touched = [];",
    "const origReq = https.request;",
    "https.request = function () { touched.push('https.request'); return origReq.apply(this, arguments); };",
    "const origGet = http.get;",
    "http.get = function () { touched.push('http.get'); return origGet.apply(this, arguments); };",
    "const origConn = net.connect;",
    "net.connect = function () { touched.push('net.connect'); return origConn.apply(this, arguments); };",
    "const origLookup = dns.lookup;",
    "dns.lookup = function () { touched.push('dns.lookup'); return origLookup.apply(this, arguments); };",
    "const mod = require('./scripts/publish-release.js');",
    "setTimeout(() => {",
    "  const ok = typeof mod.getToken === 'function' && typeof mod.resolveAssets === 'function';",
    "  console.log('EXPORTS_OK=' + ok);",
    "  console.log('NETWORK=' + (touched.length ? touched.join(',') : 'none'));",
    "  process.exit(0);",
    "}, 500);",
].join('\n'), 'utf8');

const r = spawnSync(process.execPath, [probe], {
    cwd: sandbox,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', USERPROFILE: sandbox, HOME: sandbox },
});
const out = (r.stdout || '') + (r.stderr || '');
fs.rmSync(sandbox, { recursive: true, force: true });

check('require 该脚本后正常退出且不报错', r.status === 0 && !/发布失败|Error:/.test(out), out.slice(0, 300));
check('require 后正确导出纯函数', /EXPORTS_OK=true/.test(out), out.slice(0, 300));
check('require 后未发起任何网络请求',
    /NETWORK=none/.test(out), out.slice(0, 300));
check('require 后未打印发版流程的产出（不应出现 url / 上传字样）',
    !/html_url|创建 GitHub Release|附件上传成功/.test(out), out.slice(0, 300));

// 3. 资产清单必须与实际产物名字对齐
// 真实踩过的坑：把发布名从 Antigravity-zh-patch.exe 改成 Antigravity-zh.exe 后，
// resolveAssets 仍在找 dist/Antigravity-zh.exe —— 那个文件不存在（本地只有构建产物
// antigravity-tool.exe），于是发布被拒，且提示还指向已废弃的 build:exe。
const pub = require(script);
const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pubassets-'));
try {
    const dist = path.join(fakeRoot, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
    fs.writeFileSync(path.join(dist, `Antigravity-zh-patch-v${pkgVersion}.zip`), 'x');
    fs.writeFileSync(path.join(dist, 'antigravity-tool.exe'), 'MZ'); // 只放构建产物名
    fs.writeFileSync(path.join(dist, 'build-manifest.json'),
        JSON.stringify({ version: pkgVersion, exe: 'Antigravity-zh.exe', engine: 'rust' }));

    const assets = pub.resolveAssets(fakeRoot);
    check('resolveAssets 按构建产物名定位 exe（antigravity-tool.exe）',
        assets.length === 2 && assets.every(a => fs.existsSync(a.path)),
        JSON.stringify(assets.map(a => a.name)));
    check('上传使用的展示名是面向用户的 Antigravity-zh.exe',
        assets.some(a => a.name === 'Antigravity-zh.exe'),
        JSON.stringify(assets.map(a => a.name)));

    fs.rmSync(path.join(dist, 'antigravity-tool.exe'));
    let msg = '';
    try { pub.resolveAssets(fakeRoot); } catch (e) { msg = e.message; }
    check('缺少构建产物时拒绝发布', /缺少发布资产/.test(msg), msg.slice(0, 160));
    check('拒绝提示指向 build:rust，而非已废弃的 build:exe',
        Boolean(msg) && !/build:exe/.test(msg) && /build:rust/.test(msg), msg.slice(0, 240));
} finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
}

// 4. 顺序守卫：必须先确认「要发布的提交已在远端」，再动资产与 Release。
// Release 的 target_commitish 是 main；本地领先远端时直接发布会把 tag 打在旧的
// main 上，Release 对应的源码与上传的产物就不是同一份，事后极难发现。
const callAssert = src.indexOf('assertRemoteHasHead(path.join(__dirname');
const callResolve = src.indexOf('const assets = resolveAssets(');
const callCreate = src.indexOf('创建 GitHub Release');
check('定义了 assertRemoteHasHead',
    /function assertRemoteHasHead\s*\(/.test(src));
check('assertRemoteHasHead 在 resolveAssets 之前调用',
    callAssert > 0 && callResolve > 0 && callAssert < callResolve);
check('assertRemoteHasHead 在创建 Release 之前调用',
    callAssert > 0 && callCreate > 0 && callAssert < callCreate);

console.log(`\n发布脚本副作用边界: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
