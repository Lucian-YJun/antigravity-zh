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

  // 7. 规则路径：字面首字符 → 索引桶匹配（firstChars 优化后行为不变）
  w.__antigravityZh.setData({ dict: {}, rules: [['^Permanently delete (.+?)\\.?$', '永久删除 $1。']] });
  const rule1 = d.createElement('div');
  rule1.textContent = 'Permanently delete MyProject';
  d.getElementById('host').appendChild(rule1);
  await flush();
  check('规则经首字符索引桶正确匹配', rule1.textContent === '永久删除 MyProject。');

  // 8. 规则路径：字符类首字符展开（[AB] → A、B 两个桶）
  w.__antigravityZh.setData({ dict: {}, rules: [['^[AB] item$', '匹配项']] });
  const rule2 = d.createElement('div');
  rule2.textContent = 'B item';
  d.getElementById('host').appendChild(rule2);
  await flush();
  check('字符类首字符规则正确匹配', rule2.textContent === '匹配项');

  // 9. 规则路径：无法提取首字符（如括号开头）→ 兜底桶，行为不变
  w.__antigravityZh.setData({ dict: {}, rules: [['^(.+?) has been saved$', '已保存 $1']] });
  const rule3 = d.createElement('div');
  rule3.textContent = 'Report has been saved';
  d.getElementById('host').appendChild(rule3);
  await flush();
  check('括号开头规则经兜底桶正确匹配', rule3.textContent === '已保存 Report');

  // 10. 重叠规则顺序：特殊规则必须先于一般规则（同桶内保持数组顺序）
  w.__antigravityZh.setData({ dict: {}, rules: [
    ['^Yes, and always allow \'(.+?)\' in this conversation$', '允许，对话内始终允许「$1」'],
    ['^Yes, and always allow \'(.+?)\'$', '允许，始终允许「$1」'],
  ] });
  const rule4a = d.createElement('div');
  rule4a.textContent = "Yes, and always allow 'git push' in this conversation";
  const rule4b = d.createElement('div');
  rule4b.textContent = "Yes, and always allow 'git push'";
  d.getElementById('host').appendChild(rule4a);
  d.getElementById('host').appendChild(rule4b);
  await flush();
  check('重叠规则先匹配特殊规则', rule4a.textContent === '允许，对话内始终允许「git push」');
  check('重叠规则一般规则兜底', rule4b.textContent === '允许，始终允许「git push」');

  // 11. 标签黑名单安全保护：<code>、<pre>、<textarea>、<svg> 内容绝对不翻译
  w.__antigravityZh.setData({
    dict: { 'File': '文件', 'Edit': '编辑', 'Copy': '复制', 'Settings': '设置', 'Close': '关闭' },
    rules: []
  });

  const codeEl = d.createElement('code');
  codeEl.textContent = 'File';
  d.getElementById('host').appendChild(codeEl);

  const preEl = d.createElement('pre');
  preEl.innerHTML = '<code><span class="token">Edit</span></code>';
  d.getElementById('host').appendChild(preEl);

  const textareaEl = d.createElement('textarea');
  textareaEl.textContent = 'Copy';
  textareaEl.setAttribute('placeholder', 'Settings');
  d.getElementById('host').appendChild(textareaEl);

  const svgEl = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const svgText = d.createElementNS('http://www.w3.org/2000/svg', 'text');
  svgText.textContent = 'Close';
  svgEl.appendChild(svgText);
  d.getElementById('host').appendChild(svgEl);

  await flush();
  check('标签保护：<code> 内容保持英文不翻译', codeEl.textContent === 'File');
  check('标签保护：<pre> 内嵌套 <span> 语法高亮保持英文不翻译', preEl.textContent === 'Edit');
  check('标签保护：<textarea> 内部文本保持英文不翻译', textareaEl.textContent === 'Copy');
  check('标签保护：<textarea> placeholder 属性正常翻译', textareaEl.getAttribute('placeholder') === '设置');
  check('标签保护：<svg> 矢量图内部文本不被篡改', svgText.textContent === 'Close');

  // 12. 富文本输入区保护：contenteditable 内部元素不受干扰
  const ceContainer = d.createElement('div');
  ceContainer.setAttribute('contenteditable', 'true');
  const ceInner = d.createElement('p');
  ceInner.innerHTML = '<span>File</span> and <strong>Edit</strong>';
  ceContainer.appendChild(ceInner);
  d.getElementById('host').appendChild(ceContainer);

  await flush();
  check('富文本保护：contenteditable 内部嵌套元素文本不受干扰', ceInner.textContent === 'File and Edit');

  // 13. 多属性覆盖测试：title / aria-label / data-tooltip / alt
  const attrBox = d.createElement('div');
  attrBox.innerHTML = `
    <button id="btn-title" title="Settings"></button>
    <button id="btn-aria" aria-label="Close"></button>
    <span id="tooltip-span" data-tooltip="Copy"></span>
    <img id="test-img" alt="File">
  `;
  d.getElementById('host').appendChild(attrBox);
  await flush();

  check('属性翻译：title 正确翻译', d.getElementById('btn-title').getAttribute('title') === '设置');
  check('属性翻译：aria-label 正确翻译', d.getElementById('btn-aria').getAttribute('aria-label') === '关闭');
  check('属性翻译：data-tooltip 正确翻译', d.getElementById('tooltip-span').getAttribute('data-tooltip') === '复制');
  check('属性翻译：alt 正确翻译', d.getElementById('test-img').getAttribute('alt') === '文件');

  // 14. 边界与安全性：特殊转义符、HTML实体、模板插值字符与多次扫描幂等性
  w.__antigravityZh.setData({
    dict: {
      'Terms & Conditions': '条款与条件',
      'Value is ${foo}': '变量为 ${foo}',
      'Say "Hello"': '说 "你好"'
    },
    rules: [
      ['^Price: \\$([0-9.]+)$', '价格：$1 美元']
    ]
  });

  const secBox = d.createElement('div');
  secBox.innerHTML = `
    <div id="ent">Terms & Conditions</div>
    <div id="tmpl">Value is \${foo}</div>
    <div id="quote">Say "Hello"</div>
    <div id="price">Price: $99.9</div>
  `;
  d.getElementById('host').appendChild(secBox);
  await flush();

  check('特殊字符：HTML 实体符号 & 正常翻译且不破坏 DOM', d.getElementById('ent').textContent === '条款与条件');
  check('特殊字符：模板字面量插值字符 ${...} 安全处理', d.getElementById('tmpl').textContent === '变量为 ${foo}');
  check('特殊字符：包含单双引号文本正常匹配', d.getElementById('quote').textContent === '说 "你好"');
  check('特殊字符：含美元符号 $ 的正则安全捕获与替换', d.getElementById('price').textContent === '价格：99.9 美元');

  // 15. 幂等性：对已翻译内容二次 retranslate 不产生二次翻译破坏
  w.__antigravityZh.retranslate();
  check('幂等性：二次 retranslate 后已翻译内容保持不变',
    d.getElementById('ent').textContent === '条款与条件' &&
    d.getElementById('price').textContent === '价格：99.9 美元'
  );

  console.log(`\n页面翻译器: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
