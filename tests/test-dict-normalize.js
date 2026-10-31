// 词典压缩回归安全网
// 1. 冻结基线：改动前 1607 条 dict 词条的「英文原文 → 中文译文」全量快照，
//    数据存放于 fixtures/dict-baseline-v1.2.1.json。
//    压缩后逐条走真实 tr()，译文必须与快照逐字一致，一条都不能变。
// 2. 归一化索引自检：现词典里不许存在「归一后同一键、译文却不同」的条目。
// 3. 快路径自检：needsNorm 为假的串必须已是规范形态，否则 tr() 会跳过归一化而漏译。
// 4. 菜单侧：MENU_LABELS 同样接受大小写/尾部标点变体，且译文与冻结快照一致。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function check(name, cond, errMsg = '') {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (errMsg ? ` (${errMsg})` : '')); }
}

// ---- 冻结基线：压缩前快照单独存放于 fixtures，这里只负责读取与还原 ----
// 条目数写死：从快照里删条目等于缩小校验面，必须让断言失败而不是静默变少。
const BASELINE_EXPECTED_SIZE = 1607;
const BASELINE_FILE = path.join(__dirname, 'fixtures/dict-baseline-v1.2.1.json');
const BASELINE_DATA = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
const BASELINE = new Map(Object.entries(BASELINE_DATA.entries || {}));

const SRC = path.join(__dirname, '../src');
const dictFile = JSON.parse(fs.readFileSync(path.join(SRC, 'cockpit-zh.json'), 'utf-8'));
const dictKeys = Object.keys(dictFile.dict || {});

// ---- 归一化实现（与 zh-i18n.js 的 normEngine 同一规格，用于独立复算） ----
const TRAIL_PUNCT = { 46: 1, 12290: 1, 8230: 1, 58: 1, 65306: 1, 63: 1, 65311: 1, 33: 1, 65281: 1 };
function isSpace(c) { return c <= 32 || c === 160 || c === 0xFEFF || (c >= 0x2000 && c <= 0x200B) || c === 0x3000; }
function needsNorm(s) {
  const len = s.length;
  if (len === 0) return false;
  if (TRAIL_PUNCT[s.charCodeAt(len - 1)]) return true;
  let prevSpace = false;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) return true;
    if (isSpace(c)) {
      if (prevSpace || c !== 32) return true;
      prevSpace = true;
    } else prevSpace = false;
  }
  return false;
}
function normKey(s) {
  const len = s.length;
  let end = len, dots = 0, ell = false, colon = false, ques = false, excl = false;
  while (end > 0) {
    const c = s.charCodeAt(end - 1);
    if (!TRAIL_PUNCT[c]) break;
    if (c === 46 || c === 12290) dots++;
    else if (c === 8230) ell = true;
    else if (c === 58 || c === 65306) colon = true;
    else if (c === 63 || c === 65311) ques = true;
    else excl = true;
    end--;
  }
  const kinds = (dots ? 1 : 0) + (ell ? 1 : 0) + (colon ? 1 : 0) + (ques ? 1 : 0) + (excl ? 1 : 0);
  let sig = '';
  if (kinds === 1) {
    if (ell || dots > 1) sig = '\u0001e';
    else if (dots === 1) sig = '\u0001d';
    else if (colon) sig = '\u0001c';
    else if (ques) sig = '\u0001q';
    else sig = '\u0001x';
  } else if (kinds > 1) sig = '\u0001' + s.slice(end);
  let out = '', prevSpace = false;
  for (let j = 0; j < end; j++) {
    let ch = s.charCodeAt(j);
    if (isSpace(ch)) { if (!prevSpace) out += ' '; prevSpace = true; }
    else { prevSpace = false; if (ch >= 65 && ch <= 90) ch += 32; out += String.fromCharCode(ch); }
  }
  if (prevSpace) out = out.slice(0, out.length - 1);
  return out + sig;
}

// ---- 启动真实注入环境，拿到页面侧的 tr() ----
const SIM = path.join(__dirname, 'zh-patch-sim-norm');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));
const zh = require(path.join(SIM, 'zh-i18n.js'));

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
  runScripts: 'dangerously',
  url: 'http://localhost/',
});
const w = dom.window, d = w.document;
const calls = [];
const capWin = {
  _h: {},
  isDestroyed: () => false,
  webContents: {
    on: (ev, fn) => { capWin._h[ev] = fn; },
    executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
  },
};
zh.attachWebTranslator(capWin);
capWin._h['did-finish-load']();

// 埋点：把内部 tr 暴露出来做纯函数级校验
const scriptEl = d.createElement('script');
scriptEl.textContent = calls[0].replace('window.__antigravityZh={', 'window.__test_tr=tr;window.__antigravityZh={');
d.body.appendChild(scriptEl);
const tr = w.__test_tr;

