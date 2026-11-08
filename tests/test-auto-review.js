// 自动预筛工具单测：三态判定、可解释性、统计自洽、dry-run 零写入
// 运行：node tests/test-auto-review.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'auto-review.js');
const ar = require(SCRIPT);

let pass = 0, fail = 0;
function check(name, cond, errMsg = '') {
    if (cond) {
        pass++;
        console.log('PASS  ' + name);
    } else {
        fail++;
        console.log('FAIL  ' + name + (errMsg ? ` (${errMsg})` : ''));
    }
}

const ctx = ar.buildContext();
const { classify, RULES } = ar;
const item = (src, extra = {}) => Object.assign({
    src,
    suggest: '译文',
    category: '其它 UI 文案',
    keys: [],
    menuOnly: false,
    inDistPool: false,
    file: 'main.js',
    loc: 1,
    note: ''
}, extra);

// ---- 1) 硬噪声必须 REJECT ----
const rejects = [
    ['品牌名 Antigravity', 'Antigravity'],
    ['品牌名 Google', 'Google'],
    ['URL https://example.com/foo', 'https://example.com/foo'],
    ['裸域名 example.com', 'example.com'],
    ['含中文 删除对话', '删除对话'],
    ['camelCase 技术串 toggleSidePanel', 'toggleSidePanel'],
    ['CSS 类名 side-panel-container', 'side-panel-container'],
    ['Windows 文件路径 C:\\Users\\foo\\bar.js', 'C:\\Users\\foo\\bar.js'],
    ['纯大写缩写 API', 'API'],
    ['点号技术标识符 utils.createWindow', 'utils.createWindow'],
    ['base64 串', 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo='],
    ['单字母 X', 'X'],
    ['纯数字 12345', '12345'],
    ['示例数据 United States', 'United States'],
    ['示例数据 Gemini 3 Pro Image', 'Gemini 3 Pro Image']
];
for (const [name, src] of rejects) {
    check('REJECT · ' + name, classify(item(src), ctx).state === 'REJECT', classify(item(src), ctx).reasons.join('；'));
}

// ---- 2) 活体界面真出现的文案 → 非 REJECT ----
const liveSrcs = ['Toggle Side Panel', 'Load older messages', 'Overview tab', 'Cancel (Ctrl+D)'];
for (const src of liveSrcs) {
    const v = classify(item(src), ctx);
    check('活体 L 非 REJECT · ' + src, v.state !== 'REJECT', '实际=' + v.state);
}
check('活体 L 索引命中 Toggle Side Panel', ctx.liveIndex.live.has('Toggle Side Panel'));

// ---- 3) 强 UI 键名 → ACCEPT ----
check('强 UI 键 title → ACCEPT', classify(item('Changes', { keys: ['title'] }), ctx).state === 'ACCEPT');
check('强 UI 键 placeholder → ACCEPT', classify(item('Paste code', { keys: ['placeholder'] }), ctx).state === 'ACCEPT');
// 注意：这里刻意用一个**不在词典里**的词。
// 早期版本用 'Select'，但该词后来被补进词典，auto-review 依「与已有 dict 同形」判 ACCEPT
// 是正确的 —— 失效的是样例而不是规则。用动态选出的探针词保持断言的原始意图：
// 弱键（name）本身不足以让一条陌生文案被判 ACCEPT。
const weakKeyProbe = "Zephyr";
check('弱键 name 不自动放行', classify(item(weakKeyProbe, { keys: ['name'] }), ctx).state !== 'ACCEPT');

// ---- 4) 全量报告：计数自洽 / 每条可解释 / 字段完整 ----
const report = ar.buildReport(ctx);
const c = report.counts;
check('F−L 共 651 条', c.total === 651, '实际=' + c.total);
check('16 个分类', c.categories === 16, '实际=' + c.categories);
check('三态计数自洽 ACCEPT+REJECT+REVIEW === total',
    c.ACCEPT + c.REJECT + c.REVIEW === c.total,
    `${c.ACCEPT}+${c.REJECT}+${c.REVIEW} != ${c.total}`);
check('counts 与 items 实际分布一致',
    report.items.filter(x => x.state === 'ACCEPT').length === c.ACCEPT &&
    report.items.filter(x => x.state === 'REJECT').length === c.REJECT &&
    report.items.filter(x => x.state === 'REVIEW').length === c.REVIEW);
check('人工工作量下降 > 0', c.manualAfter < c.manualBaseline && c.reduction === c.manualBaseline - c.manualAfter);
check('generatedAt 存在', typeof report.generatedAt === 'string' && !Number.isNaN(Date.parse(report.generatedAt)));

const badState = report.items.filter(x => !RULES.states.includes(x.state));
const badReasons = report.items.filter(x => !Array.isArray(x.reasons) || x.reasons.length === 0 || x.reasons.some(r => typeof r !== 'string' || !r.trim()));
const badChecked = report.items.filter(x => x.checked !== false);
const badFields = report.items.filter(x => typeof x.src !== 'string' || typeof x.suggest !== 'string' || typeof x.category !== 'string' || !x.evidence || typeof x.evidence !== 'object');
check('每条 state 合法', badState.length === 0, badState.length + ' 条非法');
check('每条 reasons[] 非空且为字符串', badReasons.length === 0, badReasons.length + ' 条异常');
check('每条 checked === false', badChecked.length === 0, badChecked.length + ' 条异常');
check('每条字段完整（src/suggest/category/evidence）', badFields.length === 0, badFields.length + ' 条异常');

// ---- 5) classify / buildReport 是纯函数，不写文件 ----
const dictPath = path.join(ROOT, 'src', 'cockpit-zh.json');
const docsDir = path.join(ROOT, 'docs');
const snapshot = p => fs.statSync(p).mtimeMs + ':' + fs.statSync(p).size;
const beforeDict = snapshot(dictPath);
const beforeDocs = fs.readdirSync(docsDir).sort().join('|');
const beforeSrc = fs.readdirSync(path.join(ROOT, 'src')).sort().join('|');
ar.buildReport(ctx);
classify(item('Build with Google'), ctx);
check('纯函数不写词典', snapshot(dictPath) === beforeDict);
check('纯函数不写 docs', fs.readdirSync(docsDir).sort().join('|') === beforeDocs);
check('纯函数不写 src', fs.readdirSync(path.join(ROOT, 'src')).sort().join('|') === beforeSrc);

// ---- 6) CLI --dry-run / 默认 不写任何文件 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-review-dryrun-'));
try {
    fs.writeFileSync(path.join(tmp, 'sentinel.txt'), 'keep');
    const listBefore = fs.readdirSync(tmp).sort().join('|');
    const dictBefore = snapshot(dictPath);
    const docsBefore = fs.readdirSync(docsDir).sort().join('|');
    const pkgBefore = snapshot(path.join(ROOT, 'package.json'));

    const out = execFileSync(process.execPath, [SCRIPT, '--dry-run'], {
        cwd: tmp, encoding: 'utf8', stdio: 'pipe'
    });
    check('--dry-run exit 0 且打印三态统计', /ACCEPT: \d+ \| REJECT: \d+ \| REVIEW: \d+/.test(out));
    check('--dry-run 不在临时目录写文件', fs.readdirSync(tmp).sort().join('|') === listBefore);
    check('--dry-run 不改词典 mtime/size', snapshot(dictPath) === dictBefore);
    check('--dry-run 不改 docs 目录', fs.readdirSync(docsDir).sort().join('|') === docsBefore);
    check('--dry-run 不改 package.json', snapshot(path.join(ROOT, 'package.json')) === pkgBefore);

    const outDefault = execFileSync(process.execPath, [SCRIPT], {
        cwd: tmp, encoding: 'utf8', stdio: 'pipe'
    });
    check('默认（无参数）等价 --dry-run', /dry-run/.test(outDefault) && /REVIEW: \d+/.test(outDefault));
    check('默认（无参数）同样零写入', fs.readdirSync(tmp).sort().join('|') === listBefore && snapshot(dictPath) === dictBefore);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 7) --out 写结构化 JSON，且仍不碰词典 ----
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-review-out-'));
try {
    const outPath = path.join(tmp2, 'report.json');
    const dictBefore = snapshot(dictPath);
    execFileSync(process.execPath, [SCRIPT, '--out', outPath], { cwd: tmp2, encoding: 'utf8', stdio: 'pipe' });
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    check('--out 生成可解析 JSON', fs.existsSync(outPath));
    check('--out JSON 计数自洽', written.counts.ACCEPT + written.counts.REJECT + written.counts.REVIEW === written.counts.total);
    check('--out JSON items 长度 = total', Array.isArray(written.items) && written.items.length === written.counts.total);
    check('--out 不改词典', snapshot(dictPath) === dictBefore);
} finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
}

