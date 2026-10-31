// 词典监视健壮性回归：fs.watch 的 error 是异步事件，未监听会以 unhandled error
// 终止主进程。这段代码注入的是 Antigravity 主进程，崩溃即整个 IDE 消失。
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

// 在临时目录复制引擎与词典，用假 fs.watch 注入异步 error 后观察进程是否存活
function runInSandbox(sourceTransform) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-watch-'));
    fs.copyFileSync(path.join(repo, 'src', 'zh-i18n.js'), path.join(dir, 'zh-i18n.js'));
    fs.copyFileSync(path.join(repo, 'src', 'cockpit-zh.json'), path.join(dir, 'cockpit-zh.json'));

    const harness = path.join(dir, 'harness.js');
    const body = [
        "const fs = require('fs');",
        "const { EventEmitter } = require('events');",
        // 用真实 EventEmitter：没有 error 监听器时 emit('error') 会抛未捕获异常并终止进程，
        // 与真实 FSWatcher 的行为一致。若这里是自造的静默 emit，就测不出崩溃。
        "fs.watch = function (p, cb) {",
        "  const w = new EventEmitter();",
        "  w.close = () => {};",
        "  setTimeout(() => { w.emit('error', new Error('EPERM: operation not permitted, watch')); }, 30);",
        "  return w;",
        "};",
        sourceTransform || '',
        "const zh = require('./zh-i18n.js');",
        "const calls = [];",
        "const win = { isDestroyed: () => false, once: (e, f) => { win['_' + e] = f; },",
        "  webContents: { on: () => {}, executeJavaScript: (js) => { calls.push(js); return Promise.resolve(); } } };",
        "zh.attachWebTranslator(win);",
        // 让异步 error 有机会触发；若未被监听，Node 会以 unhandled 'error' 退出
        "setTimeout(() => {",
        "  console.log('ALIVE after watcher error');",
        "  console.log('CLOSED_REGISTERED', typeof win._closed === 'function');",
        "  process.exit(0);",
        "}, 400);",
        // 若词典变更推送仍能工作，说明降级路径接管了
        "setTimeout(() => {",
        "  require('fs').writeFileSync(require('path').join(__dirname, 'cockpit-zh.json'),",
        "    JSON.stringify({ dict: { Hot: '热' }, rules: [] }));",
        "}, 100);",
        "setTimeout(() => { console.log('PUSHES', calls.length); }, 900);",
    ].join('\n');
    fs.writeFileSync(harness, body, 'utf8');

    const r = spawnSync(process.execPath, [harness], { encoding: 'utf8', timeout: 20000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// 1. watcher 抛出异步 error 时进程必须存活
const res = runInSandbox('');
check('fs.watch 触发异步 error 后进程仍存活（不再 unhandled crash）',
    res.code === 0 && /ALIVE after watcher error/.test(res.out),
    `exit=${res.code} ${res.out.slice(0, 300)}`);

// 2. 窗口关闭时从注册表移除
check('窗口注册了 closed 监听以清理引用',
    /CLOSED_REGISTERED true/.test(res.out),
    res.out.slice(-200));

// 3. 源码必须给 watcher 挂 error 监听（防止未来被删掉）
const src = fs.readFileSync(path.join(repo, 'src', 'zh-i18n.js'), 'utf8');
check('源码为 FSWatcher 注册了 error 监听',
    /fs\.watch\([^)]*\)[\s\S]{0,400}?\.on\(['"]error['"]/.test(src));
check('提供 mtime 轮询作为降级路径',
    /function startMtimePoll/.test(src) && /setInterval/.test(src));
check('attachWebTranslator 用 once 清理关闭窗口',
    /once\(\s*['"]closed['"]/.test(src));

console.log(`\n词典监视健壮性: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
