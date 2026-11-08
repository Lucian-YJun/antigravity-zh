// 混排串（中文前缀 + 英文句子尾巴）的回归测试
//
// 背景：React 会把「中文标签 + 英文句子」拼进同一个 TextNode，
// 例如「同时包含全局权限 when working in these conversations.」。
// 旧 tr() 在首字符是中文时直接 return null，导致尾巴永远不译。
//
// 本测试锁定三条不变量：
//   1. 中文前缀 + 长英文句（≥3 词）→ 英文部分被译；
//   2. 中文里夹的短英文术语（<3 词）→ 保持原样，不误译；
//   3. 纯中文 → 仍返回 null（性能快路径不能被破坏）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function check(name, cond, err) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (err ? ' (' + err + ')' : '')); }
}

const SRC = path.join(__dirname, '../src');
const SIM = path.join(__dirname, 'zh-patch-sim-mixed');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));

const zh = require(path.join(SIM, 'zh-i18n.js'));
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost/' });
const calls = [];
const capWin = {
  _h: {}, isDestroyed: () => false,
  webContents: {
    on: (ev, fn) => { capWin._h[ev] = fn; },
    executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
  },
};
zh.attachWebTranslator(capWin);
capWin._h['did-finish-load']();
const el = dom.window.document.createElement('script');
el.textContent = calls[0].replace('window.__antigravityZh={', 'window.__mixed_tr=tr;window.__antigravityZh={');
dom.window.document.body.appendChild(el);
const tr = dom.window.__mixed_tr;

check('注入脚本暴露 tr()', typeof tr === 'function');
if (typeof tr !== 'function') { process.exit(1); }

// ---- 1) 中文前缀 + 英文长句 → 英文被译 ----
const shouldTranslate = [
  ['同时包含全局权限 when working in these conversations.', '在这些对话中工作时'],
  ['同时包含全局权限 when working in this project.', '在此项目中工作时'],
  ['本地权限 同时包含全局权限 when working in these conversations.', '在这些对话中工作时'],
];
for (const [input, mustContain] of shouldTranslate) {
  const got = tr(input);
  check('混排串翻译 ' + JSON.stringify(input),
    typeof got === 'string' && got.includes(mustContain) && !/when working/i.test(got),
    'got=' + JSON.stringify(got));
}

// 前缀的中文必须原样保留
check('混排串翻译保留中文前缀',
  (tr('同时包含全局权限 when working in these conversations.') || '').startsWith('同时包含全局权限'),
  JSON.stringify(tr('同时包含全局权限 when working in these conversations.')));

// ---- 2) 短英文术语不误译 ----
const shouldNotTouch = [
  '使用 Boost 模式',
  '这是 Token 的数量',
  '按 Enter 发送',
  '查看 MCP 服务器',
];
for (const input of shouldNotTouch) {
  const got = tr(input);
  check('短英文术语不误译 ' + JSON.stringify(input), got === null, 'got=' + JSON.stringify(got));
}

// ---- 3) 纯中文仍走快路径 ----
for (const input of ['在此项目中工作时继承你的全局权限。', '删除对话', '中文文本']) {
  check('纯中文返回 null ' + JSON.stringify(input), tr(input) === null, 'got=' + JSON.stringify(tr(input)));
}

// ---- 4) 纯英文路径不受影响（回归） ----
const englishCases = [
  ['when working in these conversations.', '在这些对话中工作时。'],
  ['Also includes Global Permissions when working in these conversations.', '在这些对话中工作时同时包含全局权限。'],
  ['Settings', '设置'],
  ['Cancel', '取消'],
];
for (const [input, want] of englishCases) {
  const got = tr(input);
  check('纯英文仍正常 ' + JSON.stringify(input), got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

// ---- 5) 尾巴译不出时保持原样（不能把半截英文删掉） ----
const unknownTail = '这是说明 some unknown english sentence here.';
check('尾巴无法翻译时原样返回', tr(unknownTail) === null, 'got=' + JSON.stringify(tr(unknownTail)));

// ---- 6) 缓存不串味 ----
const a = tr('同时包含全局权限 when working in this project.');
const b = tr('同时包含全局权限 when working in these conversations.');
check('不同混排串互不干扰',
  a && b && a !== b && a.includes('在此项目中') && b.includes('在这些对话中'),
  'a=' + JSON.stringify(a) + ' b=' + JSON.stringify(b));

dom.window.close();
fs.rmSync(SIM, { recursive: true, force: true });
console.log(`\n混排串回归: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
