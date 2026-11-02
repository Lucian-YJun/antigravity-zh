#!/usr/bin/env node

/**
 * 人工提词条辅助：把截图里看到的英文原文批量转成词典条目。
 * 委托至 scripts/lib/dict-manager.js 执行词条解析、校验与冗余检测。
 */

const fs = require('fs');
const path = require('path');
const {
    parseTermLine,
    buildNormalizationIndex,
    checkRedundancy,
    validateDictionary,
    readDictionary,
    writeDictionary,
} = require('./lib/dict-manager');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const dictArgIdx = args.indexOf('--dict');
// 允许指定目标词典：测试必须能在沙箱副本上跑，不能动真实词典
const dictPath = dictArgIdx >= 0 && args[dictArgIdx + 1]
    ? path.resolve(args[dictArgIdx + 1])
    : path.join(__dirname, '..', 'src', 'cockpit-zh.json');
const file = args.find((a, i) => !a.startsWith('--') && (dictArgIdx < 0 || i !== dictArgIdx + 1));

if (!file) {
    console.error('用法: node scripts/add-terms.js <词条文件> [--dict <词典路径>] [--dry-run] [--force]');
    process.exit(1);
}

const data = readDictionary(dictPath);
const dict = data.dict || {};

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const added = [], skipped = [], invalid = [], redundant = [];

let normKey = null;
try {
    const NE = require(path.join(__dirname, '..', 'src', 'zh-i18n.js')).normEngine();
    normKey = NE.normKey;
} catch (e) {
    console.log('⚠️ 无法加载引擎归一化逻辑，本次跳过冗余检测：' + e.message);
}

const normIndex = buildNormalizationIndex(dict, normKey);

for (const line of lines) {
    const item = parseTermLine(line);
    if (!item) continue;
    if (item.invalid) { invalid.push(line); continue; }

    const exists = Object.prototype.hasOwnProperty.call(dict, item.src);
    if (exists && !isForce) { skipped.push(item.src); continue; }

    // 归一化后已被覆盖，且译文一致 → 加进去只是重复，默认不写
    if (normKey && !isForce) {
        const red = checkRedundancy(item.src, item.dst, dict, normIndex, normKey);
        if (red.isRedundant) {
            redundant.push([item.src, red.existingKey]);
            continue;
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
    // 同一批文件里也去重
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

writeDictionary(dictPath, data);
console.log(`\n✅ 已写入 ${path.relative(process.cwd(), dictPath)}`);

// 写脏了会让 test-dict 整片红，先自检
const isDefaultDict = dictPath === path.join(__dirname, '..', 'src', 'cockpit-zh.json');
if (!isDefaultDict) {
    // 沙箱词典：test-dict.js 固定校验真实词典，这里就地做同等检查
    const written = readDictionary(dictPath);
    const problems = validateDictionary(written.dict || {});
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
