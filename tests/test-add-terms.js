// add-terms.js 的行为测试：解析、校验、去重、变体冗余、写入、幂等、性能。
// 全部在沙箱词典副本上跑，绝不触碰真实 src/cockpit-zh.json。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}

const repo = path.join(__dirname, '..');
const script = path.join(repo, 'scripts', 'add-terms.js');
const realDict = path.join(repo, 'src', 'cockpit-zh.json');
const realDictHashBefore = require('crypto').createHash('sha256').update(fs.readFileSync(realDict)).digest('hex');

// 沙箱：每个用例一份独立词典副本
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'addterms-'));

function makeDict(entries) {
    const p = path.join(sandbox, 'dict-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(p, JSON.stringify({ dict: entries, rules: [] }, null, 2) + '\n', 'utf8');
    return p;
}
function readDict(p) { return JSON.parse(fs.readFileSync(p, 'utf8')).dict; }
function makeInput(lines) {
    const p = path.join(sandbox, 'in-' + Math.random().toString(36).slice(2) + '.txt');
    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
    return p;
}
function run(input, dictPath, extra = []) {
    const r = spawnSync(process.execPath, [script, input, '--dict', dictPath, ...extra], {
        encoding: 'utf8', timeout: 60000,
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// ---------- 1. 解析 ----------
{
    const d = makeDict({});
    const out = run(makeInput([
        '# 注释行应被忽略',
        '',
        'Alpha = 甲',
        'Beta => 乙',
        'Gamma：丙',
        'Delta',
    ]), d).out;
    const dict = readDict(d);
    check('解析：= 分隔符', dict['Alpha'] === '甲', JSON.stringify(dict['Alpha']));
    check('解析：=> 分隔符', dict['Beta'] === '乙', JSON.stringify(dict['Beta']));
    check('解析：中文冒号分隔符', dict['Gamma'] === '丙', JSON.stringify(dict['Gamma']));
    check('解析：只给原文写入占位符', dict['Delta'] === '⟪待翻译⟫', JSON.stringify(dict['Delta']));
    check('解析：注释与空行不产生条目', !('' in dict) && !Object.keys(dict).some(k => k.startsWith('#')));
}

// ---------- 2. 校验 ----------
{
    const d = makeDict({});
    const out = run(makeInput([
        '  前导空格 = 甲',
        '尾部空格 = 乙   ',
        '空译文 =',
        '= 只有译文',
    ]), d, ['--dry-run']).out;
    check('校验：首尾空格的行被判非法', /非法 4/.test(out), out.split('\n')[0]);
    const dict = readDict(d);
    check('校验：非法行未被写入', Object.keys(dict).length === 0, JSON.stringify(dict));
}

// ---------- 3. 精确重复 ----------
{
    const d = makeDict({ 'Existing': '已有' });
    const out = run(makeInput(['Existing = 新的']), d).out;
    const dict = readDict(d);
    check('重复：已存在的 key 默认跳过', dict['Existing'] === '已有', JSON.stringify(dict['Existing']));
    check('重复：输出中报告跳过数', /跳过 1/.test(out), out.split('\n')[0]);
}
{
    const d = makeDict({ 'Existing': '已有' });
    run(makeInput(['Existing = 覆盖后']), d, ['--force']);
    check('重复：--force 可覆盖', readDict(d)['Existing'] === '覆盖后', JSON.stringify(readDict(d)['Existing']));
}

// ---------- 4. 变体冗余 ----------
{
    const d = makeDict({ 'Dashboard': '仪表盘' });
    const out = run(makeInput(['dashboard = 仪表盘', 'DASHBOARD = 仪表盘']), d).out;
    const dict = readDict(d);
    check('冗余：大小写变体被拦下', !('dashboard' in dict) && !('DASHBOARD' in dict), JSON.stringify(Object.keys(dict)));
    check('冗余：输出中报告冗余数', /冗余 2/.test(out), out.split('\n')[0]);
}
{
    // 只给原文且归一化后已覆盖：必须拦下，否则占位符会遮蔽正确译文
    const d = makeDict({ 'Hooks': '钩子' });
    run(makeInput(['hooks']), d);
    const dict = readDict(d);
    check('冗余：只给原文的变体也必须拦下（否则占位符遮蔽正确译文）', !('hooks' in dict), JSON.stringify(Object.keys(dict)));
}
{
    // 译文不同 → 不是冗余，应允许
    const d = makeDict({ 'Settings': '设置' });
    run(makeInput(['settings = 设置项']), d);
    check('冗余：归一化相同但译文不同时允许写入', readDict(d)['settings'] === '设置项', JSON.stringify(readDict(d)['settings']));
}
{
    // 标点类变体：引擎按标点类别分桶，不是冗余
    const d = makeDict({ 'Dashboard': '仪表盘' });
    run(makeInput(['Dashboard. = 仪表盘。']), d);
    check('冗余：标点变体不误拦（引擎按标点类别分桶）', readDict(d)['Dashboard.'] === '仪表盘。', JSON.stringify(readDict(d)['Dashboard.']));
}
{
    // 同一批输入内部的变体也要去重
    const d = makeDict({});
    run(makeInput(['Foo = 甲', 'FOO = 甲']), d);
    const dict = readDict(d);
    const n = ('Foo' in dict ? 1 : 0) + ('FOO' in dict ? 1 : 0);
    check('冗余：同一批文件内的变体互相去重', n === 1, JSON.stringify(dict));
}

// ---------- 5. dry-run 与写入 ----------
{
    const d = makeDict({});
    const before = fs.readFileSync(d, 'utf8');
    run(makeInput(['DryRun = 干跑']), d, ['--dry-run']);
    check('dry-run：不修改词典文件', fs.readFileSync(d, 'utf8') === before);
    check('dry-run：不写入条目', !('DryRun' in readDict(d)));
}
{
    const d = makeDict({});
    const r = run(makeInput(['Written = 已写入']), d);
    check('写入：条目落盘', readDict(d)['Written'] === '已写入');
    check('写入：退出码为 0', r.code === 0, 'exit=' + r.code);
    check('写入：报告静态体检通过', /体检通过/.test(r.out), r.out.slice(-120));
}

// ---------- 6. 幂等 ----------
{
    const d = makeDict({});
    const input = makeInput(['Idem = 幂等']);
    run(input, d);
    const after1 = fs.readFileSync(d, 'utf8');
    run(input, d);
    const after2 = fs.readFileSync(d, 'utf8');
    check('幂等：重复运行不产生变化', after1 === after2);
    check('幂等：第二次运行报告跳过而非新增', /新增\/更新 0/.test(run(input, d).out), run(input, d).out.split('\n')[0]);
}

// ---------- 7. 不触碰真实词典 ----------
{
    const hashNow = require('crypto').createHash('sha256').update(fs.readFileSync(realDict)).digest('hex');
    check('隔离：全程未修改真实 src/cockpit-zh.json', hashNow === realDictHashBefore);
}

// ---------- 8. 效率 ----------
{
    const d = makeDict({});
    const lines = [];
    for (let i = 0; i < 1000; i++) lines.push(`Perf Term ${i} = 性能词条 ${i}`);
    const input = makeInput(lines);
    const t0 = Date.now();
    const r = run(input, d);
    const ms = Date.now() - t0;
    const dict = readDict(d);
    check('效率：1000 条输入全部写入', Object.keys(dict).length === 1000, Object.keys(dict).length + ' 条');
    check('效率：1000 条在 10 秒内完成', ms < 10000, ms + 'ms');
    console.log(`      (1000 条耗时 ${ms}ms，含 Node 启动与静态体检)`);
    check('效率：退出码为 0', r.code === 0, 'exit=' + r.code);
}
{
    // 万级输入下的变体去重仍应线性：5000 条里一半是重复变体
    const d = makeDict({});
    const lines = [];
    for (let i = 0; i < 2500; i++) {
        lines.push(`Bulk ${i} = 批量 ${i}`);
        lines.push(`BULK ${i} = 批量 ${i}`);   // 与上一条归一化后同键、同译文
    }
    const input = makeInput(lines);
    const t0 = Date.now();
    run(input, d);
    const ms = Date.now() - t0;
    const dict = readDict(d);
    check('效率：5000 条大小写成对输入只留一半', Object.keys(dict).length === 2500, Object.keys(dict).length + ' 条');
    check('效率：5000 条在 20 秒内完成', ms < 20000, ms + 'ms');
    console.log(`      (5000 条耗时 ${ms}ms)`);
}

fs.rmSync(sandbox, { recursive: true, force: true });
console.log(`\n提词条脚本: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