check('注入脚本暴露 tr() 供校验', typeof tr === 'function');
if (typeof tr !== 'function') {
  console.log(`\n词典压缩回归: ${pass} 通过, ${fail} 失败`);
  process.exit(1);
}

// ---- 1. 逐条比对冻结基线 ----
const mismatches = [];
const unchanged = [];
for (const [en, want] of BASELINE) {
  const got = tr(en);
  // tr() 返回 null 表示未命中，此时页面保留英文原文
  const effective = got === null ? en : got;
  if (effective !== want) {
    if (mismatches.length < 12) mismatches.push(`${JSON.stringify(en)}: 期望 ${JSON.stringify(want)} / 实际 ${JSON.stringify(effective)}`);
    else mismatches.push('');
  }
  if (got === null) unchanged.push(en);
}
check(`冻结基线 ${BASELINE.size} 条词条译文逐条不变`,
  mismatches.length === 0 && BASELINE.size === BASELINE_EXPECTED_SIZE,
  BASELINE.size !== BASELINE_EXPECTED_SIZE
    ? `基线条目数为 ${BASELINE.size}，应为 ${BASELINE_EXPECTED_SIZE}（快照被删改）`
    : `${mismatches.filter(Boolean).length} 条不一致，例如: ${mismatches.filter(Boolean).slice(0, 5).join(' | ')}`);

// 原来就命中的词条，压缩后仍必须命中（不允许从「已翻译」退回「英文透传」）
check('基线词条无一因压缩退化为英文透传', unchanged.length === 0,
  `${unchanged.length} 条退化为未命中: ${unchanged.slice(0, 5).map(x => JSON.stringify(x)).join(', ')}`);

// ---- 2. 现词典内部不存在「压缩时新造出来的」归一化歧义 ----
// 原词典里就存在译文分歧的组必须整组保留（规格要求），所以正确的不变量是：
// 现存每个歧义组里的每一条，都必须在冻结基线里本来就存在、且译文与基线完全一致。
const groups = new Map();
for (const k of dictKeys) {
  const nk = normKey(k);
  if (!groups.has(nk)) groups.set(nk, []);
  groups.get(nk).push(k);
}
const conflicts = [];
for (const [nk, ks] of groups) {
  const vals = new Set(ks.map(k => dictFile.dict[k]));
  if (vals.size <= 1) continue;
  const drifted = ks.filter(k => BASELINE.get(k) !== dictFile.dict[k]);
  if (drifted.length || ks.length < 2) {
    conflicts.push(`${JSON.stringify(nk)} → ${ks.map(k => JSON.stringify(k)).join(' / ')}`);
  }
}
check('现存归一化歧义组均为基线原有分歧，无压缩新造的歧义', conflicts.length === 0,
  `异常组: ${conflicts.slice(0, 3).join(' | ')}`);

// 每个歧义组必须整组保留（不能只挑一个）
const ambiguousGroupsInBaseline = new Map();
for (const k of BASELINE.keys()) {
  const nk = normKey(k);
  if (!ambiguousGroupsInBaseline.has(nk)) ambiguousGroupsInBaseline.set(nk, []);
  ambiguousGroupsInBaseline.get(nk).push(k);
}
const droppedFromAmbiguous = [];
for (const [, ks] of ambiguousGroupsInBaseline) {
  const vals = new Set(ks.map(k => BASELINE.get(k)));
  if (vals.size <= 1) continue;
  for (const k of ks) if (!Object.prototype.hasOwnProperty.call(dictFile.dict, k)) droppedFromAmbiguous.push(k);
}
check('基线歧义组被整组保留（未做任选合并）', droppedFromAmbiguous.length === 0,
  `被误删的歧义条目: ${droppedFromAmbiguous.slice(0, 5).map(k => JSON.stringify(k)).join(', ')}`);

// ---- 3. 快路径口径自检：needsNorm 为假时必须已是规范形态 ----
const fastPathGaps = dictKeys.filter(k => !needsNorm(k) && normKey(k) !== k);
check('快路径判定与归一化口径一致（无「该归一化却跳过」的键）', fastPathGaps.length === 0,
  `需归一化却被判为快路径: ${fastPathGaps.slice(0, 5).map(k => JSON.stringify(k)).join(', ')}`);

// ---- 4. 归一化查找确实生效：被删变体仍能译出 ----
const variantProbes = [
  ['Delete Conversation', '删除对话'],
  ['delete conversation', '删除对话'],
  ['DELETE CONVERSATION', '删除对话'],
  ['Delete Conversation...', '删除对话...'],
  ['Delete Conversation…', '删除对话...'],
  ['delete conversation?', '删除对话？'],
  ['DELETE CONVERSATION:', '删除对话：'],
  ['files changed', '个文件已更改'],
  ['Files changed', '已更改文件'],
];
const variantFailures = [];
for (const [en, want] of variantProbes) {
  const got = tr(en);
  const effective = got === null ? en : got;
  if (effective !== want) variantFailures.push(`${JSON.stringify(en)}: 期望 ${JSON.stringify(want)} / 实际 ${JSON.stringify(effective)}`);
}
check('大小写与尾部标点变体经归一化兜底仍正确翻译', variantFailures.length === 0, variantFailures.join(' | '));

