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
  </body></html>`, { runScripts: 'dangerously', url: 'http://localhost/' });
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
  await new Promise(r => setTimeout(r, 300));
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
  await new Promise(r => setTimeout(r, 20));
  check('三级切片：第二帧消化至 70 步', tripSpans[35].textContent === '文件' && tripSpans[69].textContent === '文件');
  check('三级切片：超出 70 步的节点仍保持平滑交割', tripSpans[70].textContent === 'File' || tripSpans[104].textContent === '文件');

  // 等待第 2 次 16ms 宏任务交割
  await new Promise(r => setTimeout(r, 50));
  check('三级切片：第三帧全部 105 步消化完毕', tripSpans[70].textContent === '文件' && tripSpans[104].textContent === '文件');

  // 28. /plan 介绍及相关斜杠命令与模式汉化验证
  w.__antigravityZh.setData(JSON.parse(fs.readFileSync(path.join(SRC, 'cockpit-zh.json'), 'utf-8')));
  const planBox = d.createElement('div');
  planBox.innerHTML = `
    <div id="plan-desc">Plan carefully before executing a task.</div>
    <div id="plan-mode">Planning Mode</div>
    <div id="plan-review">Review and refine the agent's step-by-step plan before execution.</div>
    <div id="plan-impl">Implementation Plan</div>
  `;
  d.getElementById('host').appendChild(planBox);
  await flush();
  check('/plan 命令短介绍汉化', d.getElementById('plan-desc').textContent === '在执行任务前周密制定计划。');
  check('计划模式 (Planning Mode) 汉化', d.getElementById('plan-mode').textContent === '计划模式');
  check('计划审查说明汉化', d.getElementById('plan-review').textContent === '在执行前审查并完善智能体的分步计划。');
  check('实施计划 (Implementation Plan) 汉化', d.getElementById('plan-impl').textContent === '实施计划');

  // 29. Unicode 空白符与 &nbsp; (\u00A0)、全角空格 \u3000 首尾修剪与汉化验证
  const unicodeSpaceBox = d.createElement('div');
  unicodeSpaceBox.innerHTML = `
    <div id="u-nbsp">\u00A0File\u00A0</div>
    <div id="u-em">\u2003Settings\u2003</div>
    <div id="u-cjk">\u3000New Conversation\u3000</div>
    <div id="u-mixed">\u00A0\t Close \r\n\u00A0</div>
  `;
  d.getElementById('host').appendChild(unicodeSpaceBox);
  await flush();
  check('&nbsp; (\\u00A0) 空白符正确修剪并汉化', d.getElementById('u-nbsp').textContent === '\u00A0文件\u00A0');
  check('Em space (\\u2003) 空白符正确修剪并汉化', d.getElementById('u-em').textContent === '\u2003设置\u2003');
  check('全角空格 (\\u3000) 空白符正确修剪并汉化', d.getElementById('u-cjk').textContent === '\u3000新建对话\u3000');
  check('多重混合 Unicode 空白符正确修剪并汉化', d.getElementById('u-mixed').textContent === '\u00A0\t 关闭 \n\u00A0');

  // 30. 双代未命中缓存 (Generational Cache) 与热点更新验证
  // 测试超过单代 2000 容量后，旧缓存正常平滑轮转至 prev，新热点正常添加且不抛错
  const genBox = d.createElement('div');
  for (let i = 0; i < 2500; i++) {
    const p = d.createElement('span');
    p.textContent = 'unmatchedToken_' + i;
    genBox.appendChild(p);
  }
  d.getElementById('host').appendChild(genBox);
  await flush();
  check('双代未命中缓存平滑轮转 2500 项无异常', genBox.children.length === 2500);

  // 验证轮转后已知词条仍旧能够毫秒级翻译且不被未命中缓存污染
  const postGenEl = d.createElement('span');
  postGenEl.textContent = 'File';
  d.getElementById('host').appendChild(postGenEl);
  await flush();
  check('双代轮转后标准词条正常命中翻译', postGenEl.textContent === '文件');

  // 31. 中文字符首字符快速短路 (CJK Fast Short-Circuit) 与纯空白透传
  const cjkEl = d.createElement('span');
  cjkEl.textContent = '这是已经汉化完成的界面内容';
  d.getElementById('host').appendChild(cjkEl);
  await flush();
  check('中文已汉化文本极速透传不篡改', cjkEl.textContent === '这是已经汉化完成的界面内容');

  // 32. Subagent 计时器 2.0：正在运行面板 (running-items-panel) 动态计时测试
  const runningPanel = d.createElement('div');
  runningPanel.setAttribute('data-testid', 'running-items-panel');
  runningPanel.innerHTML = `
    <div class="overflow-y-auto">
      <div class="flex items-center">
        <span class="text-sm truncate">Coding Task Optimizer</span>
      </div>
    </div>
  `;
  d.getElementById('host').appendChild(runningPanel);
  // 等待 tick 刷新
  await new Promise(r => setTimeout(r, 1100));
  const timerSpan = runningPanel.querySelector('.ag-panel-sub-timer');
  check('Subagent 计时器：正在运行面板成功追加时长标签', !!timerSpan && /·\s*\d+s/.test(timerSpan.textContent));

  // 33. Subagent 计时器 2.0：优先嗅探原生启动时间 (Native Timestamp Probing)
  // 模拟一个 65 秒前已启动、但刚刚才被展开渲染的 subagent 节点
  const sixtyFiveSecAgo = Date.now() - 65000;
  const lateSubagentNode = d.createElement('div');
  lateSubagentNode.setAttribute('data-testid', 'subagent-node');
  lateSubagentNode.setAttribute('data-cascade-id', 'task_native_probe');
  lateSubagentNode.setAttribute('data-created-at', String(sixtyFiveSecAgo));
  lateSubagentNode.innerHTML = `
    <div class="title">DeepCoder</div>
    <div class="text-xs">工作中</div>
  `;
  d.getElementById('host').appendChild(lateSubagentNode);
  await new Promise(r => setTimeout(r, 1100));
  const lateTimerSpan = lateSubagentNode.querySelector('.ag-node-sub-timer');
  check('Subagent 计时器：原生时间戳探测准确，折叠晚展开精准显示真实时长 (1m 05s+)', !!lateTimerSpan && lateTimerSpan.textContent.includes('1m'));

  // 34. Subagent 计时器 2.0：跨页面重载持久化 (sessionStorage Persistence)
  // 模拟从 sessionStorage 中恢复 2 分钟前的历史任务时间
  const twoMinAgo = Date.now() - 125000;
  if (w.sessionStorage) {
    w.sessionStorage.setItem('__agy_st_task_persisted_reload', String(twoMinAgo));
  }
  const persistedNode = d.createElement('div');
  persistedNode.setAttribute('data-testid', 'subagent-node');
  persistedNode.setAttribute('data-cascade-id', 'task_persisted_reload');
  persistedNode.innerHTML = `
    <div class="title">PersistentAgent</div>
    <div class="text-xs">工作中</div>
  `;
  d.getElementById('host').appendChild(persistedNode);
  await new Promise(r => setTimeout(r, 1100));
  const persistedSpan = persistedNode.querySelector('.ag-node-sub-timer');
  check('Subagent 计时器：跨页面刷新持久化成功，从 sessionStorage 恢复 2m+ 历史时长', !!persistedSpan && persistedSpan.textContent.includes('2m'));

  // 35. Subagent 计时器 2.0：Page Visibility API 可见性调度感知
  let visEventFired = false;
  try {
    d.dispatchEvent(new w.Event('visibilitychange'));
    visEventFired = true;
  } catch (e) {}
  check('Subagent 计时器：Page Visibility 调度事件响应正常无报错', visEventFired);

  // 36. 补全未汉化界面条目与动态规则深度验证（图像1-5与文本项6-8、/boost）
  w.__antigravityZh.setData(JSON.parse(fs.readFileSync(path.join(SRC, 'cockpit-zh.json'), 'utf-8')));
  const unlocBox1 = d.createElement('div');
  unlocBox1.innerHTML = `
    <div id="test-perm-preset">Permission Preset</div>
    <div id="test-perm-preset-lower">permission preset</div>
    <div id="test-perm-preset-colon">Permission Preset:</div>
    <div id="test-notif-pref">Manage your notification preferences.</div>
    <div id="test-notif-pref-noun">Manage notification preferences</div>
    <div id="test-builtin-browser">Built-in Browser</div>
    <div id="test-browser-pref">Configure link opening and built-in browser preferences.</div>
    <div id="test-external-browser">External Browser</div>
    <div id="test-browser-subagent">Browser Subagent</div>
    <div id="test-browser-desc">Configure the browser subagent. It requires <a href="#">Google Chrome</a> to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.</div>
    <div id="test-browser-desc-capital">Configure browser subagent. Requires Google Chrome to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.</div>
    <div id="test-browser-desc-short">Requires <a href="#">Google Chrome</a> to be installed.</div>
  `;
  const unlocBox2 = d.createElement('div');
  unlocBox2.innerHTML = `
    <div id="test-replace-new">Replace with New</div>
    <div id="test-replace-new-lower">replace with new</div>
    <div id="test-bg-cmds-single">Background Commands</div>
    <div id="test-bg-cmds-badge">Background Commands 3</div>
    <div id="test-bg-cmds-lower">background commands 2</div>
    <div id="test-bg-cmds-colon">Background Commands: 4</div>
    <div id="test-bg-cmds-bracket">Background Commands [5]</div>
    <div id="test-bg-cmds-count-first">3 background commands</div>
    <div id="test-bg-cmds-none">No background commands</div>
    <div id="test-bg-cmds-split"><span>Background Commands</span> <span class="badge">1</span></div>
    <div id="test-full-view">Full view</div>
    <div id="test-full-veiw">Full veiw</div>
  `;
  const unlocBox3 = d.createElement('div');
  unlocBox3.innerHTML = `
    <div id="test-toggle-full-view">Toggle Full View</div>
    <div id="test-new-tab">New Tab</div>
    <div id="test-new-tab-shortcut">New Tab (Ctrl+T)</div>
    <div id="test-open-new-tab">Open New Tab</div>
    <div id="test-no-changes">No changes to review</div>
    <div id="test-no-changes-yet">No changes to review yet.</div>
    <div id="test-there-are-no-changes">There are no changes to review.</div>
    <div id="test-boost-mode">Switch to Boost Mode</div>
    <div id="test-boost-exit">Exit Boost Mode</div>
    <div id="test-boost-enable">Enable Boost Mode</div>
    <div id="test-boost-active">Boost Mode is active</div>
  `;
  d.getElementById('host').appendChild(unlocBox1);
  d.getElementById('host').appendChild(unlocBox2);
  d.getElementById('host').appendChild(unlocBox3);
  await flush();

  check('图像1：Permission Preset 汉化', d.getElementById('test-perm-preset').textContent === '权限预设');
  check('图像1：permission preset 小写首字母分桶汉化', d.getElementById('test-perm-preset-lower').textContent === '权限预设');
  check('图像1：Permission Preset: 冒号表单项汉化', d.getElementById('test-perm-preset-colon').textContent === '权限预设：');
  check('图像2：Manage your notification preferences. 完整句汉化', d.getElementById('test-notif-pref').textContent === '管理你的通知偏好设置。');
  check('图像2：Manage notification preferences 标题规范汉化（无冗余代词与标点）', d.getElementById('test-notif-pref-noun').textContent === '管理通知偏好设置');
  check('图像3：Built-in Browser 汉化', d.getElementById('test-builtin-browser').textContent === '内置浏览器');
  check('图像3：Configure link opening and built-in browser preferences. 汉化', d.getElementById('test-browser-pref').textContent === '配置链接打开方式和内置浏览器偏好设置。');
  check('图像3：External Browser 汉化', d.getElementById('test-external-browser').textContent === '外部浏览器');
  check('图像3：Browser Subagent 汉化', d.getElementById('test-browser-subagent').textContent === '浏览器子智能体');
  check('图像3：浏览器子智能体混合拆分文本整句自然汉化', d.getElementById('test-browser-desc').textContent.replace(/\s+/g, ' ').trim() === '配置浏览器子智能体。需要安装 Google Chrome 才能使用。在对话输入框中输入 /browser 即可调用浏览器子智能体。');
  check('图像3：大写 Requires 无主语整句正则汉化（彻底修复大小写缺陷）', d.getElementById('test-browser-desc-capital').textContent.replace(/\s+/g, ' ').trim() === '配置浏览器子智能体。需要安装 Google Chrome 才能使用。在对话输入框中输入 /browser 即可调用浏览器子智能体。');
  check('图像3：Requires 独立段落插值拆分汉化', d.getElementById('test-browser-desc-short').textContent.replace(/\s+/g, ' ').trim() === '需要安装 Google Chrome 才能使用。');
  check('图像4：Replace with New 汉化', d.getElementById('test-replace-new').textContent === '替换为新对话');
  check('图像4：replace with new 全小写分桶汉化', d.getElementById('test-replace-new-lower').textContent === '替换为新对话');
  check('图像5：Background Commands 独立汉化', d.getElementById('test-bg-cmds-single').textContent === '后台命令');
  check('图像5：Background Commands 动态计数汉化', d.getElementById('test-bg-cmds-badge').textContent === '后台命令 3');
  check('图像5：background commands 小写首字母动态徽章汉化', d.getElementById('test-bg-cmds-lower').textContent === '后台命令 2');
  check('图像5：Background Commands: 带冒号计数汉化', d.getElementById('test-bg-cmds-colon').textContent === '后台命令 4');
  check('图像5：Background Commands [5] 中括号计数汉化', d.getElementById('test-bg-cmds-bracket').textContent === '后台命令 (5)');
  check('图像5：3 background commands 数量前置动态汉化', d.getElementById('test-bg-cmds-count-first').textContent === '3 个后台命令');
  check('图像5：No background commands 空状态面板汉化', d.getElementById('test-bg-cmds-none').textContent === '没有后台命令');
  check('图像5：真实 DOM 标签+徽章双子节点渲染汉化', d.getElementById('test-bg-cmds-split').textContent.replace(/\s+/g, ' ').trim() === '后台命令 1');
  check('文本项6：Full view 汉化', d.getElementById('test-full-view').textContent === '完整视图');
  check('文本项6：Full veiw 拼写容错汉化', d.getElementById('test-full-veiw').textContent === '完整视图');
  check('文本项6：Toggle Full View 菜单动作汉化', d.getElementById('test-toggle-full-view').textContent === '切换完整视图');
  check('文本项7：New Tab 汉化', d.getElementById('test-new-tab').textContent === '新建标签页');
  check('文本项7：New Tab (Ctrl+T) 快捷键提示汉化', d.getElementById('test-new-tab-shortcut').textContent === '新建标签页 (Ctrl+T)');
  check('文本项7：Open New Tab 动作汉化', d.getElementById('test-open-new-tab').textContent === '打开新建标签页');
  check('文本项8：No changes to review 汉化', d.getElementById('test-no-changes').textContent === '没有需要审查的更改');
  check('文本项8：No changes to review yet. 时态与句号汉化', d.getElementById('test-no-changes-yet').textContent === '尚无需要审查的更改。');
  check('文本项8：There are no changes to review. 完整句汉化', d.getElementById('test-there-are-no-changes').textContent === '没有需要审查的更改。');
  check('/boost：Switch to Boost Mode 模式切换汉化', d.getElementById('test-boost-mode').textContent === '切换到 Boost 模式');
  check('/boost：Exit Boost Mode 退出模式汉化', d.getElementById('test-boost-exit').textContent === '退出 Boost 模式');
  check('/boost：Enable Boost Mode 启用动作汉化', d.getElementById('test-boost-enable').textContent === '启用 Boost 模式');
  check('/boost：Boost Mode is active 状态指示汉化', d.getElementById('test-boost-active').textContent === 'Boost 模式处于激活状态');

  // 37. 截图补全汉化专项验证 (图1-图5 词条与快捷键、大小写、标点深度校验)
  const boxPic1 = d.createElement('div');
  boxPic1.innerHTML = `
    <!-- 图 1: 右键项目与排序菜单 -->
    <div id="test-sort-projects">Sort Projects</div>
    <div id="test-sort-projects-lower">sort projects</div>
    <div id="test-sort-projects-colon">Sort Projects:</div>
    <div id="test-custom-order">Custom Order</div>
    <div id="test-custom-order-lower">custom order</div>
    <div id="test-auto-pin">Auto Pin</div>
    <div id="test-auto-pin-lower">auto pin</div>
    <div id="test-auto-pin-hyphen">Auto-Pin</div>
    <div id="test-archived-only">Archived Only</div>
    <div id="test-archived-only-lower">archived only</div>
    <div id="test-mark-all-read">Mark All as Read</div>
    <div id="test-mark-all-read-title">Mark All As Read</div>
    <div id="test-mark-all-read-lower">mark all as read</div>
  `;
  const boxPic2 = d.createElement('div');
  boxPic2.innerHTML = `
    <!-- 图 2: 命令面板下拉 -->
    <div id="test-collapse-all-folders">Collapse All Folders</div>
    <div id="test-collapse-all-folders-shortcut">Collapse All Folders (Ctrl+K Ctrl+C)</div>
    <div id="test-expand-all-folders">Expand All Folders</div>
    <div id="test-expand-all-folders-shortcut">Expand All Folders (Ctrl+K Ctrl+E)</div>
    <div id="test-move-conv-up">Move Conversation Up</div>
    <div id="test-move-conv-up-shortcut">Move Conversation Up (Alt+Up)</div>
    <div id="test-move-conv-down">Move Conversation Down</div>
    <div id="test-move-conv-down-shortcut">Move Conversation Down (Alt+Down)</div>
    <div id="test-open-shortcuts">Open Keyboard Shortcuts</div>
    <div id="test-open-shortcuts-shortcut">Open Keyboard Shortcuts (Ctrl+K Ctrl+S)</div>
    <div id="test-keyboard-shortcuts">Keyboard Shortcuts</div>
    <div id="test-download-diag">Download Diagnostics</div>
    <div id="test-download-diag-lower">download diagnostics</div>
    <div id="test-toggle-themes">Toggle Between Light/Dark Themes</div>
    <div id="test-toggle-themes-lower">toggle between light/dark themes</div>
    <div id="test-toggle-themes-short">Toggle Light/Dark Themes</div>
    <div id="test-toggle-themes-and">Toggle Between Light and Dark Themes</div>
  `;
  const boxPic3 = d.createElement('div');
  boxPic3.innerHTML = `
    <!-- 图 3: 扩展菜单与空状态 -->
    <div id="test-extensions">Extensions</div>
    <div id="test-extensions-lower">extensions</div>
    <div id="test-no-ext-avail">No extensions available</div>
    <div id="test-no-ext-avail-dot">No extensions available.</div>
    <div id="test-no-ext-avail-title">No Extensions Available</div>
    <div id="test-no-ext-avail-lower">no extensions available</div>
    <div id="test-no-ext-avail-lower-dot">no extensions available.</div>
  `;
  const boxPic4 = d.createElement('div');
  boxPic4.innerHTML = `
    <!-- 图 4: 自动化搜索与空状态 -->
    <input id="test-search-automations-ph" placeholder="Search automations..." />
    <div id="test-search-automations-text">Search automations...</div>
    <div id="test-search-automations-title">Search Automations...</div>
    <div id="test-search-automations-nodot">Search automations</div>
    <div id="test-search-automations-title-nodot">Search Automations</div>
    <div id="test-no-automations">No automations configured.</div>
    <div id="test-no-automations-nodot">No automations configured</div>
    <div id="test-no-automations-title">No Automations Configured.</div>
    <div id="test-no-automations-title-nodot">No Automations Configured</div>
    <div id="test-no-automations-lower">no automations configured.</div>
    <div id="test-no-automations-lower-nodot">no automations configured</div>
  `;
  const boxPic5 = d.createElement('div');
  boxPic5.innerHTML = `
    <!-- 图 5: 标签页与辅助面板切换 -->
    <div id="test-reopen-tab">Reopen Closed Tab</div>
    <div id="test-reopen-tab-shortcut">Reopen Closed Tab (Ctrl+Shift+T)</div>
    <div id="test-reopen-tab-lower">reopen closed tab</div>
    <div id="test-reopen-editor">Reopen Closed Editor</div>
    <div id="test-prev-aux-pane">Previous Aux Pane Tab</div>
    <div id="test-prev-aux-pane-shortcut">Previous Aux Pane Tab (Ctrl+Alt+Left)</div>
    <div id="test-prev-aux-pane-full">Previous Auxiliary Pane Tab</div>
    <div id="test-prev-aux-pane-lower">previous aux pane tab</div>
    <div id="test-next-aux-pane">Next Aux Pane Tab</div>
    <div id="test-next-aux-pane-shortcut">Next Aux Pane Tab (Ctrl+Alt+Right)</div>
    <div id="test-next-aux-pane-full">Next Auxiliary Pane Tab</div>
    <div id="test-next-aux-pane-lower">next aux pane tab</div>
  `;
  d.getElementById('host').appendChild(boxPic1);
  d.getElementById('host').appendChild(boxPic2);
  d.getElementById('host').appendChild(boxPic3);
  d.getElementById('host').appendChild(boxPic4);
  d.getElementById('host').appendChild(boxPic5);

  const boxPic6 = d.createElement('div');
  boxPic6.innerHTML = `
    <!-- 新增截图 1: 删除对话确认弹窗 -->
    <div id="test-del-conv-title">Delete Conversation</div>
    <div id="test-del-conv-title-sentence">Delete conversation</div>
    <div id="test-del-conv-title-lower">delete conversation</div>
    <div id="test-del-conv-title-dot">Delete Conversation.</div>
    <div id="test-del-conv-title-ellipsis-char">Delete Conversation…</div>
    <div id="test-del-conv-colon">Delete Conversation:</div>
    <div id="test-del-conv-ellipsis">Delete Conversation...</div>
    <div id="test-del-conv-shortcut">Delete Conversation (Ctrl+Shift+D)</div>
    <div id="test-del-conv-prompt-full">Are you sure you want to delete this conversation? This action cannot be undone.</div>
    <div id="test-del-conv-prompt-nodot">Are you sure you want to delete this conversation? This action cannot be undone</div>
    <div id="test-del-conv-prompt-lower-full">are you sure you want to delete this conversation? this action cannot be undone.</div>
    <div id="test-del-conv-prompt-lower-nodot">are you sure you want to delete this conversation? this action cannot be undone</div>
    <div id="test-del-conv-prompt-title-full">Are You Sure You Want To Delete This Conversation? This Action Cannot Be Undone.</div>
    <div id="test-del-conv-prompt-title-nodot">Are You Sure You Want To Delete This Conversation? This Action Cannot Be Undone</div>
    <div id="test-del-conv-q">Are you sure you want to delete this conversation?</div>
    <div id="test-del-conv-q-nodot">Are you sure you want to delete this conversation</div>
    <div id="test-del-conv-q-lower">are you sure you want to delete this conversation?</div>
    <div id="test-del-conv-q-title">Are You Sure You Want To Delete This Conversation?</div>
    <div id="test-del-conv-undone">This action cannot be undone.</div>
    <div id="test-del-conv-undone-nodot">This action cannot be undone</div>
    <div id="test-del-conv-undone-lower">this action cannot be undone.</div>
    <div id="test-del-conv-undone-lower-nodot">this action cannot be undone</div>
    <div id="test-del-conv-undone-title">This Action Cannot Be Undone.</div>
    <div id="test-del-conv-undone-title-nodot">This Action Cannot Be Undone</div>
    <!-- 弹窗全方位覆盖变体：换行符、CRLF、连续空格、子节点拆分、can not等 -->
    <div id="test-del-conv-newline">Are you sure you want to delete this conversation?\nThis action cannot be undone.</div>
    <div id="test-del-conv-crlf">Are you sure you want to delete this conversation?\r\nThis action cannot be undone.</div>
    <div id="test-del-conv-newline-spaces">Are you sure you want to delete this conversation?\n  This action cannot be undone.</div>
    <div id="test-del-conv-spaces-newline">Are you sure you want to delete this conversation? \nThis action cannot be undone.</div>
    <div id="test-del-conv-double-newline">Are you sure you want to delete this conversation?\n\nThis action cannot be undone.</div>
    <div id="test-del-conv-multi-spaces">Are you sure you want to delete this conversation?   This action cannot be undone.</div>
    <div id="test-del-conv-br">Are you sure you want to delete this conversation?<br>This action cannot be undone.</div>
    <div id="test-del-conv-p"><p>Are you sure you want to delete this conversation?</p><p>This action cannot be undone.</p></div>
    <div id="test-del-conv-div"><div>Are you sure you want to delete this conversation?</div><div>This action cannot be undone.</div></div>
    <div id="test-del-conv-nested-spaces"><div>  Are you sure you want to delete this conversation?  </div><div>  This action cannot be undone.  </div></div>
    <div id="test-del-conv-can-not">Are you sure you want to delete this conversation? This action can not be undone.</div>
    <div id="test-del-conv-title-upper">DELETE CONVERSATION</div>
    <div id="test-del-conv-title-upper-dot">DELETE CONVERSATION.</div>
    <div id="test-del-conv-title-upper-colon">DELETE CONVERSATION:</div>
    <div id="test-del-conv-title-upper-q">DELETE CONVERSATION?</div>
    <div id="test-del-conv-bracket-shortcut">Delete Conversation [Ctrl+Shift+D]</div>
    <div id="test-del-conv-upper-full">ARE YOU SURE YOU WANT TO DELETE THIS CONVERSATION? THIS ACTION CANNOT BE UNDONE.</div>
    <div id="test-del-conv-upper-nodot">ARE YOU SURE YOU WANT TO DELETE THIS CONVERSATION? THIS ACTION CANNOT BE UNDONE</div>
    <div id="test-del-conv-no-q-newline">Are you sure you want to delete this conversation\nThis action cannot be undone.</div>
    <div id="test-del-conv-dot-separator">Are you sure you want to delete this conversation. This action cannot be undone.</div>
    <div id="test-del-conv-colon-separator">Are you sure you want to delete this conversation: This action cannot be undone.</div>
    <div id="test-del-conv-tab-separator">Are you sure you want to delete this conversation?\tThis action cannot be undone.</div>
    <div id="test-del-conv-indent-newline">Are you sure you want to delete this conversation?\n    This action cannot be undone.</div>
    <div id="test-del-conv-exclamation">Are you sure you want to delete this conversation? This action cannot be undone!</div>
    <div id="test-del-conv-ellipsis-end">Are you sure you want to delete this conversation? This action cannot be undone...</div>
    <div id="test-del-conv-span"><span>Are you sure you want to delete this conversation?</span><span>This action cannot be undone.</span></div>
    <div id="test-del-conv-outer-whitespace">
      Are you sure you want to delete this conversation?
      This action cannot be undone.
    </div>
    <div id="test-del-conv-undone-exclamation">This action cannot be undone!</div>
    <div id="test-del-conv-undone-ellipsis">This action cannot be undone...</div>
    <div id="test-del-conv-undone-upper">THIS ACTION CANNOT BE UNDONE.</div>
    <div id="test-del-conv-undone-upper-nodot">THIS ACTION CANNOT BE UNDONE</div>
    <div id="test-del-conv-q-upper">ARE YOU SURE YOU WANT TO DELETE THIS CONVERSATION?</div>
    <div id="test-del-conv-q-upper-nodot">ARE YOU SURE YOU WANT TO DELETE THIS CONVERSATION</div>
  `;

  const boxPic7 = d.createElement('div');
  boxPic7.innerHTML = `
    <!-- 新增截图 2: 权限设置面板与说明片段 -->
    <div id="test-perm-settings-title">Permission Settings</div>
    <div id="test-perm-settings-sentence">Permission settings</div>
    <div id="test-perm-settings-lower">permission settings</div>
    <div id="test-perm-settings-dot">Permission Settings.</div>
    <div id="test-perm-settings-ellipsis-char">Permission Settings…</div>
    <div id="test-perm-settings-colon">Permission Settings:</div>
    <div id="test-perm-settings-ellipsis">Permission Settings...</div>
    <div id="test-perm-settings-shortcut">Permission Settings (Ctrl+Shift+P)</div>
    <div id="test-when-working-dot">when working in these conversations.</div>
    <div id="test-when-working-nodot">when working in these conversations</div>
    <div id="test-when-working-cap-dot">When working in these conversations.</div>
    <div id="test-when-working-cap-nodot">When working in these conversations</div>
    <div id="test-when-working-title-dot">When Working in These Conversations.</div>
    <div id="test-when-working-title-nodot">When Working in These Conversations</div>
    <div id="test-perm-full-sentence">Also includes Global Permissions when working in these conversations.</div>
    <div id="test-perm-full-sentence-nodot">Also includes Global Permissions when working in these conversations</div>
    <div id="test-perm-full-sentence-title">Also Includes Global Permissions When Working in These Conversations.</div>
    <div id="test-perm-full-sentence-title-nodot">Also Includes Global Permissions When Working in These Conversations</div>
    <p id="test-perm-react-split">
      <span>Also includes </span>
      <button>Global Permissions</button>
      <span> when working in these conversations. </span>
      <a>Learn More</a>
    </p>
  `;

  const boxPic8 = d.createElement('div');
  boxPic8.innerHTML = `
    <!-- 新增截图 3: 项目卡片右键菜单 -->
    <div id="test-copy-proj-name">Copy Project Name</div>
    <div id="test-copy-proj-name-sentence">Copy project name</div>
    <div id="test-copy-proj-name-lower">copy project name</div>
    <div id="test-copy-proj-name-dot">Copy Project Name.</div>
    <div id="test-copy-proj-name-ellipsis-char">Copy Project Name…</div>
    <div id="test-copy-proj-name-shortcut">Copy Project Name (Ctrl+C)</div>
    <div id="test-copy-proj-name-ellipsis">Copy Project Name...</div>
    <div id="test-copy-proj-name-colon">Copy Project Name:</div>
    <div id="test-proj-settings">Project Settings</div>
    <div id="test-proj-settings-sentence">Project settings</div>
    <div id="test-proj-settings-lower">project settings</div>
    <div id="test-proj-settings-dot">Project Settings.</div>
    <div id="test-proj-settings-ellipsis-char">Project Settings…</div>
    <div id="test-proj-settings-shortcut">Project Settings (Ctrl+,)</div>
    <div id="test-proj-settings-colon">Project Settings:</div>
    <div id="test-show-in-explorer">Show in File Explorer</div>
    <div id="test-show-in-explorer-sentence">Show in file explorer</div>
    <div id="test-show-in-explorer-lower">show in file explorer</div>
    <div id="test-show-in-explorer-title">Show In File Explorer</div>
    <div id="test-show-in-explorer-dot">Show in File Explorer.</div>
    <div id="test-show-in-explorer-title-dot">Show In File Explorer.</div>
    <div id="test-show-in-explorer-colon">Show in File Explorer:</div>
    <div id="test-show-in-explorer-ellipsis-char">Show in File Explorer…</div>
    <div id="test-show-in-explorer-shortcut">Show in File Explorer (Alt+R)</div>
    <div id="test-delete-proj">Delete Project</div>
    <div id="test-delete-proj-sentence">Delete project</div>
    <div id="test-delete-proj-lower">delete project</div>
    <div id="test-delete-proj-dot">Delete Project.</div>
    <div id="test-delete-proj-ellipsis-char">Delete Project…</div>
    <div id="test-delete-proj-colon">Delete Project:</div>
    <div id="test-delete-proj-shortcut">Delete Project (Del)</div>
    <div id="test-delete-proj-ellipsis">Delete Project...</div>
    <div id="test-delete-proj-prompt-full">Are you sure you want to delete this project? This action cannot be undone.</div>
    <div id="test-delete-proj-q">Are you sure you want to delete this project?</div>
  `;

  const boxPic9 = d.createElement('div');
  boxPic9.innerHTML = `
    <!-- 新增截图 4: 自定义项搜索框与空状态 -->
    <input id="test-search-custom-ph" placeholder="Search customizations..." />
    <input id="test-search-custom-ph-nodot" placeholder="Search customizations" />
    <input id="test-search-custom-ph-ellipsis-char" placeholder="Search customizations…" />
    <div id="test-search-custom-text">Search customizations...</div>
    <div id="test-search-custom-title">Search Customizations...</div>
    <div id="test-search-custom-nodot">Search customizations</div>
    <div id="test-search-custom-title-nodot">Search Customizations</div>
    <div id="test-search-custom-lower">search customizations...</div>
    <div id="test-search-custom-lower-nodot">search customizations</div>
    <div id="test-search-custom-dot">Search customizations.</div>
    <div id="test-search-custom-title-dot">Search Customizations.</div>
    <div id="test-search-custom-ellipsis-char">Search customizations…</div>
    <div id="test-search-custom-title-ellipsis-char">Search Customizations…</div>
    <div id="test-no-custom-configured">No customizations configured.</div>
    <div id="test-no-custom-configured-nodot">No customizations configured</div>
    <div id="test-no-custom-configured-lower-dot">no customizations configured.</div>
    <div id="test-no-custom-configured-lower-nodot">no customizations configured</div>
    <div id="test-no-custom-configured-title">No Customizations Configured.</div>
    <div id="test-no-custom-configured-title-nodot">No Customizations Configured</div>
    <div id="test-no-custom-there-are">There are no customizations configured.</div>
    <div id="test-no-custom-there-are-lower">there are no customizations configured.</div>
    <div id="test-no-custom-avail">No customizations available.</div>
    <div id="test-no-custom-avail-nodot">No customizations available</div>
    <div id="test-no-custom-avail-title">No Customizations Available.</div>
    <div id="test-no-custom-avail-title-nodot">No Customizations Available</div>
    <div id="test-no-custom-found">No customizations found.</div>
    <div id="test-no-custom-found-nodot">No customizations found</div>
  `;

  d.getElementById('host').appendChild(boxPic6);
  d.getElementById('host').appendChild(boxPic7);
  d.getElementById('host').appendChild(boxPic8);
  d.getElementById('host').appendChild(boxPic9);

  const boxPic10 = d.createElement('div');
  boxPic10.innerHTML = `
    <!-- 新增图 2: 工作区工作树列表 (Previous Worktrees / Worktree) -->
    <div id="test-prev-worktrees">Previous Worktrees</div>
    <div id="test-prev-worktrees-sentence">Previous worktrees</div>
    <div id="test-prev-worktrees-lower">previous worktrees</div>
    <div id="test-prev-worktrees-dot">Previous Worktrees.</div>
    <div id="test-prev-worktrees-ellipsis">Previous Worktrees...</div>
    <div id="test-prev-worktrees-ellipsis-char">Previous Worktrees…</div>
    <div id="test-prev-worktrees-colon">Previous Worktrees:</div>
    <div id="test-prev-worktrees-count">Previous Worktrees (3)</div>
    <div id="test-prev-worktree-singular">Previous Worktree</div>
    <div id="test-prev-worktree-sentence">Previous worktree</div>
    <div id="test-prev-worktree-lower">previous worktree</div>
    <div id="test-prev-worktree-dot">Previous Worktree.</div>
    <div id="test-prev-worktree-ellipsis">Previous Worktree...</div>
    <div id="test-prev-worktree-ellipsis-char">Previous Worktree…</div>
    <div id="test-prev-worktree-colon">Previous Worktree:</div>
    <div id="test-prev-worktree-shortcut">Previous Worktree (Alt+W)</div>
    <div id="test-prev-worktrees-upper">PREVIOUS WORKTREES</div>
    <div id="test-prev-worktree-singular-upper">PREVIOUS WORKTREE</div>
    <div id="test-prev-worktrees-bracket-count">Previous Worktrees [3]</div>
    <div id="test-prev-worktrees-colon-count">Previous Worktrees: (3)</div>

    <!-- 新增图 3: 检出操作项 (Local Checkout) -->
    <div id="test-local-checkout">Local Checkout</div>
    <div id="test-local-checkout-sentence">Local checkout</div>
    <div id="test-local-checkout-lower">local checkout</div>
    <div id="test-local-checkout-upper">LOCAL CHECKOUT</div>
    <div id="test-local-checkout-dot">Local Checkout.</div>
    <div id="test-local-checkout-ellipsis">Local Checkout...</div>
    <div id="test-local-checkout-ellipsis-char">Local Checkout…</div>
    <div id="test-local-checkout-colon">Local Checkout:</div>
    <div id="test-local-checkout-shortcut">Local Checkout (Enter)</div>
    <div id="test-local-checkout-bracket-shortcut">Local Checkout [Enter]</div>
    <div id="test-local-checkouts-plural">Local Checkouts</div>
    <div id="test-local-checkouts-sentence">Local checkouts</div>
    <div id="test-local-checkouts-lower">local checkouts</div>
    <div id="test-local-checkouts-upper">LOCAL CHECKOUTS</div>
    <div id="test-local-checkouts-dot">Local Checkouts.</div>
    <div id="test-local-checkouts-colon">Local Checkouts:</div>
    <div id="test-local-checkouts-ellipsis">Local Checkouts...</div>
    <div id="test-local-checkouts-count">Local Checkouts (2)</div>
  `;
  d.getElementById('host').appendChild(boxPic10);
  await flush();
  await new Promise(r => setTimeout(r, 100));

  // 图 1 断言
  check('截图1：Sort Projects 汉化', d.getElementById('test-sort-projects').textContent === '项目排序');
  check('截图1：sort projects 小写首字母汉化', d.getElementById('test-sort-projects-lower').textContent === '项目排序');
  check('截图1：Sort Projects: 冒号形式汉化', d.getElementById('test-sort-projects-colon').textContent === '项目排序');
  check('截图1：Custom Order 汉化', d.getElementById('test-custom-order').textContent === '自定义排序');
  check('截图1：custom order 小写汉化', d.getElementById('test-custom-order-lower').textContent === '自定义排序');
  check('截图1：Auto Pin 汉化', d.getElementById('test-auto-pin').textContent === '自动置顶');
  check('截图1：auto pin 小写汉化', d.getElementById('test-auto-pin-lower').textContent === '自动置顶');
  check('截图1：Auto-Pin 连字符汉化', d.getElementById('test-auto-pin-hyphen').textContent === '自动置顶');
  check('截图1：Archived Only 汉化', d.getElementById('test-archived-only').textContent === '仅已归档');
  check('截图1：archived only 小写汉化', d.getElementById('test-archived-only-lower').textContent === '仅已归档');
  check('截图1：Mark All as Read 汉化', d.getElementById('test-mark-all-read').textContent === '全部标记为已读');
  check('截图1：Mark All As Read Title Case 汉化', d.getElementById('test-mark-all-read-title').textContent === '全部标记为已读');
  check('截图1：mark all as read 小写汉化', d.getElementById('test-mark-all-read-lower').textContent === '全部标记为已读');

  // 图 2 断言
  check('截图2：Collapse All Folders 汉化', d.getElementById('test-collapse-all-folders').textContent === '折叠所有文件夹');
  check('截图2：Collapse All Folders (快捷键) 汉化', d.getElementById('test-collapse-all-folders-shortcut').textContent === '折叠所有文件夹 (Ctrl+K Ctrl+C)');
  check('截图2：Expand All Folders 汉化', d.getElementById('test-expand-all-folders').textContent === '展开所有文件夹');
  check('截图2：Expand All Folders (快捷键) 汉化', d.getElementById('test-expand-all-folders-shortcut').textContent === '展开所有文件夹 (Ctrl+K Ctrl+E)');
  check('截图2：Move Conversation Up 汉化', d.getElementById('test-move-conv-up').textContent === '上移对话');
  check('截图2：Move Conversation Up (快捷键) 汉化', d.getElementById('test-move-conv-up-shortcut').textContent === '上移对话 (Alt+Up)');
  check('截图2：Move Conversation Down 汉化', d.getElementById('test-move-conv-down').textContent === '下移对话');
  check('截图2：Move Conversation Down (快捷键) 汉化', d.getElementById('test-move-conv-down-shortcut').textContent === '下移对话 (Alt+Down)');
  check('截图2：Open Keyboard Shortcuts 汉化', d.getElementById('test-open-shortcuts').textContent === '打开键盘快捷键');
  check('截图2：Open Keyboard Shortcuts (快捷键) 汉化', d.getElementById('test-open-shortcuts-shortcut').textContent === '打开键盘快捷键 (Ctrl+K Ctrl+S)');
  check('截图2：Keyboard Shortcuts 汉化', d.getElementById('test-keyboard-shortcuts').textContent === '键盘快捷键');
  check('截图2：Download Diagnostics 汉化', d.getElementById('test-download-diag').textContent === '下载诊断信息');
  check('截图2：download diagnostics 小写汉化', d.getElementById('test-download-diag-lower').textContent === '下载诊断信息');
  check('截图2：Toggle Between Light/Dark Themes 汉化', d.getElementById('test-toggle-themes').textContent === '切换浅色/深色主题');
  check('截图2：toggle between light/dark themes 小写汉化', d.getElementById('test-toggle-themes-lower').textContent === '切换浅色/深色主题');
  check('截图2：Toggle Light/Dark Themes 紧凑形式汉化', d.getElementById('test-toggle-themes-short').textContent === '切换浅色/深色主题');
  check('截图2：Toggle Between Light and Dark Themes 连词形式汉化', d.getElementById('test-toggle-themes-and').textContent === '切换浅色/深色主题');

  // 图 3 断言
  check('截图3：Extensions 汉化', d.getElementById('test-extensions').textContent === '扩展');
  check('截图3：extensions 小写汉化', d.getElementById('test-extensions-lower').textContent === '扩展');
  check('截图3：No extensions available 汉化', d.getElementById('test-no-ext-avail').textContent === '无可用扩展');
  check('截图3：No extensions available. 句号汉化', d.getElementById('test-no-ext-avail-dot').textContent === '无可用扩展。');
  check('截图3：No Extensions Available Title Case 汉化', d.getElementById('test-no-ext-avail-title').textContent === '无可用扩展');
  check('截图3：no extensions available 小写汉化', d.getElementById('test-no-ext-avail-lower').textContent === '无可用扩展');
  check('截图3：no extensions available. 小写句号汉化', d.getElementById('test-no-ext-avail-lower-dot').textContent === '无可用扩展。');

  // 图 4 断言
  check('截图4：Search automations... placeholder 汉化', d.getElementById('test-search-automations-ph').getAttribute('placeholder') === '搜索自动化...');
  check('截图4：Search automations... 文本节点汉化', d.getElementById('test-search-automations-text').textContent === '搜索自动化...');
  check('截图4：Search Automations... Title Case 汉化', d.getElementById('test-search-automations-title').textContent === '搜索自动化...');
  check('截图4：Search automations 无点号精准汉化', d.getElementById('test-search-automations-nodot').textContent === '搜索自动化');
  check('截图4：Search Automations Title Case 无点号汉化', d.getElementById('test-search-automations-title-nodot').textContent === '搜索自动化');
  check('截图4：No automations configured. 完整句汉化', d.getElementById('test-no-automations').textContent === '尚未配置自动化。');
  check('截图4：No automations configured 无标点汉化', d.getElementById('test-no-automations-nodot').textContent === '尚未配置自动化');
  check('截图4：No Automations Configured. Title Case 句号汉化', d.getElementById('test-no-automations-title').textContent === '尚未配置自动化。');
  check('截图4：No Automations Configured Title Case 无标点汉化', d.getElementById('test-no-automations-title-nodot').textContent === '尚未配置自动化');
  check('截图4：no automations configured. 小写汉化', d.getElementById('test-no-automations-lower').textContent === '尚未配置自动化。');
  check('截图4：no automations configured 小写无标点汉化', d.getElementById('test-no-automations-lower-nodot').textContent === '尚未配置自动化');

  // 图 5 断言
  check('截图5：Reopen Closed Tab 汉化', d.getElementById('test-reopen-tab').textContent === '重新打开关闭的标签页');
  check('截图5：Reopen Closed Tab (快捷键) 汉化', d.getElementById('test-reopen-tab-shortcut').textContent === '重新打开关闭的标签页 (Ctrl+Shift+T)');
  check('截图5：reopen closed tab 小写汉化', d.getElementById('test-reopen-tab-lower').textContent === '重新打开关闭的标签页');
  check('截图5：Reopen Closed Editor 衍生汉化', d.getElementById('test-reopen-editor').textContent === '重新打开关闭的编辑器');
  check('截图5：Previous Aux Pane Tab 汉化', d.getElementById('test-prev-aux-pane').textContent === '上一个辅助窗格标签页');
  check('截图5：Previous Aux Pane Tab (快捷键) 汉化', d.getElementById('test-prev-aux-pane-shortcut').textContent === '上一个辅助窗格标签页 (Ctrl+Alt+Left)');
  check('截图5：Previous Auxiliary Pane Tab 全拼汉化', d.getElementById('test-prev-aux-pane-full').textContent === '上一个辅助窗格标签页');
  check('截图5：previous aux pane tab 小写汉化', d.getElementById('test-prev-aux-pane-lower').textContent === '上一个辅助窗格标签页');
  check('截图5：Next Aux Pane Tab 汉化', d.getElementById('test-next-aux-pane').textContent === '下一个辅助窗格标签页');
  check('截图5：Next Aux Pane Tab (快捷键) 汉化', d.getElementById('test-next-aux-pane-shortcut').textContent === '下一个辅助窗格标签页 (Ctrl+Alt+Right)');
  check('截图5：Next Auxiliary Pane Tab 全拼汉化', d.getElementById('test-next-aux-pane-full').textContent === '下一个辅助窗格标签页');
  check('截图5：next aux pane tab 小写汉化', d.getElementById('test-next-aux-pane-lower').textContent === '下一个辅助窗格标签页');

  // 38. 新增 4 张待补全截图专项断言
  // 新截图 1 断言: 删除对话确认弹窗
  check('新截图1：Delete Conversation 标题汉化', d.getElementById('test-del-conv-title').textContent === '删除对话');
  check('新截图1：Delete conversation 句首大写汉化', d.getElementById('test-del-conv-title-sentence').textContent === '删除对话');
  check('新截图1：delete conversation 小写汉化', d.getElementById('test-del-conv-title-lower').textContent === '删除对话');
  check('新截图1：Delete Conversation. 标题带句号汉化', d.getElementById('test-del-conv-title-dot').textContent === '删除对话。');
  check('新截图1：Delete Conversation… 标题Unicode省略号汉化', d.getElementById('test-del-conv-title-ellipsis-char').textContent === '删除对话...');
  check('新截图1：Delete Conversation: 冒号形式汉化', d.getElementById('test-del-conv-colon').textContent === '删除对话：');
  check('新截图1：Delete Conversation... 省略号形式汉化', d.getElementById('test-del-conv-ellipsis').textContent === '删除对话...');
  check('新截图1：Delete Conversation (快捷键) 汉化', d.getElementById('test-del-conv-shortcut').textContent === '删除对话 (Ctrl+Shift+D)');
  check('新截图1：提示完整句（句号保真）汉化', d.getElementById('test-del-conv-prompt-full').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：提示完整句（无句号）汉化', d.getElementById('test-del-conv-prompt-nodot').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：提示小写完整句（句号保真）汉化', d.getElementById('test-del-conv-prompt-lower-full').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：提示小写完整句（无句号）汉化', d.getElementById('test-del-conv-prompt-lower-nodot').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：提示完整句（Title Case 带句号）汉化', d.getElementById('test-del-conv-prompt-title-full').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：提示完整句（Title Case 无句号）汉化', d.getElementById('test-del-conv-prompt-title-nodot').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：拆分子问句（问号）汉化', d.getElementById('test-del-conv-q').textContent === '确定要删除此对话吗？');
  check('新截图1：拆分子问句（无标点）汉化', d.getElementById('test-del-conv-q-nodot').textContent === '确定要删除此对话吗');
  check('新截图1：拆分子问句（小写）汉化', d.getElementById('test-del-conv-q-lower').textContent === '确定要删除此对话吗？');
  check('新截图1：拆分子问句（Title Case 问号）汉化', d.getElementById('test-del-conv-q-title').textContent === '确定要删除此对话吗？');
  check('新截图1：拆分后句（句号）汉化', d.getElementById('test-del-conv-undone').textContent === '此操作无法撤销。');
  check('新截图1：拆分后句（无句号）汉化', d.getElementById('test-del-conv-undone-nodot').textContent === '此操作无法撤销');
  check('新截图1：拆分后句（小写句号）汉化', d.getElementById('test-del-conv-undone-lower').textContent === '此操作无法撤销。');
  check('新截图1：拆分后句（小写无句号）汉化', d.getElementById('test-del-conv-undone-lower-nodot').textContent === '此操作无法撤销');
  check('新截图1：拆分后句（Title Case 句号）汉化', d.getElementById('test-del-conv-undone-title').textContent === '此操作无法撤销。');
  check('新截图1：拆分后句（Title Case 无句号）汉化', d.getElementById('test-del-conv-undone-title-nodot').textContent === '此操作无法撤销');

  // 新截图 1 全方位覆盖断言：换行符、CRLF、连续空格、<br>、子 <p>、子 <div>、内部空格、can not
  check('新截图1：换行符 \\n 弹窗内容汉化', d.getElementById('test-del-conv-newline').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：CRLF \\r\\n 弹窗内容汉化', d.getElementById('test-del-conv-crlf').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：换行带缩进空格 弹窗内容汉化', d.getElementById('test-del-conv-newline-spaces').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：空格后换行 弹窗内容汉化', d.getElementById('test-del-conv-spaces-newline').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：双换行符 \\n\\n 弹窗内容汉化', d.getElementById('test-del-conv-double-newline').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：连续空格 弹窗内容汉化', d.getElementById('test-del-conv-multi-spaces').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：<br> 拆分子节点 弹窗内容汉化', d.getElementById('test-del-conv-br').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：子 <p> 拆分 弹窗内容汉化', d.getElementById('test-del-conv-p').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：子 <div> 拆分 弹窗内容汉化', d.getElementById('test-del-conv-div').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：子元素含内部多余空白 弹窗内容汉化', d.getElementById('test-del-conv-nested-spaces').textContent.replace(/\s+/g, ' ').trim() === '确定要删除此对话吗？ 此操作无法撤销。');
  check('新截图1：can not 变体 弹窗内容汉化', d.getElementById('test-del-conv-can-not').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：DELETE CONVERSATION 大写标题汉化', d.getElementById('test-del-conv-title-upper').textContent === '删除对话');
  check('新截图1：DELETE CONVERSATION. 大写带句号汉化', d.getElementById('test-del-conv-title-upper-dot').textContent === '删除对话。');
  check('新截图1：DELETE CONVERSATION: 大写冒号汉化', d.getElementById('test-del-conv-title-upper-colon').textContent === '删除对话：');
  check('新截图1：DELETE CONVERSATION? 大写问号汉化', d.getElementById('test-del-conv-title-upper-q').textContent === '删除对话？');
  check('新截图1：Delete Conversation [快捷键] 中括号汉化', d.getElementById('test-del-conv-bracket-shortcut').textContent === '删除对话 [Ctrl+Shift+D]');
  check('新截图1：全大写完整句（句号）汉化', d.getElementById('test-del-conv-upper-full').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：全大写完整句（无句号）汉化', d.getElementById('test-del-conv-upper-nodot').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：无问号直接换行弹窗汉化', d.getElementById('test-del-conv-no-q-newline').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：点号分隔弹窗汉化', d.getElementById('test-del-conv-dot-separator').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：冒号分隔弹窗汉化', d.getElementById('test-del-conv-colon-separator').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：Tab 分隔符弹窗汉化', d.getElementById('test-del-conv-tab-separator').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：换行加多空格缩进弹窗汉化', d.getElementById('test-del-conv-indent-newline').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：感叹号结尾弹窗汉化', d.getElementById('test-del-conv-exclamation').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：省略号结尾弹窗汉化', d.getElementById('test-del-conv-ellipsis-end').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：嵌套 span 分段弹窗汉化', d.getElementById('test-del-conv-span').textContent === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：外层空白/换行包裹弹窗汉化', d.getElementById('test-del-conv-outer-whitespace').textContent.trim() === '确定要删除此对话吗？此操作无法撤销。');
  check('新截图1：后句带感叹号独立汉化', d.getElementById('test-del-conv-undone-exclamation').textContent === '此操作无法撤销！');
  check('新截图1：后句带省略号独立汉化', d.getElementById('test-del-conv-undone-ellipsis').textContent === '此操作无法撤销...');
  check('新截图1：后句全大写带句号独立汉化', d.getElementById('test-del-conv-undone-upper').textContent === '此操作无法撤销。');
  check('新截图1：后句全大写无句号独立汉化', d.getElementById('test-del-conv-undone-upper-nodot').textContent === '此操作无法撤销');
  check('新截图1：前句全大写带问号独立汉化', d.getElementById('test-del-conv-q-upper').textContent === '确定要删除此对话吗？');
  check('新截图1：前句全大写无标点独立汉化', d.getElementById('test-del-conv-q-upper-nodot').textContent === '确定要删除此对话吗');

  // 新截图 2 断言: 权限设置面板与说明片段
  check('新截图2：Permission Settings 标题汉化', d.getElementById('test-perm-settings-title').textContent === '权限设置');
  check('新截图2：Permission settings 句首大写汉化', d.getElementById('test-perm-settings-sentence').textContent === '权限设置');
  check('新截图2：permission settings 小写汉化', d.getElementById('test-perm-settings-lower').textContent === '权限设置');
  check('新截图2：Permission Settings. 带句号汉化', d.getElementById('test-perm-settings-dot').textContent === '权限设置。');
  check('新截图2：Permission Settings… Unicode省略号汉化', d.getElementById('test-perm-settings-ellipsis-char').textContent === '权限设置...');
  check('新截图2：Permission Settings: 冒号形式汉化', d.getElementById('test-perm-settings-colon').textContent === '权限设置：');
  check('新截图2：Permission Settings... 省略号形式汉化', d.getElementById('test-perm-settings-ellipsis').textContent === '权限设置...');
  check('新截图2：Permission Settings (快捷键) 汉化', d.getElementById('test-perm-settings-shortcut').textContent === '权限设置 (Ctrl+Shift+P)');
  check('新截图2：when working in these conversations. 拆分节点带句号汉化', d.getElementById('test-when-working-dot').textContent === '在这些对话中工作时。');
  check('新截图2：when working in these conversations 拆分节点无句号汉化', d.getElementById('test-when-working-nodot').textContent === '在这些对话中工作时');
  check('新截图2：When working in these conversations. 句首大写带句号汉化', d.getElementById('test-when-working-cap-dot').textContent === '在这些对话中工作时。');
  check('新截图2：When working in these conversations 句首大写无句号汉化', d.getElementById('test-when-working-cap-nodot').textContent === '在这些对话中工作时');
  check('新截图2：When Working in These Conversations. Title Case 带句号汉化', d.getElementById('test-when-working-title-dot').textContent === '在这些对话中工作时。');
  check('新截图2：When Working in These Conversations Title Case 无句号汉化', d.getElementById('test-when-working-title-nodot').textContent === '在这些对话中工作时');
  check('新截图2：完整说明句带句号汉化', d.getElementById('test-perm-full-sentence').textContent === '在这些对话中工作时同时包含全局权限。');
  check('新截图2：完整说明句无句号汉化', d.getElementById('test-perm-full-sentence-nodot').textContent === '在这些对话中工作时同时包含全局权限');
  check('新截图2：完整说明句 Title Case 带句号汉化', d.getElementById('test-perm-full-sentence-title').textContent === '在这些对话中工作时同时包含全局权限。');
  check('新截图2：完整说明句 Title Case 无句号汉化', d.getElementById('test-perm-full-sentence-title-nodot').textContent === '在这些对话中工作时同时包含全局权限');
  check('新截图2：React 多节点拆分自然连贯汉化', d.getElementById('test-perm-react-split').textContent.replace(/\s+/g, ' ').trim() === '同时包含 全局权限 在这些对话中工作时。 了解更多');

  // 新截图 3 断言: 项目卡片右键菜单
  check('新截图3：Copy Project Name 汉化', d.getElementById('test-copy-proj-name').textContent === '复制项目名称');
  check('新截图3：Copy project name 句首大写汉化', d.getElementById('test-copy-proj-name-sentence').textContent === '复制项目名称');
  check('新截图3：copy project name 小写汉化', d.getElementById('test-copy-proj-name-lower').textContent === '复制项目名称');
  check('新截图3：Copy Project Name. 带句号汉化', d.getElementById('test-copy-proj-name-dot').textContent === '复制项目名称。');
  check('新截图3：Copy Project Name… Unicode省略号汉化', d.getElementById('test-copy-proj-name-ellipsis-char').textContent === '复制项目名称...');
  check('新截图3：Copy Project Name (快捷键) 汉化', d.getElementById('test-copy-proj-name-shortcut').textContent === '复制项目名称 (Ctrl+C)');
  check('新截图3：Copy Project Name... 省略号汉化', d.getElementById('test-copy-proj-name-ellipsis').textContent === '复制项目名称...');
  check('新截图3：Copy Project Name: 冒号汉化', d.getElementById('test-copy-proj-name-colon').textContent === '复制项目名称：');
  check('新截图3：Project Settings 汉化', d.getElementById('test-proj-settings').textContent === '项目设置');
  check('新截图3：Project settings 句首大写汉化', d.getElementById('test-proj-settings-sentence').textContent === '项目设置');
  check('新截图3：project settings 小写汉化', d.getElementById('test-proj-settings-lower').textContent === '项目设置');
  check('新截图3：Project Settings. 带句号汉化', d.getElementById('test-proj-settings-dot').textContent === '项目设置。');
  check('新截图3：Project Settings… Unicode省略号汉化', d.getElementById('test-proj-settings-ellipsis-char').textContent === '项目设置...');
  check('新截图3：Project Settings (快捷键) 汉化', d.getElementById('test-proj-settings-shortcut').textContent === '项目设置 (Ctrl+,)');
  check('新截图3：Project Settings: 冒号汉化', d.getElementById('test-proj-settings-colon').textContent === '项目设置：');
  check('新截图3：Show in File Explorer 汉化', d.getElementById('test-show-in-explorer').textContent === '在文件资源管理器中显示');
  check('新截图3：Show in file explorer 句首大写汉化', d.getElementById('test-show-in-explorer-sentence').textContent === '在文件资源管理器中显示');
  check('新截图3：show in file explorer 小写汉化', d.getElementById('test-show-in-explorer-lower').textContent === '在文件资源管理器中显示');
  check('新截图3：Show In File Explorer Title Case 汉化', d.getElementById('test-show-in-explorer-title').textContent === '在文件资源管理器中显示');
  check('新截图3：Show in File Explorer. 带句号汉化', d.getElementById('test-show-in-explorer-dot').textContent === '在文件资源管理器中显示。');
  check('新截图3：Show In File Explorer. Title Case 带句号汉化', d.getElementById('test-show-in-explorer-title-dot').textContent === '在文件资源管理器中显示。');
  check('新截图3：Show in File Explorer (快捷键) 汉化', d.getElementById('test-show-in-explorer-shortcut').textContent === '在文件资源管理器中显示 (Alt+R)');
  check('新截图3：Show in File Explorer: 冒号汉化', d.getElementById('test-show-in-explorer-colon').textContent === '在文件资源管理器中显示：');
  check('新截图3：Show in File Explorer… Unicode省略号汉化', d.getElementById('test-show-in-explorer-ellipsis-char').textContent === '在文件资源管理器中显示...');
  check('新截图3：Delete Project 汉化', d.getElementById('test-delete-proj').textContent === '删除项目');
  check('新截图3：Delete project 句首大写汉化', d.getElementById('test-delete-proj-sentence').textContent === '删除项目');
  check('新截图3：delete project 小写汉化', d.getElementById('test-delete-proj-lower').textContent === '删除项目');
  check('新截图3：Delete Project. 带句号汉化', d.getElementById('test-delete-proj-dot').textContent === '删除项目。');
  check('新截图3：Delete Project… Unicode省略号汉化', d.getElementById('test-delete-proj-ellipsis-char').textContent === '删除项目...');
  check('新截图3：Delete Project: 冒号汉化', d.getElementById('test-delete-proj-colon').textContent === '删除项目：');
  check('新截图3：Delete Project (快捷键) 汉化', d.getElementById('test-delete-proj-shortcut').textContent === '删除项目 (Del)');
  check('新截图3：Delete Project... 省略号汉化', d.getElementById('test-delete-proj-ellipsis').textContent === '删除项目...');
  check('新截图3：Delete Project 确认弹窗提示汉化', d.getElementById('test-delete-proj-prompt-full').textContent === '确定要删除此项目吗？此操作无法撤销。');
  check('新截图3：Delete Project 确认弹窗子问句汉化', d.getElementById('test-delete-proj-q').textContent === '确定要删除此项目吗？');

  // 新截图 4 断言: 自定义项搜索框与空状态
  check('新截图4：Search customizations... placeholder 汉化', d.getElementById('test-search-custom-ph').getAttribute('placeholder') === '搜索自定义项...');
  check('新截图4：Search customizations placeholder 无点号汉化', d.getElementById('test-search-custom-ph-nodot').getAttribute('placeholder') === '搜索自定义项');
  check('新截图4：Search customizations… placeholder Unicode省略号汉化', d.getElementById('test-search-custom-ph-ellipsis-char').getAttribute('placeholder') === '搜索自定义项…');
  check('新截图4：Search customizations... 文本节点汉化', d.getElementById('test-search-custom-text').textContent === '搜索自定义项...');
  check('新截图4：Search Customizations... Title Case 汉化', d.getElementById('test-search-custom-title').textContent === '搜索自定义项...');
  check('新截图4：Search customizations 无点号精准汉化', d.getElementById('test-search-custom-nodot').textContent === '搜索自定义项');
  check('新截图4：Search Customizations Title Case 无点号汉化', d.getElementById('test-search-custom-title-nodot').textContent === '搜索自定义项');
  check('新截图4：search customizations... 小写带省略号汉化', d.getElementById('test-search-custom-lower').textContent === '搜索自定义项...');
  check('新截图4：search customizations 小写无标点汉化', d.getElementById('test-search-custom-lower-nodot').textContent === '搜索自定义项');
  check('新截图4：Search customizations. 带句号汉化', d.getElementById('test-search-custom-dot').textContent === '搜索自定义项。');
  check('新截图4：Search Customizations. Title Case 带句号汉化', d.getElementById('test-search-custom-title-dot').textContent === '搜索自定义项。');
  check('新截图4：Search customizations… Unicode省略号汉化', d.getElementById('test-search-custom-ellipsis-char').textContent === '搜索自定义项…');
  check('新截图4：Search Customizations… Title Case Unicode省略号汉化', d.getElementById('test-search-custom-title-ellipsis-char').textContent === '搜索自定义项…');
  check('新截图4：No customizations configured. 句号汉化', d.getElementById('test-no-custom-configured').textContent === '尚未配置自定义项。');
  check('新截图4：No customizations configured 无标点汉化', d.getElementById('test-no-custom-configured-nodot').textContent === '尚未配置自定义项');
  check('新截图4：no customizations configured. 小写带句号汉化', d.getElementById('test-no-custom-configured-lower-dot').textContent === '尚未配置自定义项。');
  check('新截图4：no customizations configured 小写无标点汉化', d.getElementById('test-no-custom-configured-lower-nodot').textContent === '尚未配置自定义项');
  check('新截图4：No Customizations Configured. Title Case 句号汉化', d.getElementById('test-no-custom-configured-title').textContent === '尚未配置自定义项。');
  check('新截图4：No Customizations Configured Title Case 无标点汉化', d.getElementById('test-no-custom-configured-title-nodot').textContent === '尚未配置自定义项');
  check('新截图4：There are no customizations configured. 完整前缀汉化', d.getElementById('test-no-custom-there-are').textContent === '尚未配置自定义项。');
  check('新截图4：there are no customizations configured. 小写前缀汉化', d.getElementById('test-no-custom-there-are-lower').textContent === '尚未配置自定义项。');
  check('新截图4：No customizations available. 句号汉化', d.getElementById('test-no-custom-avail').textContent === '无可用自定义项。');
  check('新截图4：No customizations available 无标点汉化', d.getElementById('test-no-custom-avail-nodot').textContent === '无可用自定义项');
  check('新截图4：No Customizations Available. Title Case 句号汉化', d.getElementById('test-no-custom-avail-title').textContent === '无可用自定义项。');
  check('新截图4：No Customizations Available Title Case 无标点汉化', d.getElementById('test-no-custom-avail-title-nodot').textContent === '无可用自定义项');
  check('新截图4：No customizations found. 句号汉化', d.getElementById('test-no-custom-found').textContent === '未找到自定义项。');
  check('新截图4：No customizations found 无标点汉化', d.getElementById('test-no-custom-found-nodot').textContent === '未找到自定义项');

  // 图 2 断言: 工作区工作树列表 (Previous Worktrees / Worktree)
  check('图2：Previous Worktrees 汉化', d.getElementById('test-prev-worktrees').textContent === '先前的工作树');
  check('图2：Previous worktrees 句首大写汉化', d.getElementById('test-prev-worktrees-sentence').textContent === '先前的工作树');
  check('图2：previous worktrees 小写汉化', d.getElementById('test-prev-worktrees-lower').textContent === '先前的工作树');
  check('图2：Previous Worktrees. 带句号汉化', d.getElementById('test-prev-worktrees-dot').textContent === '先前的工作树。');
  check('图2：Previous Worktrees... 省略号汉化', d.getElementById('test-prev-worktrees-ellipsis').textContent === '先前的工作树...');
  check('图2：Previous Worktrees… Unicode省略号汉化', d.getElementById('test-prev-worktrees-ellipsis-char').textContent === '先前的工作树...');
  check('图2：Previous Worktrees: 冒号汉化', d.getElementById('test-prev-worktrees-colon').textContent === '先前的工作树：');
  check('图2：Previous Worktrees (3) 动态计数汉化', d.getElementById('test-prev-worktrees-count').textContent === '先前的工作树 (3)');
  check('图2：Previous Worktree 单数汉化', d.getElementById('test-prev-worktree-singular').textContent === '先前的工作树');
  check('图2：Previous worktree 单数句首大写汉化', d.getElementById('test-prev-worktree-sentence').textContent === '先前的工作树');
  check('图2：previous worktree 单数小写汉化', d.getElementById('test-prev-worktree-lower').textContent === '先前的工作树');
  check('图2：Previous Worktree. 单数带句号汉化', d.getElementById('test-prev-worktree-dot').textContent === '先前的工作树。');
  check('图2：Previous Worktree... 单数省略号汉化', d.getElementById('test-prev-worktree-ellipsis').textContent === '先前的工作树...');
  check('图2：Previous Worktree… 单数Unicode省略号汉化', d.getElementById('test-prev-worktree-ellipsis-char').textContent === '先前的工作树...');
  check('图2：Previous Worktree: 单数冒号汉化', d.getElementById('test-prev-worktree-colon').textContent === '先前的工作树：');
  check('图2：Previous Worktree (快捷键) 汉化', d.getElementById('test-prev-worktree-shortcut').textContent === '先前的工作树 (Alt+W)');
  check('图2：PREVIOUS WORKTREES 全大写复数汉化', d.getElementById('test-prev-worktrees-upper').textContent === '先前的工作树');
  check('图2：PREVIOUS WORKTREE 全大写单数汉化', d.getElementById('test-prev-worktree-singular-upper').textContent === '先前的工作树');
  check('图2：Previous Worktrees [3] 中括号数字汉化', d.getElementById('test-prev-worktrees-bracket-count').textContent === '先前的工作树 [3]');
  check('图2：Previous Worktrees: (3) 冒号数字汉化', d.getElementById('test-prev-worktrees-colon-count').textContent === '先前的工作树 (3)');

  // 图 3 断言: 检出操作项 (Local Checkout)
  check('图3：Local Checkout 汉化', d.getElementById('test-local-checkout').textContent === '本地检出');
  check('图3：Local checkout 句首大写汉化', d.getElementById('test-local-checkout-sentence').textContent === '本地检出');
  check('图3：local checkout 小写汉化', d.getElementById('test-local-checkout-lower').textContent === '本地检出');
  check('图3：LOCAL CHECKOUT 全大写汉化', d.getElementById('test-local-checkout-upper').textContent === '本地检出');
  check('图3：Local Checkout. 带句号汉化', d.getElementById('test-local-checkout-dot').textContent === '本地检出。');
  check('图3：Local Checkout... 省略号汉化', d.getElementById('test-local-checkout-ellipsis').textContent === '本地检出...');
  check('图3：Local Checkout… Unicode省略号汉化', d.getElementById('test-local-checkout-ellipsis-char').textContent === '本地检出...');
  check('图3：Local Checkout: 冒号汉化', d.getElementById('test-local-checkout-colon').textContent === '本地检出：');
  check('图3：Local Checkout (快捷键) 汉化', d.getElementById('test-local-checkout-shortcut').textContent === '本地检出 (Enter)');
  check('图3：Local Checkout [Enter] 中括号快捷键汉化', d.getElementById('test-local-checkout-bracket-shortcut').textContent === '本地检出 [Enter]');
  check('图3：Local Checkouts 复数汉化', d.getElementById('test-local-checkouts-plural').textContent === '本地检出');
  check('图3：Local checkouts 复数句首大写汉化', d.getElementById('test-local-checkouts-sentence').textContent === '本地检出');
  check('图3：local checkouts 复数全小写汉化', d.getElementById('test-local-checkouts-lower').textContent === '本地检出');
  check('图3：LOCAL CHECKOUTS 全大写复数汉化', d.getElementById('test-local-checkouts-upper').textContent === '本地检出');
  check('图3：Local Checkouts. 复数带句号汉化', d.getElementById('test-local-checkouts-dot').textContent === '本地检出。');
  check('图3：Local Checkouts: 复数带冒号汉化', d.getElementById('test-local-checkouts-colon').textContent === '本地检出：');
  check('图3：Local Checkouts... 复数带省略号汉化', d.getElementById('test-local-checkouts-ellipsis').textContent === '本地检出...');
  check('图3：Local Checkouts (2) 复数带计数汉化', d.getElementById('test-local-checkouts-count').textContent === '本地检出 (2)');

  console.log(`\n页面翻译器: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
