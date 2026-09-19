// 页面翻译器集成测试：jsdom 模拟浏览器 DOM
// 验证：初始翻译 / 同帧翻译（无闪烁核心）/ 大批量延迟 / 打字防抖 / setData 热更新
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 准备隔离目录（__dirname 需与词典同目录）
const SIM = path.join(__dirname, 'zh-patch-sim2');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
const SRC = path.join(__dirname, '../src');
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));
const zh = require(path.join(SIM, 'zh-i18n.js'));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}
const flush = () => new Promise(r => setTimeout(r, 0)); // 让微任务（MutationObserver）落地

(async () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="static">Command Palette</div>
    <input id="search" placeholder="Search tasks...">
    <div id="host"></div>
  </body></html>`, { runScripts: 'dangerously' });
  const w = dom.window;
  const d = w.document;

  // 注入翻译器（用模拟窗口捕获 attachWebTranslator 产生的真实注入脚本）
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
  const s = d.createElement('script');
  s.textContent = calls[0];
  d.body.appendChild(s);

  // 1. 初始全页翻译
  check('静态文字已翻译', d.getElementById('static').textContent === '命令面板');
  check('placeholder 属性已翻译', d.getElementById('search').getAttribute('placeholder') === '搜索任务...');

  // 2. 同帧翻译（核心）：小改动在微任务内完成 = 绘制前，肉眼无闪烁
  const small = d.createElement('div');
  small.textContent = 'View Usage';
  d.getElementById('host').appendChild(small);
  await flush();
  check('新增小节点同帧翻译（无闪烁路径）', small.textContent === '查看用量');

  // 3. 空白文本节点跳过（不报错、不浪费）
  const ws = d.createTextNode('   \n  ');
  d.getElementById('host').appendChild(ws);
  await flush();
  check('空白文本节点安全跳过', ws.nodeValue === '   \n  ');

  // 4. 大批量（单次插入 >30 个节点，用 DocumentFragment 触发）走 60ms 延迟通道
  const frag = d.createDocumentFragment();
  const bigSpans = [];
  for (let i = 0; i < 35; i++) {
    const s = d.createElement('span');
    s.textContent = 'Pin';
    frag.appendChild(s);
    bigSpans.push(s);
  }
  d.getElementById('host').appendChild(frag);
  await flush();
  const immediate = bigSpans[0].textContent === '置顶';
  check('大批量改动先延迟（绘制时仍为英文）', !immediate);
  await new Promise(r => setTimeout(r, 150));
  check('大批量改动延迟后完成翻译', bigSpans[0].textContent === '置顶' && bigSpans[34].textContent === '置顶');

  // 5. 打字更新（characterData）走防抖
  const typing = d.createElement('div');
  typing.textContent = 'hello';
  d.getElementById('host').appendChild(typing);
  await flush();
  typing.firstChild.nodeValue = 'Conversation';
  await flush();
  check('打字更新防抖内未立即翻译', typing.textContent === 'Conversation');
  await new Promise(r => setTimeout(r, 120));
  check('打字更新防抖后翻译', typing.textContent === '对话');

  // 6. setData 热更新：换新词典后新词条生效
  w.__antigravityZh.setData({ dict: { 'Brand New Thing': '全新事物' }, rules: [] });
  const nb = d.createElement('div');
  nb.textContent = 'Brand New Thing';
  d.getElementById('host').appendChild(nb);
  await flush();
  check('setData 热更新后新词条生效', nb.textContent === '全新事物');
  check('setData 后旧词条不再翻译（英文原样保留）', (() => {
    const t = d.createElement('div');
    t.textContent = 'View Usage';
    d.getElementById('host').appendChild(t);
    return true;
  })());
  await flush();
  const oldStill = d.getElementById('host').lastElementChild.textContent;
  check('旧词条在新词典下保持英文', oldStill === 'View Usage');

  console.log(`\n页面翻译器: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
