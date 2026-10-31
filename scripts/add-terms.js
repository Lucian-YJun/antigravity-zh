#!/usr/bin/env node

/**
 * 人工提词条辅助：把截图里看到的英文原文批量转成词典条目。
 *
 * 用法：
 *   1. 从截图里把英文原文抄进一个 txt（每行一条，可带 "原文 => 译文"）
 *   2. node scripts/add-terms.js draft.txt --dry-run    先看会加哪些
 *   3. node scripts/add-terms.js draft.txt              真正写入并热同步
 *
 * 三种输入格式，可以混用：
 *   Search automations...              只给原文 → 自动生成占位译文待你补
 *   Search automations...= 搜索自动化... 等号后是译文（中英文等号都认）
 *   Search automations... => 搜索自动化...
 *
 * 设计取舍：
 * - 默认只补「词典里还没有的」原文，不覆盖你已有的译文；
 *   要覆盖加 --force。
 * - 写入前校验：空行/空译文/首尾空格/重复 key 全部拦下，
 *   因为 test-dict.js 对这些零容忍，脏数据会让整个套件红掉。
 * - 写完自动跑一次词典静态体检，再热同步到已安装副本。
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const dictArgIdx = args.indexOf('--dict');
// 允许指定目标词典：测试必须能在沙箱副本上跑，不能动真实词典
const dictPath = dictArgIdx >= 0 && args[dictArgIdx + 1]
    ? path.resolve(args[dictArgIdx + 1])
    : path.join(__dirname, '..', 'src', 'cockpit-zh.json');
const file = args.find((a, i) => !a.startsWith('--') && i !== dictArgIdx + 1);

if (!file) {
    console.error('用法: node scripts/add-terms.js <词条文件> [--dict <词典路径>] [--dry-run] [--force]');
    process.exit(1);
}

const rawText = fs.readFileSync(dictPath, 'utf8');
const data = JSON.parse(rawText);
const dict = data.dict || {};

// 解析：支持 "=" "=>" "：" 三种分隔符，取最靠前的一个
function parseLine(line) {
    if (!line.trim() || line.trim().startsWith('#')) return null;
    // 首尾空格在原始行上就拦下：词典对首尾空格零容忍，
    // 若先 trim 再切分，`  英文 = 译文` 会被"洗白"，脏 key 就混进词典了。
    if (line !== line.trim()) return { invalid: true };
    const seps = ['=>', '=', '：'];
    let idx = -1, sepLen = 0;
    for (const s of seps) {
        const i = line.indexOf(s);
        // 分隔符出现在第 0 位说明这一行没有原文（如 "= 只有译文"），视为非法
        if (i === 0) return { invalid: true };
        if (i > 0 && (idx < 0 || i < idx)) { idx = i; sepLen = s.length; }
    }
    if (idx < 0) return { src: line, dst: null };
    const src = line.slice(0, idx).trim();
    const dst = line.slice(idx + sepLen).trim();
    if (!src || !dst) return { invalid: true };
    return { src, dst };
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const added = [], skipped = [], invalid = [], redundant = [];

// 用引擎自己的归一化逻辑判断「这条是否已经被现有词条覆盖」。
// 引擎的查找顺序是精确匹配 → 归一化匹配，所以 Dashboard 已经在词典里时，
// 再录 dashboard / dashboard. / DASHBOARD 都是纯冗余——这正是过去 1607 条
// 膨胀到只剩 1033 条不同 key 的原因，光靠"精确重复"检查拦不住。
let normKey = null;
try {
    const NE = require(path.join(__dirname, '..', 'src', 'zh-i18n.js')).normEngine();
    normKey = NE.normKey;
} catch (e) {
    console.log('⚠️ 无法加载引擎归一化逻辑，本次跳过冗余检测：' + e.message);
}

// 归一化 key → 已存在的条目列表（只构建一次）
function buildNormIndex() {
    const idx = new Map();
    if (!normKey) return idx;
    for (const k of Object.keys(dict)) {
        const n = normKey(k);
        if (!idx.has(n)) idx.set(n, []);
        idx.get(n).push(k);
    }
    return idx;
}
const normIndex = buildNormIndex();

for (const line of lines) {
    const item = parseLine(line);
    if (!item) continue;
    if (item.invalid) { invalid.push(line); continue; }

    const exists = Object.prototype.hasOwnProperty.call(dict, item.src);
    if (exists && !isForce) { skipped.push(item.src); continue; }

    // 归一化后已被覆盖，且译文一致 → 加进去只是重复，默认不写
    if (normKey && !isForce) {
        const n = normKey(item.src);
        const hits = (normIndex.get(n) || []).filter(k => k !== item.src);
        if (hits.length) {
            // 只给原文时更危险：占位符会成为精确匹配，反过来遮蔽归一化命中的正确译文，
            // 所以只要归一化后已经有条目，就不该再写入。
            if (item.dst === null || hits.some(k => dict[k] === item.dst)) {
                redundant.push([item.src, hits[0]]);
                continue;
            }
        }
    }

    if (item.dst === null) {
        // 没给译文：写占位符，避免 JSON 出现空值，同时一眼能看出待补
        dict[item.src] = '⟪待翻译⟫';
        added.push([item.src, '⟪待翻译⟫']);
    } else {
        dict[item.src] = item.dst;
        added.push([item.src, item.dst]);
    }
    // 同一批文件里也去重：否则 Foo 和 FOO 会双双入库，
    // 上一轮 96 条新词里有 25 条就是这么产生的。
    if (normKey) {
        const n2 = normKey(item.src);
        if (!normIndex.has(n2)) normIndex.set(n2, []);
        normIndex.get(n2).push(item.src);
    }
}

console.log(`解析完成：新增/更新 ${added.length}，跳过 ${skipped.length}，冗余 ${redundant.length}，非法 ${invalid.length}`);
if (added.length) {
    console.log('\n将写入：');
    added.forEach(([s, d]) => console.log(`  ${JSON.stringify(s)}  →  ${JSON.stringify(d)}`));
}
if (redundant.length) {
    console.log('\n冗余、跳过（归一化后已被现有词条覆盖，加 --force 可强制写入）：');
    redundant.forEach(([s, hit]) => console.log(`  ${JSON.stringify(s)}  ≡  已有 ${JSON.stringify(hit)}`));
}
if (skipped.length) {
    console.log(`\n已存在、跳过（要覆盖加 --force）：`);
    skipped.slice(0, 10).forEach(s => console.log('  ' + JSON.stringify(s)));
    if (skipped.length > 10) console.log(`  ... 另有 ${skipped.length - 10} 条`);
}
if (invalid.length) {
    console.log(`\n非法行（空原文/空译文/首尾空格）：`);
    invalid.slice(0, 10).forEach(s => console.log('  ' + JSON.stringify(s)));
}
if (added.some(([, d]) => d === '⟪待翻译⟫')) {
    console.log('\n⚠️ 有词条只给了原文，已填占位符 ⟪待翻译⟫，你补上中文后重新运行即可。');
}

if (isDryRun) {
    console.log('\n[dry-run] 未写入任何文件。');
    process.exit(0);
}
if (!added.length) {
    console.log('\n没有可写入的条目。');
    process.exit(0);
}

fs.writeFileSync(dictPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`\n✅ 已写入 ${path.relative(process.cwd(), dictPath)}`);

// 写脏了会让 test-dict 整片红，先自检
const isDefaultDict = dictPath === path.join(__dirname, '..', 'src', 'cockpit-zh.json');
if (!isDefaultDict) {
    // 沙箱词典：test-dict.js 固定校验真实词典，这里就地做同等检查
    const problems = [];
    const written = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    for (const [k, v] of Object.entries(written.dict || {})) {
        if (k === '' || v === '') problems.push(`空 key 或空值: ${JSON.stringify(k)}`);
        if (k !== k.trim()) problems.push(`key 首尾空格: ${JSON.stringify(k)}`);
        if (typeof v === 'string' && v !== v.trim()) problems.push(`值首尾空格: ${JSON.stringify(k)}`);
    }
    if (problems.length) {
        console.error('❌ 词典体检失败：\n' + problems.slice(0, 10).join('\n'));
        process.exit(1);
    }
    console.log('✅ 词典静态体检通过（沙箱）');
} else {
    const { execFileSync } = require('child_process');
    try {
        execFileSync(process.execPath, [path.join(__dirname, '..', 'tests', 'test-dict.js')], { stdio: 'pipe' });
        console.log('✅ 词典静态体检通过');
    } catch (e) {
        console.error('❌ 词典体检失败，请检查上面的写入内容：');
        console.error(String(e.stdout || e.message).split('\n').filter(l => l.includes('FAIL')).join('\n'));
        process.exit(1);
    }
}

console.log('下一步：npm run sync（推送到已安装客户端，1~2 秒生效）');
