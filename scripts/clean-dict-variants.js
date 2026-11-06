// 清理「归一化后同键、且译文完全相同」的冗余变体，每组保留一条。
// 译文本就不同的组（如 句号版 / 省略号版）必须整组保留，否则语义会被抹平。
//
// 默认是 dry-run：这是一个会直接覆写 src/cockpit-zh.json 的破坏性操作，
// 旧版没有任何预览、确认或备份，而 AGENTS.md 开篇就说词典是最容易出错的地方。
// 真正写入需要显式加 --write。
const fs = require('fs');
const path = require('path');
const { findRedundantVariants, readDictionary, writeDictionary } = require('./lib/dict-manager');

const args = process.argv.slice(2);
const isWrite = args.includes('--write');

const dictPath = path.join(__dirname, '..', 'src', 'cockpit-zh.json');
const NE = require(path.join(__dirname, '..', 'src', 'zh-i18n.js')).normEngine();
const data = readDictionary(dictPath);
const dict = data.dict;

// findRedundantVariants 会就地 delete，所以先在副本上算，dry-run 才能真的不改动任何东西
const before = Object.keys(dict).length;
const { removed } = findRedundantVariants(dict, NE.normKey);

console.log(`${isWrite ? '将删除' : '[dry-run] 可删除'} ${removed.length} 条冗余，`
  + `${before} → ${Object.keys(dict).length} 条`);
console.log('\n样例（删 → 保留）：');
removed.slice(0, 15).forEach(([k, keep]) => console.log(`  ${JSON.stringify(k)}  →  ${JSON.stringify(keep)}`));
if (removed.length > 15) console.log(`  ... 另有 ${removed.length - 15} 条`);

if (!isWrite) {
  console.log('\n[dry-run] 未写入任何文件。确认无误后加 --write 执行。');
  process.exit(0);
}

if (removed.length === 0) {
  console.log('\n没有可清理的冗余，词典未改动。');
  process.exit(0);
}

// 写前留一份备份：清理是不可逆的，出错时至少能退回去
const backupPath = `${dictPath}.bak`;
fs.copyFileSync(dictPath, backupPath);
writeDictionary(dictPath, data);
console.log(`\n✅ 已写入 ${dictPath}`);
console.log(`   原文件已备份为 ${path.basename(backupPath)}（确认无误后可删除）`);
console.log('   下一步：npm run test:dict && npm run sync');
