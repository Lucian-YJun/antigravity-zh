// 一次性清理：删除「归一化后同键、且译文完全相同」的冗余变体，每组保留一条。
// 译文本就不同的组（如 句号版 / 省略号版）必须整组保留，否则语义会被抹平。
const path = require('path');
const { findRedundantVariants, readDictionary, writeDictionary } = require('./lib/dict-manager');

const dictPath = path.join(__dirname, '..', 'src', 'cockpit-zh.json');
const NE = require(path.join(__dirname, '..', 'src', 'zh-i18n.js')).normEngine();
const data = readDictionary(dictPath);
const dict = data.dict;

const { removed } = findRedundantVariants(dict, NE.normKey);

writeDictionary(dictPath, data);
console.log(`删除 ${removed.length} 条冗余，剩余 ${Object.keys(dict).length} 条`);
console.log('\n样例（删 → 保留）：');
removed.slice(0, 15).forEach(([k, keep]) => console.log(`  ${JSON.stringify(k)}  →  ${JSON.stringify(keep)}`));
