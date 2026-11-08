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

// ---- 6b. 归一化歧义组的规则兜底 ----
// search automations / search customizations / build with google plugins 在词典里
// 各有 2~8 条写法（大小写 + ... / …），归一化后同键但译文不完全相同，compileNorm
// 会整组作废 —— 于是「词典没逐字收录」的写法会静默回落英文。
// 这四条新增规则按模式兜住这类变体，不依赖词典精确条目，也不必改动冻结基线。
w.__antigravityZh.setData({ dict: dictFile.dict, rules: dictFile.rules });
const ruleFallbackCases = [
  // 带省略号的变体：该归一化组因「...」与「…」两种译文而整组作废，
  // 词典未逐字收录的写法会回落英文，由新增规则兜住。
  ['Search Automations...', '搜索自动化...'],
  ['search automations…', '搜索自动化…'],
  ['SEARCH AUTOMATIONS...', '搜索自动化...'],
  ['SEARCH AUTOMATIONS…', '搜索自动化…'],
  ['Search Customizations.', '搜索自定义项。'],
  ['search customizations…', '搜索自定义项…'],
  ['SEARCH CUSTOMIZATIONS…', '搜索自定义项…'],
  // 无标点的那条在词典里是唯一值，归一化即可覆盖任意大小写，不需要规则
  ['SEARCH AUTOMATIONS', '搜索自动化'],
  ['Search automations', '搜索自动化'],
  // 词典精确条目优先于规则，因此这里得到的是词典里的值
  ['Build With Google Plugins', 'Build with Google 插件'],
  ['build with google plugins', 'Build with Google 插件'],
  ['Build with google plugins', 'Build with Google 插件'],
  // 带数字的后缀形态：旧版只能靠精确条目，未收录的数量会回落英文
  ['12 files changed', '12 个文件已更改'],
  ['1 File Changed', '1 个文件已更改'],
  ['3 files changed', '3 个文件已更改'],
  // 其余三组的裸形态（大小写变体 + 尾随标点）。
  // A4 起规则 299/300/301 改为「不捕获、不回拼英文标点」，中文译文里不再残留
  // 英文 . ! ?；这里只改规则产物，未改任何 dict 译文，冻结基线的 1607 条逐条比对不受影响。
  ['FILES CHANGED', '已更改的文件'],
  ['FILES CHANGED.', '已更改的文件'],
  ['ALLOW ONCE', '仅允许一次'],
  ['ALLOW ONCE!', '仅允许一次'],
  ['IT REQUIRES', '需要'],
  ['IT REQUIRES?', '需要'],

  // ---- A2：2.29 新增动态形态（全部追加在 rules 数组末尾，首字符可静态判定）----
  // 相对时间改为「数字 + 单位 + ago」后缀，旧 ^(\d+)(m|h|d|w|s|mo)$ 集体失配。
  // mo 规则声明在 m 规则之前；实测 4mo ago 不会被 ^(\d+)m\s+ago$ 抢先。
  ['58m ago', '58 分钟前'],
  ['3h ago', '3 小时前'],
  ['2d ago', '2 天前'],
  ['1w ago', '1 周前'],
  ['30s ago', '30 秒前'],
  ['4mo ago', '4 个月前'],
  // Load older messages 按钮与 aria-label（含两个任意数字）
  ['Load older messages', '加载更早的消息'],
  ['Load older messages, showing 252 of 579', '加载更早的消息，已显示 252 / 579'],
  ['Load older messages, showing 77 of 143', '加载更早的消息，已显示 77 / 143'],
  ['5 more older messages', '还有 5 条更早的消息'],
  // 模板变量拼接的 N of M / Step / Showing / Turn / Retry / WSL / 更新
  ['Retry in 30s', '将在 30 秒后重试'],
  ['Retrying in 5s', '将在 5 秒后重试'],
  ['3 of 12', '第 3 项，共 12 项'],
  ['Step 2 of 7', '第 2 步，共 7 步'],
  ['Showing 20 of 100', '显示 20 / 100'],
  ['Turn 4', '第 4 轮'],
  ['Connecting to WSL…', '正在连接到 WSL…'],
  ['Downloading update...', '正在下载更新...'],
  // 项目删除确认：xBb() 先拼「N active conversations」/「M archived conversations」，
  // 再 c.join(" and ")，句号由调用方补 —— 前后都是变量，词典无法逐字收录，只能靠规则。
  // 源码里 a===1 时用单数，故单复数四种组合都要能命中。
  ['1 active conversation and 8 archived conversations.', '1 个活动对话，8 个归档对话。'],
  ['1 active conversations and 8 archived conversations.', '1 个活动对话，8 个归档对话。'],
  ['3 active conversations and 1 archived conversation.', '3 个活动对话，1 个归档对话。'],
  ['12 active conversations and 4 archived conversations', '12 个活动对话，4 个归档对话。'],
  // 仅归档计数单独出现（active=0, archived>0）
  ['3 archived conversations.', '3 个归档对话。'],
  ['1 archived conversation.', '1 个归档对话。'],
  // 问答计数：模板拼接 "N question(s)"，N 无法枚举，只能靠规则兜底
  ['1 question', '1 个问题'],
  ['3 questions', '3 个问题'],
  ['12 questions', '12 个问题'],
  // 既有形态回归：新规则不得抢走旧规则/归一化命中
  ['9d', '9 天前'],
  ['Turn 3 of 7', '第 3 轮，共 7 轮'],
  ['No more older messages, showing 20 of 100', '没有更早的消息，已显示全部 20 条'],
  // ^Update available$ 不加规则：词典已有 "Update Available"，归一化覆盖
  ['Update available', '有可用更新'],

  // ---- A3：修正 rules 171/172 的 [vV]e?iw 拼写错误（原地改，索引不变）----
  ['Toggle Full View', '切换完整视图'],
  ['Toggle Full View.', '切换完整视图'],
  ['Full View', '完整视图'],
  ['Full View.', '完整视图'],

  // ---- A4：Allow once? 曾被规则 44 ^Allow (.+?)\?$ 抢先产出「允许 once 吗？」----
  // 规则 44 改为 ^Allow (?!once\?$)(.+?)\?$，把这一形态让给 300 号规则。
  ['Allow once?', '仅允许一次'],
  ['Allow something?', '允许 something 吗？'],
  ['Allow once more?', '允许 once more 吗？'],
  ['Files changed.', '已更改的文件'],
  ['It requires.', '需要'],
  ['ALLOW ONCE!', '仅允许一次'],
  ['IT REQUIRES?', '需要'],

  // ---- A1：活体扫描固定 UI 文案（词条抽样，确保没有被规则误伤）----
  ['Overview tab', '概览标签页'],
  ['Review tab', '审查标签页'],
  ['Side Panel', '侧边面板'],
  ['Toggle Side Panel', '切换侧边面板'],
  ['Skills Used', '已使用技能'],
  ['Cancel (Ctrl+D)', '取消 (Ctrl+D)'],
  ['Ran', '已运行'],
  ['Found', '已找到'],
  ['Messaged', '已发消息'],
  ['Ran command, edited file', '已运行命令，已编辑文件'],
  ['Explored file', '已探索文件'],
  ['Ran commands, edited file', '已运行命令，已编辑文件'],
  ['Edited file', '已编辑文件'],
  ['Switch in context details', '在上下文详情中切换'],
  ['English', '英语'],
  // Token 保留英文（用户 2026-11-08 决定：与 token/Token 复合词写法一致，不译作「令牌」）
  ['Token', 'Token'],
  ['Year', '年份'],
  ['Previous', '上一个'],

  // ---- R3：Codex P2（规则 44 负向断言大小写敏感，真 bug）----
  // 旧规则 ^Allow (?!once\\?$)(.+?)\\?$ 只挡住全小写 once，Title-case 的
  // "Allow Once?" 会漏进通用分支，产出「允许 Once 吗？」（残留英文 Once）。
  // 规则 44 原地改为 ^Allow (?![oO][nN][cC][eE]\\?$)(.+?)\\?$：负向断言里
  // 逐字符放开大小写，让 once/Once/ONCE 三种写法都交给 dict 归一化的「仅允许一次」。
  // 不给整条规则加 i 标志 —— 那会把 Allow 前缀也放宽，可能抢走别的输入。
  // 下面 4 个大小写形态全部期望「仅允许一次」；通用分支仍须保持「允许 something 吗？」。
  // （Allow once? / Allow something? 在 A4 段已有同名断言，这里为让 P2 组自洽再列一次。）
  ['Allow once?', '仅允许一次'],
  ['Allow Once?', '仅允许一次'],
  ['ALLOW ONCE?', '仅允许一次'],
  ['allow ONCE?', '仅允许一次'],
  ['Allow something?', '允许 something 吗？'],
];
for (const [input, want] of ruleFallbackCases) {
  const got = tr(input);
  check(`规则兜底 ${JSON.stringify(input)}`, got === want, `期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
}
// 此前的已知不一致已修复（2026-11-08）：
// 原文两种写法「Build With Google Plugins」与「Build with Google Plugins」
// 曾译成 With/with 大小写不同的两条译文，使归一化歧义组整组作废。
// 现已统一译文并删除冗余的那条（大小写差异由归一化查找覆盖），
// 词典里只保留「Build with Google Plugins」一条。
check(
  'Build With/with 冗余变体已合并（归一化查找覆盖大小写差异）',
  dictFile.dict['Build With Google Plugins'] === undefined
    && dictFile.dict['Build with Google Plugins'] === 'Build with Google 插件',
  `词典应为：Build With 变体已移除、Build with 保留且译文正确；实际 ` +
    `Build With=${JSON.stringify(dictFile.dict['Build With Google Plugins'])} / ` +
    `Build with=${JSON.stringify(dictFile.dict['Build with Google Plugins'])}`
);
// 两种大小写写法经 tr() 都必须译出同一结果（验证归一化真的覆盖了）
check('大小写两种写法的 tr() 结果一致',
  tr('Build With Google Plugins') === tr('Build with Google Plugins'),
  `With=${JSON.stringify(tr('Build With Google Plugins'))} / with=${JSON.stringify(tr('Build with Google Plugins'))}`);

// ---- 6c. 契约：MENU_LABELS 与网页词典 dict 不得再次不同步 ----
// 原生菜单层由 zh-i18n.js 的 MENU_LABELS 独立负责，但同样的文字出现在网页 DOM 里
// 走的是 cockpit-zh.json 的 dict/rules。第三轮实测 MENU_LABELS 共 156 条，其中
// 27 条在 dict 里 exact + normKey 都查不到（菜单能译、网页漏译）。这 27 条已通过
// npm run add-terms 补进 dict；下面把「每条 MENU_LABELS key 都能被 dict 的 exact
// 或归一化查表覆盖」固化成契约：以后官方往 MENU_LABELS 加文案时这里会直接报错，
// 提醒同步走 add-terms，避免再次静默漂移。
// 口径与 tr() 一致：精确匹配 → 归一化匹配（NE.compileNorm 与注入脚本的 NORM 同源）。
// 必须是「exact 或 normKey」两条路：Search automations... 这类键处在归一化歧义组里
// （compileNorm 会整组作废），靠精确条目覆盖，只查 compileNorm 会误报。
// 只认 dict 覆盖，不把「恰好被某条 rules 兜住」算作覆盖 —— 规则是兜底，不是词典。
const NE = zh.normEngine();
const NORM_FOR_CONTRACT = NE.compileNorm(dictFile.dict, true);
const menuKeys = Object.keys(zh.MENU_LABELS);
const menuExact = [], menuViaNorm = [], menuUncovered = [];
for (const k of menuKeys) {
  if (Object.prototype.hasOwnProperty.call(dictFile.dict, k)) { menuExact.push(k); continue; }
  if (NORM_FOR_CONTRACT[NE.normKey(k)] !== undefined) { menuViaNorm.push(k); continue; }
  // 逐条留全：key / 归一键 / 真实 tr() 结果 / 菜单译文，便于直接判断该补词条还是改口径
  menuUncovered.push({
    key: k, normKey: NE.normKey(k), tr: tr(k), menuZh: zh.MENU_LABELS[k],
  });
}
check('MENU_LABELS 规模非空（防止契约断言被清空后空转）', menuKeys.length > 100,
  `当前 ${menuKeys.length} 条`);
check(`MENU_LABELS 全部 ${menuKeys.length} 条 key 均被 dict 的 exact/normKey 覆盖（契约）`,
  menuUncovered.length === 0,
  menuUncovered.length
    ? `${menuUncovered.length} 条未覆盖，逐条: ${menuUncovered.map(u =>
        `${JSON.stringify(u.key)} (normKey=${JSON.stringify(u.normKey)}, tr=${JSON.stringify(u.tr)}, menuZh=${JSON.stringify(u.menuZh)})`
      ).join(' | ')}`
    : `（exact ${menuExact.length} / normKey ${menuViaNorm.length}）`);
// 本文件顶部有一份独立复算的归一化实现；口径必须与引擎 normEngine() 一致，
// 否则上面的契约拿错键，看起来 PASS 其实是假绿。
check('本文件独立 normKey 与引擎 normEngine().normKey 口径一致',
  menuKeys.every(k => normKey(k) === NE.normKey(k)),
  menuKeys.filter(k => normKey(k) !== NE.normKey(k)).slice(0, 5).map(k => JSON.stringify(k)).join(', '));
// 实际效果：这些文字出现在网页 DOM 里也必须能译出（tr() 非 null）。上面只保证
// 「词典表里有」，这里用真实 tr() 再兜一层，防止被歧义组整组作废或 miss 缓存影响。
// 注意：只查非 null，不强制译文与 MENU_LABELS 逐字相同 —— 两层允许各自措辞
// （实测 'Show All' 菜单为「全部显示」、dict 为「显示全部」，属内容差异非缺陷）。
const menuTrNull = menuKeys.filter(k => tr(k) === null || tr(k) === undefined);
check('MENU_LABELS 全部 key 用真实 tr() 均能译出（网页 DOM 层不漏译）',
  menuTrNull.length === 0,
  menuTrNull.map(k => `${JSON.stringify(k)} → null`).join(' | '));

// 本轮经 add-terms 正式写入的 27 条（译文取自 MENU_LABELS，已人工审过）。
// 逐条用真实 tr() 验证英→中，并核对 exact 条目确实在 dict 里，防止「加进去了
// 却被某条规则或归一化歧义组改写」。清单写死是本轮的批次快照；以后再补录词条
// 应往这里追加（下面的 >= 27 守卫不会因此失效），而不是悄悄删条目让断言空转。
const menuAddedTerms = [
  ['Go', '前往'],
  ['New Window', '新建窗口'],
  ['Redo', '重做'],
  ['Cut', '剪切'],
  ['Paste', '粘贴'],
  ['Paste and Match Style', '粘贴并匹配样式'],
  ['Select All', '全选'],
  ['Start Dictation', '开始听写'],
  ['Emoji & Symbols', '表情与符号'],
  ['Speech', '语音'],
  ['Reload', '重新加载'],
  ['Force Reload', '强制重新加载'],
  ['Toggle Developer Tools', '切换开发者工具'],
  ['Toggle Full Screen', '切换全屏'],
  ['Enter Full Screen', '进入全屏'],
  ['Exit Full Screen', '退出全屏'],
  ['Actual Size', '实际大小'],
  ['Zoom', '缩放'],
  ['Bring All to Front', '全部置于顶层'],
  ['Close Window', '关闭窗口'],
  ['Close Tab', '关闭标签页'],
  ['Services', '服务'],
  ['Hide', '隐藏'],
  ['Hide Others', '隐藏其他'],
  ['Preferences', '偏好设置'],
  ['Docs', '文档'],
  ['Downloading Update...', '正在下载更新...'],
];
for (const [en, want] of menuAddedTerms) {
  const got = tr(en);
  check(`菜单补录词条 ${JSON.stringify(en)}`,
    dictFile.dict[en] === want && got === want,
    `期望 exact=${JSON.stringify(want)} 且 tr()=${JSON.stringify(want)}，实际 exact=${JSON.stringify(dictFile.dict[en])} / tr()=${JSON.stringify(got)}`);
}
check('菜单补录词条清单完整（本轮 27 条，防止删条目空转）', menuAddedTerms.length >= 27,
  `当前 ${menuAddedTerms.length} 条`);

// 本轮经 add-terms 补录的 3 条固定文案（发送按钮与对话不可用的错误/空状态）。
// 与 menuAddedTerms 同口径：既核对 exact，也用真实 tr() 兜一层，
// 防止「写进词典却被某条规则改写成别的措辞」，也防止以后再压缩词典时被悄悄删掉。
const uiTextAddedTerms = [
  ['Send Now', '立即发送'],
  ['Conversation unavailable', '对话不可用'],
  ['The conversation could not be loaded because its data was not found.', '无法加载该对话，因为找不到其数据。'],
];
for (const [en, want] of uiTextAddedTerms) {
  const got = tr(en);
  check(`界面文案补录词条 ${JSON.stringify(en)}`,
    dictFile.dict[en] === want && got === want,
    `期望 exact=${JSON.stringify(want)} 且 tr()=${JSON.stringify(want)}，实际 exact=${JSON.stringify(dictFile.dict[en])} / tr()=${JSON.stringify(got)}`);
}
check('界面文案补录词条清单完整（本轮 3 条，防止删条目空转）', uiTextAddedTerms.length >= 3,
  `当前 ${uiTextAddedTerms.length} 条`);

// ---- 7. 规模兜底 ----
// 这里只做「异常膨胀」的兜底，不是覆盖率目标：官方每次更新都可能新增界面文案，
// 词典本就该随之增长。真正的防膨胀靠 test-dict.js 的变体冗余检查（同一归一化键
// 且同译文只允许一条），那才是可判定的指标。用绝对字数当门禁只会逼着人调阈值。
check('词典规模在合理范围内（异常膨胀兜底）', dictKeys.length < 2500, `当前 ${dictKeys.length} 条`);
check('MENU_LABELS 规模在合理范围内（异常膨胀兜底）',
  Object.keys(zh.MENU_LABELS).length < 400, `当前 ${Object.keys(zh.MENU_LABELS).length} 条`);
w.close();
console.log(`\n词典压缩回归: ${pass} 通过, ${fail} 失败`);
fs.rmSync(SIM, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
