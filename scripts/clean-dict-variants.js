// 一次性清理：删除「归一化后同键、且译文完全相同」的冗余变体，每组保留一条。
// 译文本就不同的组（如 句号版 / 省略号版）必须整组保留，否则语义会被抹平。
const fs = require('fs');
const path = require('path');

const dictPath = path.join(__dirname, '..', 'src', 'cockpit-zh.json');
const NE = require(path.join(__dirname, '..', 'src', 'zh-i18n.js')).normEngine();
const data = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const dict = data.dict;

const groups = new Map();
for (const k of Object.keys(dict)) {
    const n = NE.normKey(k);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(k);
}

const removed = [];
for (const [n, keys] of groups) {
    if (keys.length < 2) continue;
    const values = new Set(keys.map(k => dict[k]));
    // 同组存在多种译文 → 属于有意义的变体，整组保留
    if (values.size !== 1) continue;
    // 优先保留规范形态（归一化是恒等变换），没有则留第一条
    const keep = keys.find(k => NE.normKey(k) === k) || keys[0];
    for (const k of keys) {
        if (k === keep) continue;
        delete dict[k];
        removed.push([k, keep]);
    }
}

fs.writeFileSync(dictPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`删除 ${removed.length} 条冗余，剩余 ${Object.keys(dict).length} 条`);
console.log('\n样例（删 → 保留）：');
removed.slice(0, 15).forEach(([k, keep]) => console.log(`  ${JSON.stringify(k)}  →  ${JSON.stringify(keep)}`));
