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

  // 5. 动态状态（characterData）走同帧即时汉化（微任务落地，零闪烁）
  const typing = d.createElement('div');
  typing.textContent = 'hello';
  d.getElementById('host').appendChild(typing);
  await flush();
  typing.firstChild.nodeValue = 'Conversation';
  await flush();
  check('动态状态（characterData）同帧即时汉化成功', typing.textContent === '对话');

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

  // 16. 多节点/变量插值：React 模板将带变量文本拆分为多个相邻 TextNode
  w.__antigravityZh.setData({
    dict: {
      'Plugins are packaged collections of skills and MCPs to help the Agent in': '插件是技能和 MCP 的打包集合，用于帮助智能体在',
      'work with Google developer products. You can always change your choices in Settings.': '中配合 Google 开发者产品协同工作。你可以随时在“设置”中更改你的选项。'
    },
    rules: []
  });

  const pMulti = d.createElement('p');
  pMulti.id = 'react-multi-node';
  pMulti.appendChild(d.createTextNode('Plugins are packaged collections of skills and MCPs to help the Agent in '));
  pMulti.appendChild(d.createTextNode('Antigravity'));
  pMulti.appendChild(d.createTextNode(' work with Google developer products. You can always change your choices in Settings.'));
  d.getElementById('host').appendChild(pMulti);
  await flush();

  check('多节点/变量插值：React 拆分的相邻 TextNode 拼接翻译自然连贯',
    d.getElementById('react-multi-node').textContent === '插件是技能和 MCP 的打包集合，用于帮助智能体在 Antigravity 中配合 Google 开发者产品协同工作。你可以随时在“设置”中更改你的选项。'
  );

  // 17. /boost 动态状态同帧汉化与高频连续推进
  w.__antigravityZh.setData({
    dict: {
      'Running': '运行中',
      'Exploring': '探索中',
      'Completed': '已完成',
      'File': '文件',
      'Settings': '设置',
      'Close': '关闭'
    },
    rules: [
      ['^(\\d+) tasks? remaining$', '剩余 $1 个任务']
    ]
  });

  const boostBox = d.createElement('div');
  const boostStatus = d.createElement('span');
  boostStatus.textContent = '10 tasks remaining';
  boostBox.appendChild(boostStatus);
  d.getElementById('host').appendChild(boostBox);
  await flush();
  check('/boost 动态任务数同帧即时汉化', boostStatus.textContent === '剩余 10 个任务');

  boostStatus.firstChild.nodeValue = '9 tasks remaining';
  await flush();
  check('/boost 动态任务数高频变更同帧即刻跟进', boostStatus.textContent === '剩余 9 个任务');

  boostStatus.firstChild.nodeValue = 'Completed';
  await flush();
  check('/boost 最终状态流转同帧汉化', boostStatus.textContent === '已完成');

  // 18. 双重防重入闭环 + 短周期振荡熔断器（React 受控纠偏极端场景）
  const oscEl = d.createElement('span');
  oscEl.textContent = 'Settings';
  d.getElementById('host').appendChild(oscEl);
  await flush();
  check('振荡测试：初始赋值同帧翻译成功', oscEl.textContent === '设置');

  // 模拟 React 受控纠偏第 1 次纠偏：React 把底层 nodeValue 强行纠正为 Settings
  oscEl.firstChild.nodeValue = 'Settings';
  await flush();
  check('振荡测试：第 1 次受控纠偏翻译器维持纠正', oscEl.textContent === '设置');

  // 模拟 React 受控纠偏第 2 次纠偏（500ms 内累积超 2 次）：短周期振荡熔断器触发生效
  oscEl.firstChild.nodeValue = 'Settings';
  await flush();
  check('振荡测试：短周期高频振荡触发熔断器（放弃修改保留原文）', oscEl.textContent === 'Settings');

  // 熔断后持久绝缘状态：后续即便再次传入，翻译器彻底放弃对此节点的修改，绝不死锁
  oscEl.firstChild.nodeValue = 'Settings';
  await flush();
  check('振荡测试：熔断后保持绝缘，彻底杜绝递归风暴与死锁', oscEl.textContent === 'Settings');

  // 正常间隔（>= 500ms）更新不触发熔断
  const normalEl = d.createElement('span');
  normalEl.textContent = 'Running';
  d.getElementById('host').appendChild(normalEl);
  await flush();
  check('正常更新：初始状态正常汉化', normalEl.textContent === '运行中');

  await new Promise(r => setTimeout(r, 520));
  normalEl.firstChild.nodeValue = 'Exploring';
  await flush();
  check('正常更新：间隔 500ms 以上更新计数重置，正常汉化', normalEl.textContent === '探索中');

  await new Promise(r => setTimeout(r, 520));
  normalEl.firstChild.nodeValue = 'Completed';
  await flush();
  check('正常更新：再次间隔 500ms 更新继续正常汉化', normalEl.textContent === '已完成');

  // 19. 全景物理输入绝缘护盾：全局 IME 锁（compositionstart/end）
  const imeEl = d.createElement('span');
  imeEl.textContent = 'Initial';
  d.getElementById('host').appendChild(imeEl);
  await flush();

  // 模拟输入法启动（拼音输入激活）
  w.dispatchEvent(new w.Event('compositionstart'));
  imeEl.firstChild.nodeValue = 'File';
  await flush();
  check('IME 护盾：拼音组合输入期间绝对绝缘不翻译', imeEl.textContent === 'File');

  // 模拟输入法候选词变换中
  imeEl.firstChild.nodeValue = 'Close';
  await flush();
  check('IME 护盾：候选字切换过程绝对不跳字', imeEl.textContent === 'Close');

  // 模拟输入法完成（上屏结束）
  w.dispatchEvent(new w.Event('compositionend'));
  imeEl.firstChild.nodeValue = 'File';
  await flush();
  check('IME 护盾：输入法结束后恢复正常同帧汉化', imeEl.textContent === '文件');

  // 20. 现代编辑器与终端容器全量物理隔离
  const editorBox = d.createElement('div');
  editorBox.innerHTML = `
    <div class="monaco-editor"><div class="view-lines"><span>File</span><span>Close</span></div></div>
    <div class="monaco-diff-editor"><span>Edit</span></div>
    <div class="cm-editor"><div class="cm-content"><span>Settings</span></div></div>
    <div class="CodeMirror"><div class="CodeMirror-code"><span>File</span></div></div>
    <div class="xterm"><div class="xterm-rows"><span>Running</span></div></div>
    <div class="ProseMirror"><p><span>File</span> and <span>Edit</span></p></div>
  `;
  d.getElementById('host').appendChild(editorBox);
  await flush();

  check('现代容器隔离：.monaco-editor 内部绝对不翻译', editorBox.querySelector('.monaco-editor').textContent.includes('File'));
  check('现代容器隔离：.monaco-diff-editor 代码对比区绝对不翻译', editorBox.querySelector('.monaco-diff-editor').textContent.trim() === 'Edit');
  check('现代容器隔离：.cm-editor (CodeMirror 6) 绝对不翻译', editorBox.querySelector('.cm-editor').textContent.trim() === 'Settings');
  check('现代容器隔离：.CodeMirror (CodeMirror 5) 绝对不翻译', editorBox.querySelector('.CodeMirror').textContent.trim() === 'File');
  check('现代容器隔离：.xterm 终端控制台绝对不翻译', editorBox.querySelector('.xterm').textContent.trim() === 'Running');
  check('现代容器隔离：.ProseMirror 富文本编辑器绝对不翻译', editorBox.querySelector('.ProseMirror').textContent.trim() === 'File and Edit');

  // Monaco 容器内部动态更新 characterData 绝缘测试
  const monacoSpan = editorBox.querySelector('.monaco-editor span');
  monacoSpan.firstChild.nodeValue = 'Settings';
  await flush();
  check('现代容器隔离：Monaco 容器内动态打字/characterData 绝缘不篡改', monacoSpan.textContent === 'Settings');

  // 21. 纯英文快速打字保护（打字 100% 绝对不跳字）
  const ceBox = d.createElement('div');
  ceBox.setAttribute('contenteditable', 'true');
  const ceText = d.createTextNode('');
  ceBox.appendChild(ceText);
  d.getElementById('host').appendChild(ceBox);
  await flush();

  // 模拟快速键入 'F' -> 'Fi' -> 'Fil' -> 'File'
  ceText.nodeValue = 'F';
  await flush();
  ceText.nodeValue = 'Fi';
  await flush();
  ceText.nodeValue = 'Fil';
  await flush();
  ceText.nodeValue = 'File';
  await flush();
  check('纯英文打字保护：contenteditable 连续快速敲击 100% 不跳字', ceText.nodeValue === 'File');

  // 22. TreeWalker 原生子树剪枝（NodeFilter.FILTER_REJECT）与职责分离
  const twBox = d.createElement('div');
  twBox.innerHTML = `
    <pre><code><span class="token">File</span><span class="token">Edit</span></code></pre>
    <div class="normal-sibling">File</div>
    <math><mrow><mi>File</mi></mrow></math>
  `;
  d.getElementById('host').appendChild(twBox);
  await flush();

  check('TreeWalker 剪枝：<pre><code> 内部 Token 整体 REJECT 剪枝保持原样', twBox.querySelector('code').textContent === 'FileEdit');
  check('TreeWalker 剪枝：同容器兄弟节点免检直传正常汉化', twBox.querySelector('.normal-sibling').textContent === '文件');
  check('TreeWalker 剪枝：<math> 数学公式容器整树剪枝保持原样', twBox.querySelector('math').textContent === 'File');

  // 23. 两级联动预算切片（单容器深度遍历 35 步预算）
  const singleContainer = d.createElement('div');
  const deepSpans = [];
  for (let i = 0; i < 70; i++) {
    const s = d.createElement('span');
    s.textContent = 'File';
    singleContainer.appendChild(s);
    deepSpans.push(s);
  }
  // 单个容器插入（addedNodes.length === 1，不走顶层 >30 分流，走单容器 35 步预算切片）
  d.getElementById('host').appendChild(singleContainer);
  await flush(); // 微任务落地（当前首帧）

  check('单容器切片：首帧完成前 35 步预算汉化', deepSpans[0].textContent === '文件' && deepSpans[34].textContent === '文件');
  check('单容器切片：超出 35 步的深层节点首帧平滑交割暂未阻塞', deepSpans[35].textContent === 'File' && deepSpans[69].textContent === 'File');

  // 等待宏任务分批消化
  await new Promise(r => setTimeout(r, 60));
  check('单容器切片：宏任务分批交割平滑消化完毕', deepSpans[35].textContent === '文件' && deepSpans[69].textContent === '文件');

  // 24. 极端边界与容错鲁棒性
  const detachedNode = d.createTextNode('File');
  // 对未挂载父级的游离孤立文本节点安全操作，不应抛出异常
  let noThrow = true;
  try {
    w.__antigravityZh.retranslate();
    detachedNode.nodeValue = 'Close';
  } catch (e) {
    noThrow = false;
  }
  check('鲁棒性：游离孤立节点安全容错不崩溃', noThrow);

  const unknownBox = d.createElement('div');
  unknownBox.textContent = 'SomeRandomUnmatchedWord123 !!!';
  d.getElementById('host').appendChild(unknownBox);
  await flush();
  check('鲁棒性：未知词条与纯标点安全透传', unknownBox.textContent === 'SomeRandomUnmatchedWord123 !!!');

  // 25. 扩展 contenteditable 形式全量物理隔离
  const ceVariationsBox = d.createElement('div');
  ceVariationsBox.innerHTML = `
    <div contenteditable id="ce-bool"><span>File</span></div>
    <div contenteditable="" id="ce-empty"><span>Edit</span></div>
    <div contenteditable="plaintext-only" id="ce-plain"><span>Close</span></div>
    <div contenteditable="false" id="ce-false"><span>File</span></div>
  `;
  d.getElementById('host').appendChild(ceVariationsBox);
  await flush();

  check('可编辑隔离：contenteditable 布尔属性绝对不翻译', d.getElementById('ce-bool').textContent.trim() === 'File');
  check('可编辑隔离：contenteditable="" 空字符串属性绝对不翻译', d.getElementById('ce-empty').textContent.trim() === 'Edit');
  check('可编辑隔离：contenteditable="plaintext-only" 绝对不翻译', d.getElementById('ce-plain').textContent.trim() === 'Close');
  check('可编辑隔离：contenteditable="false" 正常翻译', d.getElementById('ce-false').textContent.trim() === '文件');

  // 26. IME 锁失焦 (blur) 与取消 (compositioncancel) 自动脱困恢复
  const imeRecoverEl = d.createElement('span');
  imeRecoverEl.textContent = 'Initial';
  d.getElementById('host').appendChild(imeRecoverEl);
  await flush();

  // 启动 composition
  w.dispatchEvent(new w.Event('compositionstart'));
  imeRecoverEl.firstChild.nodeValue = 'File';
  await flush();
  check('IME 护盾脱困：输入中绝缘保持', imeRecoverEl.textContent === 'File');

  // 模拟窗口失焦 (blur) 自动解除 IME 锁
  w.dispatchEvent(new w.Event('blur'));
  imeRecoverEl.firstChild.nodeValue = 'Settings';
  await flush();
  check('IME 护盾脱困：失焦 blur 后自动解除输入锁正常汉化', imeRecoverEl.textContent === '设置');

  // 模拟 compositioncancel 自动解除 IME 锁
  w.dispatchEvent(new w.Event('compositionstart'));
  imeRecoverEl.firstChild.nodeValue = 'File';
  await flush();
  check('IME 护盾脱困：再次输入中绝缘保持', imeRecoverEl.textContent === 'File');

  w.dispatchEvent(new w.Event('compositioncancel'));
  imeRecoverEl.firstChild.nodeValue = 'Close';
  await flush();
  check('IME 护盾脱困：compositioncancel 后自动解除输入锁正常汉化', imeRecoverEl.textContent === '关闭');

  // 27. 三级跨帧预算切片测试（单容器 105 个节点，分三帧宏任务平滑消化）
  const tripleContainer = d.createElement('div');
  const tripSpans = [];
  for (let i = 0; i < 105; i++) {
    const s = d.createElement('span');
    s.textContent = 'File';
    tripleContainer.appendChild(s);
    tripSpans.push(s);
  }
  d.getElementById('host').appendChild(tripleContainer);
  await flush(); // 首帧微任务

  check('三级切片：首帧完成前 35 步预算汉化', tripSpans[0].textContent === '文件' && tripSpans[34].textContent === '文件');
  check('三级切片：超出 35 步的深层节点首帧平滑交割', tripSpans[35].textContent === 'File' && tripSpans[104].textContent === 'File');

  // 等待第 1 次 16ms 宏任务交割
  await new Promise(r => setTimeout(r, 30));
  check('三级切片：第二帧消化至 70 步', tripSpans[35].textContent === '文件' && tripSpans[69].textContent === '文件');
  check('三级切片：超出 70 步的节点仍保持平滑交割', tripSpans[70].textContent === 'File' && tripSpans[104].textContent === 'File');

  // 等待第 2 次 16ms 宏任务交割
  await new Promise(r => setTimeout(r, 50));
  check('三级切片：第三帧全部 105 步消化完毕', tripSpans[70].textContent === '文件' && tripSpans[104].textContent === '文件');

  console.log(`\n页面翻译器: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