// 歧义组必须逐条保持原译文，不能「挑一个算数」
const ambiguousProbes = [
  ['Files Changed', '已更改的文件'],
  ['Files changed', '已更改文件'],
  ['files changed', '个文件已更改'],
  ['Allow Once', '仅允许一次'],
  ['Allow once', '允许一次'],
  ['It requires', '需要'],
  ['it requires', '需要安装'],
];
const ambiguousFailures = [];
for (const [en, want] of ambiguousProbes) {
  const got = tr(en);
  const effective = got === null ? en : got;
  if (effective !== want) ambiguousFailures.push(`${JSON.stringify(en)}: 期望 ${JSON.stringify(want)} / 实际 ${JSON.stringify(effective)}`);
}
check('歧义组逐条保留各自译文（不做任选合并）', ambiguousFailures.length === 0, ambiguousFailures.join(' | '));

// ---- 5. 主进程菜单：归一化回退 ----
const menuProbes = [
  'File', 'Delete Conversation', 'delete conversation', 'DELETE CONVERSATION',
  'Delete Conversation.', 'Delete Conversation;', 'Previous Worktrees',
  'previous worktrees:', 'LOCAL CHECKOUTS…', 'Search customizations',
  'when working in these conversations.', 'Show in File Explorer',
];
const menuBaseline = {
  'File': '文件',
  'Delete Conversation': '删除对话',
  'delete conversation': '删除对话',
  'DELETE CONVERSATION': '删除对话',
  'Delete Conversation.': '删除对话。',
  'Previous Worktrees': '先前的工作树',
  'previous worktrees:': '先前的工作树：',
  'LOCAL CHECKOUTS…': '本地检出...',
  'Search customizations': '搜索自定义项',
  'when working in these conversations.': '在这些对话中工作时。',
  'Show in File Explorer': '在文件资源管理器中显示',
};
const fakeMenu = { items: menuProbes.map(label => ({ label })) };
zh.translateMenu(fakeMenu);
const menuFailures = [];
for (const item of fakeMenu.items) {
  const want = menuBaseline[item.label];
  if (want !== undefined && item.label !== want) menuFailures.push(`${JSON.stringify(item.label)} 未译`);
}
check('MENU_LABELS 归一化回退覆盖大小写与尾部标点变体', menuFailures.length === 0, menuFailures.join(' | '));

// 未收录的标签必须原样保留，不能被归一化误伤
const untouched = { items: [{ label: 'Custom XYZ' }, { label: 'Some Random Label' }] };
zh.translateMenu(untouched);
check('菜单未收录标签原样保留', untouched.items[0].label === 'Custom XYZ' && untouched.items[1].label === 'Some Random Label');

// ---- 6. 热载：归一化索引必须随词典重建，且歧义组不得被「挑一个」 ----
w.__antigravityZh.setData({ dict: { 'Zeta Thing': '泽塔' }, rules: [] });
check('热载后归一化索引随词典重建（大写变体命中）', tr('ZETA THING') === '泽塔', `实际 ${JSON.stringify(tr('ZETA THING'))}`);
check('热载后旧词条正常失效', tr('DELETE CONVERSATION.') === null, `实际 ${JSON.stringify(tr('DELETE CONVERSATION.'))}`);

// 规范形态与变体译文不同时属于歧义组：整组作废，绝不能任选一条
w.__antigravityZh.setData({ dict: { 'Alpha': '甲', 'alpha': '乙' }, rules: [] });
check('热载后归一化歧义组整组作废（大写变体不猜译文）', tr('ALPHA') === null, `实际 ${JSON.stringify(tr('ALPHA'))}`);
check('热载后歧义组各自精确形态仍按原样翻译', tr('Alpha') === '甲' && tr('alpha') === '乙');

// 同一归一键译文相同时不算歧义，变体应能命中
w.__antigravityZh.setData({ dict: { 'Alpha': '甲', 'ALPHA.': '甲' }, rules: [] });
check('热载后同译文变体正常经归一化命中', tr('ALPHA.') === '甲', `实际 ${JSON.stringify(tr('ALPHA.'))}`);

// ---- 7. 压缩成效守卫 ----
check('词典词条已压缩到 1300 条以内（原 1607 条）', dictKeys.length < 1300, `当前 ${dictKeys.length} 条`);
check('MENU_LABELS 已压缩到 200 条以内（原 316 条）',
  Object.keys(zh.MENU_LABELS).length < 200, `当前 ${Object.keys(zh.MENU_LABELS).length} 条`);

if (w.__agTimerInterval) clearInterval(w.__agTimerInterval);
w.close();
console.log(`\n词典压缩回归: ${pass} 通过, ${fail} 失败`);
fs.rmSync(SIM, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