// ---- 8) 静态基准文件与脚本同源 ----
const backlogJson = path.join(ROOT, 'docs', 'dev', 'i18n-backlog.json');
const backlogMd = path.join(ROOT, 'docs', 'dev', 'i18n-backlog.md');
if (fs.existsSync(backlogJson) && fs.existsSync(backlogMd)) {
    const bj = JSON.parse(fs.readFileSync(backlogJson, 'utf8'));
    const md = fs.readFileSync(backlogMd, 'utf8');
    check('docs/dev/i18n-backlog.json 651 条', bj.items && bj.items.length === 651, '实际=' + (bj.items && bj.items.length));
    check('docs/dev/i18n-backlog.json 计数自洽', bj.counts.ACCEPT + bj.counts.REJECT + bj.counts.REVIEW === bj.counts.total);
    check('docs/dev/i18n-backlog.md 含三态说明', /ACCEPT/.test(md) && /REJECT/.test(md) && /REVIEW/.test(md));
    check('docs/dev/i18n-backlog.md 含 add-terms 流程', /add-terms/.test(md) && /npm test/.test(md) && /npm run sync/.test(md));
    check('docs/dev/i18n-backlog.md 强调 ACCEPT 也要人工过一眼', /ACCEPT.*人工过一眼/.test(md));
    check('docs 与当前脚本三态数字一致', bj.counts.ACCEPT === c.ACCEPT && bj.counts.REJECT === c.REJECT && bj.counts.REVIEW === c.REVIEW,
        `docs=${bj.counts.ACCEPT}/${bj.counts.REJECT}/${bj.counts.REVIEW} script=${c.ACCEPT}/${c.REJECT}/${c.REVIEW}`);
} else {
    check('docs/dev/i18n-backlog.json 与 .md 已生成', false, '文件缺失');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
