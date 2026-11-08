// 发布说明的「体积/条目数不得写死」守卫。
//
// 背景：docs/guide/RELEASE_NOTES.md 本身就在发布 zip 内（zip 条目名 RELEASE_NOTES.md），
// 所以每次改这段文字都会改变 zip 的字节数与 SHA256。曾经在说明里写「3093.8 KB」，
// 结果改完文字后同一次发布里出现了三个不同的大小（说明里的 3093.8、PR 描述的 3098.6、
// 实际产物 3099.7），评审直接对不上账。
//
// 绝对体积对外只有一个权威来源：Release 页面上的资产信息（以及 npm run package 的输出），
// 说明文档不该复制一份必然漂移的数字。
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('PASS  ' + name); passed++; }
  catch (e) { console.error('FAIL  ' + name + ': ' + e.message); failed++; }
}

const NOTES = path.join(__dirname, '..', 'docs', 'guide', 'RELEASE_NOTES.md');

// 体积单位：缩写 + 完整拼写，十进制（SI）与二进制（IEC）两组都要覆盖。
// 带小数点的也一并拦（如 3.1 MB）。
//
// 为什么两组分开列：二进制全名不含对应缩写——
//   'mebibytes'.toLowerCase().includes('mib') === false
// 所以只写 MiB 会漏掉 mebibytes；反过来 kibibytes/gibibytes 曾被 KiB/GiB 的
// `i` 标志「碰巧」命中前缀，属于意外而非有意覆盖（tebibytes / pebibytes 就漏了）。
// 这里把两种写法都显式列出，不依赖前缀巧合。
const DEC_UNITS = 'bytes?|kilobytes?|megabytes?|gigabytes?|terabytes?|petabytes?|kB|KB|MB|GB|TB|PB';
const BIN_UNITS = 'kibibytes?|mebibytes?|gibibytes?|tebibytes?|pebibytes?|KiB|MiB|GiB|TiB|PiB';
const ZH_UNITS = '千字节|兆字节|吉字节|太字节';
// (?![a-zA-Z]) 收尾：单位不能是更长单词的前缀（避免把「megabytesPerSecond」这类
// 标识符里的片段当成体积），对中文单位无副作用。
const SIZE_RE = new RegExp(
  '\\d[\\d.,]*\\s*(?:(?:' + DEC_UNITS + '|' + BIN_UNITS + ')(?![a-zA-Z])|' + ZH_UNITS + ')',
  'i'
);
const BYTES_RE = /\d{1,3}(?:[,，]\d{3})+\s*B\b|\b\d{4,}\s*B\b/;

function violates(text) {
  const hits = [];
  const size = text.match(SIZE_RE);
  if (size) hits.push(size[0]);
  const bytes = text.match(BYTES_RE);
  if (bytes) hits.push(bytes[0]);
  return hits;
}

// 1. 真实发布说明：当前必须干净
check('发布说明不含写死的包体积（KB/MB/字节数）', () => {
  const src = fs.readFileSync(NOTES, 'utf8');
  const hits = violates(src);
  if (hits.length) {
    throw new Error(
      `发现写死的体积写法 ${JSON.stringify(hits)}。\n`
      + '  RELEASE_NOTES.md 在 zip 内，改它就会改变包大小；请在说明里改为定性描述，'
      + '把精确体积留给 Release 页面资产信息。'
    );
  }
});

// 2. 守卫本身有效：正例必须被拦下（防止正则写错导致永远通过）
const shouldFail = [
  '发布包 Antigravity-zh-patch-v1.4.3.zip（3093.8 KB，20 个条目）。',
  '体积约 3 MB 量级。',
  '已从 59 MB 降到 3 MB。',
  '产物 3174269 B。',
  '产物 3,174,269 B。',
  '大小 1.5GiB。',
  // 完整拼写单位：曾因只认 KB/MB/B 而整类漏判
  '产物 3174269 bytes。',
  '产物 3,174,269 bytes。',
  '产物 3174269 bytes（含安装器）。',
  '大小 3.1 megabytes。',
  '大小 1.5 gigabytes。',
  '大小 3,174,269 Byte。',
  '体积 3099.9 kilobytes。',
  // 二进制（IEC）完整拼写：MiB 不是 mebibytes 的子串，只认缩写会整组漏判
  '大小 3.1 mebibytes。',
  '大小 2.5 kibibytes。',
  '大小 1.5 gibibytes。',
  '大小 4 tebibytes。',
  '大小 5 pebibytes。',
  '产物 3.1 MiB。',
  '产物 2.5 KiB。',
  '产物 1.5 GiB。',
];
for (const text of shouldFail) {
  check('守卫能拦下: ' + text, () => {
    const hits = violates(text);
    if (!hits.length) throw new Error('未拦下，正则失效');
  });
}

// 3. 反面用例：正常的历史/技术描述不得误伤
const shouldPass = [
  '- `npm test` 全绿：页面翻译器 372、混排串回归 19。',
  '- 安装器 `--version` 输出 `antigravity-tool 1.4.3`。',
  '- `verify-release` 报告 **20/20 条目与当前源码逐字节一致**。',
  '词典 1320 -> 2043 条，规则 320 -> 336 条。',
  'M2 边缘用例 66，TreeWalker 对抗 128。',
  '- 发布包内含安装器、三份 `.bat`、词典与 native 替换表。',
];
for (const text of shouldPass) {
  check('不误伤: ' + text.slice(0, 28), () => {
    const hits = violates(text);
    if (hits.length) throw new Error(`误伤 ${JSON.stringify(hits)}`);
  });
}

console.log(`\n发布说明体积守卫: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
