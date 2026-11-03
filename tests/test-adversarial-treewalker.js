// TreeWalker 根节点优化专项对抗性压力测试 (Adversarial Stress Harness for Requirement R3)
// 验证：
// 1. TreeWalker 遍历是否绝不直接检查根节点 (twFilter.acceptNode 与 tw.nextNode() 均不触及 root)
// 2. <textarea> 属性在作为根节点或作为子节点挂载时是否均正确汉化，且其文本内容绝对受保护
// 3. 根节点属性处理逻辑是否在任何正常元素上被过早跳过
// 4. 复杂绝缘根节点（Monaco、pre、code、svg、math、contenteditable 等）是否 100% 跳过 createTreeWalker
// 5. 正常复合容器（带属性与多层子节点）是否属性与文本均正确汉化
// 6. DocumentFragment 挂载场景下绝缘子树与正常子树的处理
// 7. 大批量并发挂载 (>30 节点走异步 schedule) 下绝缘节点的即时剪枝与 jobQueue 防膨胀
// 8. 属性白名单/黑名单边界（只有指定属性被汉化，id/class/value 等绝不被篡改）

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SIM = path.join(__dirname, 'zh-adversarial-sim');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
const SRC = path.join(__dirname, '../src');
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));
const zh = require(path.join(SIM, 'zh-i18n.js'));

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('PASS  ' + name);
  } else {
    fail++;
    const d = typeof detail === 'function' ? (() => { try { return detail(); } catch (e) { return '读取失败: ' + e.message; } })() : detail;
    const msg = 'FAIL  ' + name + (d !== undefined ? '  -> 实际: ' + JSON.stringify(d) : '');
    console.log(msg);
    failures.push(msg);
  }
}

const flush = () => new Promise(r => setTimeout(r, 0));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(cond, timeoutMs = 10000) {
  const start = Date.now();
  let delay = 1;
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 40);
  }
  return false;
}

(async () => {
  console.log('=== 开始 TreeWalker 根节点优化专项对抗性测试 ===\n');

  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="static">Command Palette</div>
    <div id="host"></div>
  </body></html>`, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  const d = w.document;

  // 捕获注入脚本
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
  const scriptEl = d.createElement('script');
  scriptEl.textContent = calls[0];
  d.body.appendChild(scriptEl);

  // 等待初始全页翻译完成
  await waitFor(() => d.getElementById('static').textContent === '命令面板');
  check('初始全页翻译完成', d.getElementById('static').textContent === '命令面板');

  // =========================================================================
  // 1. 全局 createTreeWalker 探针与 Filter 拦截器
  // =========================================================================
  const twLog = []; // 记录所有由翻译引擎发起的 createTreeWalker 调用
  const origCreateTw = d.createTreeWalker;
  d.createTreeWalker = function(root, whatToShow, filter) {
    if (whatToShow === 5) {
      const entry = {
        root: root,
        whatToShow: whatToShow,
        inspectedNodes: [],
        returnedNodes: [],
      };
      twLog.push(entry);

      const wrappedFilter = {
        acceptNode: function(node) {
          entry.inspectedNodes.push(node);
          return (filter && typeof filter.acceptNode === 'function') ? filter.acceptNode(node) : 1;
        }
      };

      const realTw = origCreateTw.call(d, root, whatToShow, wrappedFilter);
      return {
        get root() { return realTw.root; },
        get whatToShow() { return realTw.whatToShow; },
        get filter() { return realTw.filter; },
        get currentNode() { return realTw.currentNode; },
        set currentNode(v) { realTw.currentNode = v; },
        nextNode: function() {
          const n = realTw.nextNode();
          if (n) entry.returnedNodes.push(n);
          return n;
        },
        previousNode: function() { return realTw.previousNode(); },
        parentNode: function() { return realTw.parentNode(); },
        firstChild: function() { return realTw.firstChild(); },
        lastChild: function() { return realTw.lastChild(); },
        previousSibling: function() { return realTw.previousSibling(); },
        nextSibling: function() { return realTw.nextSibling(); },
      };
    }
    return origCreateTw.call(d, root, whatToShow, filter);
  };

  const host = d.getElementById('host');

  // =========================================================================
  // 2. 挑战 1: TreeWalker 绝不检查根节点自身 (Root Element Invariant)
  // =========================================================================
  console.log('\n--- 挑战 1: TreeWalker 根节点免检与遍历隔离 ---');
  {
    const testRoots = [
      { name: 'div 容器', tag: 'div' },
      { name: 'span 行内元素', tag: 'span' },
      { name: 'section 块级元素', tag: 'section' },
      { name: 'button 按钮元素', tag: 'button' },
      { name: 'form 表单容器', tag: 'form' },
      { name: 'a 链接元素', tag: 'a' },
    ];

    for (const item of testRoots) {
      const el = d.createElement(item.tag);
      el.setAttribute('title', 'Settings');
      const child = d.createElement('span');
      child.textContent = 'File';
      el.appendChild(child);

      const beforeLen = twLog.length;
      host.appendChild(el);
      await flush();

      // 验证属性与子节点汉化
      check(`[挑战1] ${item.name}: 根节点 title 属性正常汉化`, el.getAttribute('title') === '设置', () => el.getAttribute('title'));
      check(`[挑战1] ${item.name}: 子节点文本正常汉化`, child.textContent === '文件', () => child.textContent);

      // 检查 TreeWalker 探针
      const engineTws = twLog.slice(beforeLen).filter(entry => entry.root === el);
      check(`[挑战1] ${item.name}: 正常容器创建了 TreeWalker`, engineTws.length === 1);
      if (engineTws.length === 1) {
        const twEntry = engineTws[0];
        check(`[挑战1] ${item.name}: twFilter.acceptNode 绝未检查根节点自身`,
          twEntry.inspectedNodes.indexOf(el) === -1,
          () => twEntry.inspectedNodes.map(n => n.tagName || n.nodeName)
        );
        check(`[挑战1] ${item.name}: tw.nextNode() 绝未返回根节点自身`,
          twEntry.returnedNodes.indexOf(el) === -1,
          () => twEntry.returnedNodes.map(n => n.tagName || n.nodeName)
        );
      }
    }
  }

  // =========================================================================
  // 3. 挑战 2: <textarea> 属性汉化与文本保护 (Root & Nested)
  // =========================================================================
  console.log('\n--- 挑战 2: <textarea> 属性汉化与文本绝对保护 ---');
  {
    // 2.1 作为根节点直接挂载
    const directTa = d.createElement('textarea');
    directTa.setAttribute('placeholder', 'Settings');
    directTa.setAttribute('title', 'Help');
    directTa.setAttribute('aria-label', 'Save');
    directTa.setAttribute('aria-placeholder', 'Open');
    directTa.setAttribute('data-tooltip', 'Close');
    directTa.setAttribute('id', 'Settings'); // 非可译属性，绝对不应被改变
    directTa.setAttribute('name', 'Settings');
    directTa.textContent = 'Settings\nFile\nDo not translate code here';

    const beforeTaLen = twLog.length;
    host.appendChild(directTa);
    await flush();

    check('[挑战2.1] 根 textarea: placeholder 汉化为 "设置"', directTa.getAttribute('placeholder') === '设置', () => directTa.getAttribute('placeholder'));
    check('[挑战2.1] 根 textarea: title 汉化为 "帮助"', directTa.getAttribute('title') === '帮助', () => directTa.getAttribute('title'));
    check('[挑战2.1] 根 textarea: aria-label 汉化为 "保存"', directTa.getAttribute('aria-label') === '保存', () => directTa.getAttribute('aria-label'));
    check('[挑战2.1] 根 textarea: aria-placeholder 汉化为 "打开"', directTa.getAttribute('aria-placeholder') === '打开', () => directTa.getAttribute('aria-placeholder'));
    check('[挑战2.1] 根 textarea: data-tooltip 汉化为 "关闭"', directTa.getAttribute('data-tooltip') === '关闭', () => directTa.getAttribute('data-tooltip'));
    check('[挑战2.1] 根 textarea: id 属性严格保持 "Settings" (黑名单保护)', directTa.getAttribute('id') === 'Settings', () => directTa.getAttribute('id'));
    check('[挑战2.1] 根 textarea: name 属性严格保持 "Settings" (黑名单保护)', directTa.getAttribute('name') === 'Settings', () => directTa.getAttribute('name'));
    check('[挑战2.1] 根 textarea: 内部文本内容严格保持原文不翻译',
      directTa.textContent === 'Settings\nFile\nDo not translate code here',
      () => directTa.textContent
    );
    const taTwCreated = twLog.slice(beforeTaLen).some(e => e.root === directTa);
    check('[挑战2.1] 根 textarea: 属性汉化后直接剪枝，完全跳过 createTreeWalker 创建', !taTwCreated);

    // 2.2 嵌套在普通容器内
    const wrapper = d.createElement('div');
    wrapper.setAttribute('title', 'Settings');
    const nestedTa = d.createElement('textarea');
    nestedTa.setAttribute('placeholder', 'Settings');
    nestedTa.setAttribute('title', 'Help');
    nestedTa.setAttribute('aria-label', 'Save');
    nestedTa.textContent = 'File\nSettings';
    const siblingSpan = d.createElement('span');
    siblingSpan.textContent = 'File';
    wrapper.appendChild(nestedTa);
    wrapper.appendChild(siblingSpan);

    host.appendChild(wrapper);
    await flush();

    check('[挑战2.2] 容器 title 汉化', wrapper.getAttribute('title') === '设置');
    check('[挑战2.2] 嵌套 textarea: placeholder 汉化为 "设置"', nestedTa.getAttribute('placeholder') === '设置', () => nestedTa.getAttribute('placeholder'));
    check('[挑战2.2] 嵌套 textarea: title 汉化为 "帮助"', nestedTa.getAttribute('title') === '帮助', () => nestedTa.getAttribute('title'));
    check('[挑战2.2] 嵌套 textarea: aria-label 汉化为 "保存"', nestedTa.getAttribute('aria-label') === '保存', () => nestedTa.getAttribute('aria-label'));
    check('[挑战2.2] 嵌套 textarea: 内部文本保持英文不汉化', nestedTa.textContent === 'File\nSettings', () => nestedTa.textContent);
    check('[挑战2.2] 嵌套 textarea 兄弟 span 正常汉化为 "文件"', siblingSpan.textContent === '文件', () => siblingSpan.textContent);

    // 2.3 多层深层嵌套中的 textarea
    const deepContainer = d.createElement('div');
    deepContainer.innerHTML = '<div class="card"><div class="card-body"><form><div class="form-group"><textarea placeholder="Settings" title="Help">File</textarea><span>Settings</span></div></form></div></div>';
    host.appendChild(deepContainer);
    await flush();

    const deepTa = deepContainer.querySelector('textarea');
    const deepSpan = deepContainer.querySelector('span');
    check('[挑战2.3] 深层嵌套 textarea: placeholder 汉化为 "设置"', deepTa.getAttribute('placeholder') === '设置', () => deepTa.getAttribute('placeholder'));
    check('[挑战2.3] 深层嵌套 textarea: title 汉化为 "帮助"', deepTa.getAttribute('title') === '帮助', () => deepTa.getAttribute('title'));
    check('[挑战2.3] 深层嵌套 textarea: 内部文本 "File" 严格保持不变', deepTa.textContent === 'File', () => deepTa.textContent);
    check('[挑战2.3] 深层嵌套兄弟 span 文本 "Settings" 正常汉化为 "设置"', deepSpan.textContent === '设置', () => deepSpan.textContent);

    // 2.4 非法/非标 DOM：textarea 内部强行挂载 Element 子节点
    const nonStdTa = d.createElement('textarea');
    nonStdTa.setAttribute('placeholder', 'Settings');
    const innerSpan = d.createElement('span');
    innerSpan.textContent = 'Settings';
    nonStdTa.appendChild(innerSpan);
    host.appendChild(nonStdTa);
    await flush();

    check('[挑战2.4] 非标 textarea 子 Element: placeholder 正常汉化', nonStdTa.getAttribute('placeholder') === '设置');
    check('[挑战2.4] 非标 textarea 内部 span 文本严格绝缘不被汉化', innerSpan.textContent === 'Settings', () => innerSpan.textContent);
  }

  // =========================================================================
  // 4. 挑战 3: 根节点属性处理完备性 (No Premature Skip)
  // =========================================================================
  console.log('\n--- 挑战 3: 根节点属性处理完整性与属性白名单隔离 ---');
  {
    // 3.1 各种带白名单属性的根节点
    const attrElements = [
      { tag: 'input', attr: 'placeholder', raw: 'Search tasks...', expected: '搜索任务...' },
      { tag: 'input', attr: 'title', raw: 'Settings', expected: '设置' },
      { tag: 'button', attr: 'aria-label', raw: 'Close', expected: '关闭' },
      { tag: 'img', attr: 'alt', raw: 'Settings', expected: '设置' },
      { tag: 'a', attr: 'data-tooltip', raw: 'Help', expected: '帮助' },
    ];

    for (const item of attrElements) {
      const el = d.createElement(item.tag);
      el.setAttribute(item.attr, item.raw);
      host.appendChild(el);
      await flush();
      check(`[挑战3.1] 根节点 <${item.tag}> ${item.attr}="${item.raw}" 正常汉化为 "${item.expected}"`,
        el.getAttribute(item.attr) === item.expected,
        () => el.getAttribute(item.attr)
      );
    }

    // 3.2 绝缘根节点上的属性隔离（绝缘元素属性不应被乱汉化）
    const insulatedRootsWithAttrs = [
      { name: 'Monaco 编辑器', tag: 'div', cls: 'monaco-editor', attr: 'title', val: 'Settings' },
      { name: 'pre 容器', tag: 'pre', cls: '', attr: 'title', val: 'Settings' },
      { name: 'code 容器', tag: 'code', cls: '', attr: 'title', val: 'Settings' },
      { name: 'svg 容器', tag: 'svg', cls: '', attr: 'title', val: 'Settings' },
      { name: 'contenteditable 容器', tag: 'div', cls: '', ce: 'true', attr: 'title', val: 'Settings' },
    ];

    for (const item of insulatedRootsWithAttrs) {
      const el = d.createElement(item.tag);
      if (item.cls) el.className = item.cls;
      if (item.ce) el.setAttribute('contenteditable', item.ce);
      el.setAttribute(item.attr, item.val);
      const child = d.createElement('span');
      child.textContent = 'Settings';
      el.appendChild(child);

      host.appendChild(el);
      await flush();

      check(`[挑战3.2] 绝缘根节点 ${item.name}: ${item.attr} 保持原文不篡改`,
        el.getAttribute(item.attr) === item.val,
        () => el.getAttribute(item.attr)
      );
      check(`[挑战3.2] 绝缘根节点 ${item.name}: 内部文本保持原文不篡改`,
        child.textContent === 'Settings',
        () => child.textContent
      );
    }

    // 3.3 属性名黑名单（只有 ATTRS 白名单才翻译，其它原样保留）
    const nonAttrDiv = d.createElement('div');
    nonAttrDiv.setAttribute('id', 'Settings');
    nonAttrDiv.setAttribute('class', 'Settings');
    nonAttrDiv.setAttribute('data-key', 'Settings');
    nonAttrDiv.setAttribute('data-action', 'Delete');
    host.appendChild(nonAttrDiv);
    await flush();

    check('[挑战3.3] 非白名单属性 id 严格保持原样', nonAttrDiv.getAttribute('id') === 'Settings');
    check('[挑战3.3] 非白名单属性 class 严格保持原样', nonAttrDiv.getAttribute('class') === 'Settings');
    check('[挑战3.3] 非白名单属性 data-key 严格保持原样', nonAttrDiv.getAttribute('data-key') === 'Settings');
    check('[挑战3.3] 非白名单属性 data-action 严格保持原样', nonAttrDiv.getAttribute('data-action') === 'Delete');
  }

  // =========================================================================
  // 5. 挑战 4: 复杂绝缘根节点 100% 跳过 createTreeWalker (Pruning Check)
  // =========================================================================
  console.log('\n--- 挑战 4: 绝缘根节点绕过 createTreeWalker 剪枝测试 ---');
  {
    const insulatedConfigs = [
      { name: 'Monaco 主编辑器 (.monaco-editor)', tag: 'div', cls: 'monaco-editor' },
      { name: 'Monaco 差异对比 (.monaco-diff-editor)', tag: 'div', cls: 'monaco-diff-editor' },
      { name: 'CodeMirror 6 (.cm-editor)', tag: 'div', cls: 'cm-editor' },
      { name: 'CodeMirror 6 默认主题 (.cm-s-default)', tag: 'div', cls: 'cm-s-default' },
      { name: 'CodeMirror 5 (.CodeMirror)', tag: 'div', cls: 'CodeMirror' },
      { name: 'xterm 终端 (.xterm)', tag: 'div', cls: 'xterm' },
      { name: 'ProseMirror 富文本 (.ProseMirror)', tag: 'div', cls: 'ProseMirror' },
      { name: 'pre 容器 (<pre>)', tag: 'pre' },
      { name: 'code 容器 (<code>)', tag: 'code' },
      { name: 'script 标签 (<script>)', tag: 'script' },
      { name: 'style 标签 (<style>)', tag: 'style' },
      { name: 'noscript 标签 (<noscript>)', tag: 'noscript' },
      { name: 'svg 矢量图 (<svg>)', tag: 'svg' },
      { name: 'math 数学公式 (<math>)', tag: 'math' },
      { name: 'textarea 输入域 (<textarea>)', tag: 'textarea' },
      { name: 'contenteditable=true 富文本', tag: 'div', ce: 'true' },
      { name: 'contenteditable="" 空值富文本', tag: 'div', ce: '' },
      { name: 'contenteditable=plaintext-only 富文本', tag: 'div', ce: 'plaintext-only' },
    ];

    for (const item of insulatedConfigs) {
      const el = d.createElement(item.tag);
      if (item.cls) el.className = item.cls;
      if (item.ce !== undefined) el.setAttribute('contenteditable', item.ce);

      // 放入多层深度嵌套的待译文本
      const l1 = d.createElement('div');
      const l2 = d.createElement('span');
      l2.textContent = 'Settings';
      l1.appendChild(l2);
      el.appendChild(l1);

      const beforeLen = twLog.length;
      host.appendChild(el);
      await flush();

      // 检查内部文本绝未翻译
      check(`[挑战4] ${item.name}: 内部文本 "Settings" 保持未翻译`,
        l2.textContent === 'Settings',
        () => l2.textContent
      );

      // 检查是否为此根节点创建了 TreeWalker
      const createdForRoot = twLog.slice(beforeLen).some(e => e.root === el);
      check(`[挑战4] ${item.name}: 100% 跳过 createTreeWalker 创建`, !createdForRoot);
    }
  }

  // =========================================================================
  // 6. 挑战 5: DocumentFragment 挂载与混合子树行为
  // =========================================================================
  console.log('\n--- 挑战 5: DocumentFragment 批量挂载与混合结构 ---');
  {
    const frag = d.createDocumentFragment();

    // 混合 1: 正常容器 (title + span)
    const normDiv = d.createElement('div');
    normDiv.setAttribute('title', 'Settings');
    const normSpan = d.createElement('span');
    normSpan.textContent = 'File';
    normDiv.appendChild(normSpan);
    frag.appendChild(normDiv);

    // 混合 2: 嵌套 textarea (placeholder + text)
    const taDiv = d.createElement('div');
    const fragTa = d.createElement('textarea');
    fragTa.setAttribute('placeholder', 'Settings');
    fragTa.textContent = 'File';
    taDiv.appendChild(fragTa);
    frag.appendChild(taDiv);

    // 混合 3: Monaco 绝缘容器
    const monacoDiv = d.createElement('div');
    monacoDiv.className = 'monaco-editor';
    const monacoSpan = d.createElement('span');
    monacoSpan.textContent = 'File';
    monacoDiv.appendChild(monacoSpan);
    frag.appendChild(monacoDiv);

    // 混合 4: Pre 绝缘容器
    const preEl = d.createElement('pre');
    const preSpan = d.createElement('span');
    preSpan.textContent = 'File';
    preEl.appendChild(preSpan);
    frag.appendChild(preEl);

    host.appendChild(frag);
    await flush();

    check('[挑战5] Fragment 内正常容器 title 汉化为 "设置"', normDiv.getAttribute('title') === '设置');
    check('[挑战5] Fragment 内正常容器 span 文本汉化为 "文件"', normSpan.textContent === '文件');
    check('[挑战5] Fragment 内 textarea placeholder 汉化为 "设置"', fragTa.getAttribute('placeholder') === '设置');
    check('[挑战5] Fragment 内 textarea 文本严格保持 "File"', fragTa.textContent === 'File');
    check('[挑战5] Fragment 内 Monaco 文本严格保持 "File"', monacoSpan.textContent === 'File');
    check('[挑战5] Fragment 内 Pre 文本严格保持 "File"', preSpan.textContent === 'File');
  }

  // =========================================================================
  // 7. 挑战 6: 大批量节点挂载 (>30) 异步通道 (Schedule / JobQueue) 剪枝测试
  // =========================================================================
  console.log('\n--- 挑战 6: 大批量节点挂载 (>30) 异步通道剪枝与防膨胀 ---');
  {
    // 一次性插入 40 个节点（触发 MutationObserver >30 分支：schedule -> flush -> jobQueue）
    // 其中 20 个为绝缘节点（Monaco、Pre、Textarea），20 个为正常可译节点
    const bigFrag = d.createDocumentFragment();
    const insulatedList = [];
    const normalList = [];

    for (let i = 0; i < 20; i++) {
      const m = d.createElement('div');
      m.className = 'monaco-editor';
      const s = d.createElement('span');
      s.textContent = 'Settings';
      m.appendChild(s);
      bigFrag.appendChild(m);
      insulatedList.push(s);

      const n = d.createElement('div');
      n.setAttribute('title', 'Settings');
      const ns = d.createElement('span');
      ns.textContent = 'File';
      n.appendChild(ns);
      bigFrag.appendChild(n);
      normalList.push({ div: n, span: ns });
    }

    const beforeBigLen = twLog.length;
    host.appendChild(bigFrag);

    // 大批量需等待延迟队列推进完成 (schedule 60ms + pump)
    await waitFor(() => normalList[0].span.textContent === '文件', 12000);

    // 验证所有 20 个正常节点已汉化
    let allNormalPass = true;
    for (const item of normalList) {
      if (item.div.getAttribute('title') !== '设置' || item.span.textContent !== '文件') {
        allNormalPass = false;
        break;
      }
    }
    check('[挑战6] 大批量 (>30) 异步队列中全部 20 个正常容器与子节点正确汉化', allNormalPass);

    // 验证所有 20 个绝缘节点 100% 保持英文
    let allInsulatedPass = true;
    for (const s of insulatedList) {
      if (s.textContent !== 'Settings') {
        allInsulatedPass = false;
        break;
      }
    }
    check('[挑战6] 大批量 (>30) 异步队列中全部 20 个 Monaco 节点绝对绝缘未汉化', allInsulatedPass);

    // 验证 TreeWalker 探针：只有 20 个正常容器创建了 TreeWalker，20 个绝缘节点 0 个创建
    const newTws = twLog.slice(beforeBigLen);
    const twOnInsulated = newTws.filter(entry => {
      const cls = entry.root.className;
      return typeof cls === 'string' && cls.includes('monaco-editor');
    });
    check('[挑战6] 大批量异步批处理中绝缘根节点全部在 flush 时剪枝，创建 TreeWalker 数量为 0',
      twOnInsulated.length === 0,
      () => twOnInsulated.length
    );
  }

  // =========================================================================
  // 8. 挑战 7: 高并发极端压力与重入测试 (Stress Harness)
  // =========================================================================
  console.log('\n--- 挑战 7: 高并发极端压力与重入测试 ---');
  {
    const STRESS_COUNT = 300;
    const stressFrag = d.createDocumentFragment();
    const stressNodes = [];

    const startTime = Date.now();
    for (let i = 0; i < STRESS_COUNT; i++) {
      if (i % 3 === 0) {
        // 绝缘节点
        const m = d.createElement('div');
        m.className = 'monaco-editor';
        m.setAttribute('title', 'Settings');
        const s = d.createElement('span');
        s.textContent = 'Settings';
        m.appendChild(s);
        stressFrag.appendChild(m);
        stressNodes.push({ type: 'monaco', root: m, textEl: s });
      } else if (i % 3 === 1) {
        // Textarea 节点
        const t = d.createElement('textarea');
        t.setAttribute('placeholder', 'Settings');
        t.setAttribute('title', 'Help');
        t.textContent = 'Settings';
        stressFrag.appendChild(t);
        stressNodes.push({ type: 'textarea', root: t, textEl: t });
      } else {
        // 正常节点
        const n = d.createElement('div');
        n.setAttribute('title', 'Settings');
        const s = d.createElement('span');
        s.textContent = 'Settings';
        n.appendChild(s);
        stressFrag.appendChild(n);
        stressNodes.push({ type: 'normal', root: n, textEl: s });
      }
    }

    host.appendChild(stressFrag);
    // 等待全部正常节点处理完毕
    await waitFor(() => {
      const lastNormal = stressNodes.filter(x => x.type === 'normal').pop();
      return lastNormal && lastNormal.textEl.textContent === '设置';
    }, 15000);

    const elapsed = Date.now() - startTime;
    console.log(`[压力测试统计] ${STRESS_COUNT} 个混合节点处理总耗时: ${elapsed}ms`);

    let stressPass = true;
    for (const item of stressNodes) {
      if (item.type === 'monaco') {
        if (item.root.getAttribute('title') !== 'Settings' || item.textEl.textContent !== 'Settings') {
          stressPass = false;
          break;
        }
      } else if (item.type === 'textarea') {
        if (item.root.getAttribute('placeholder') !== '设置' || item.root.getAttribute('title') !== '帮助' || item.textEl.textContent !== 'Settings') {
          stressPass = false;
          break;
        }
      } else if (item.type === 'normal') {
        if (item.root.getAttribute('title') !== '设置' || item.textEl.textContent !== '设置') {
          stressPass = false;
          break;
        }
      }
    }

    check(`[挑战7] ${STRESS_COUNT} 节点极端混合挂载 100% 正确且无泄漏无崩溃`, stressPass);
    check(`[挑战7] 极端压力耗时合理 (< 5000ms)`, elapsed < 5000, () => elapsed);
  }

  // =========================================================================
  // 9. 挑战 8: 独立 TextNode 直接挂载为根节点 (TextNode Fast Path)
  // =========================================================================
  console.log('\n--- 挑战 8: 独立 TextNode 直接挂载与 TreeWalker 绕过 ---');
  {
    const standaloneText = d.createTextNode('Settings');
    const beforeLen = twLog.length;
    host.appendChild(standaloneText);
    await flush();

    check('[挑战8] 独立 TextNode 直接挂载成功同帧汉化为 "设置"', standaloneText.nodeValue === '设置', () => standaloneText.nodeValue);
    const twCreatedForText = twLog.slice(beforeLen).some(e => e.root === standaloneText);
    check('[挑战8] 独立 TextNode 走快路径，绝不创建 TreeWalker', !twCreatedForText);
  }

  // =========================================================================
  // 10. 挑战 9: 动态属性变更与 retranslate() 触发全树刷新
  // =========================================================================
  console.log('\n--- 挑战 9: 动态属性变更与 retranslate() 触发刷新 ---');
  {
    const dynTa = d.createElement('textarea');
    dynTa.setAttribute('placeholder', 'Initial');
    dynTa.textContent = 'Settings';
    host.appendChild(dynTa);
    await flush();

    // 动态修改 placeholder 为可译词条，并触发 retranslate() 遍历全树
    dynTa.setAttribute('placeholder', 'Settings');
    w.__antigravityZh.retranslate();
    await waitFor(() => dynTa.getAttribute('placeholder') === '设置', 8000);

    check('[挑战9] textarea 动态 setAttribute("placeholder", "Settings") 经 retranslate() 汉化为 "设置"',
      dynTa.getAttribute('placeholder') === '设置',
      () => dynTa.getAttribute('placeholder')
    );
    check('[挑战9] textarea 动态更新属性与 retranslate() 期间，内部文本保持不变', dynTa.textContent === 'Settings');
  }

  // =========================================================================
  // 11. 挑战 10: 伪绝缘类名与真实绝缘类名边界 (Regex Class Boundary)
  // =========================================================================
  console.log('\n--- 挑战 10: 类名前后缀边界测试 (EDITOR_CLS_RE) ---');
  {
    // 类名前后有非空格字符时不应误判为绝缘（伪绝缘）
    const fakeMonaco = d.createElement('div');
    fakeMonaco.className = 'not-monaco-editor-really';
    fakeMonaco.setAttribute('title', 'Settings');
    const fakeSpan = d.createElement('span');
    fakeSpan.textContent = 'File';
    fakeMonaco.appendChild(fakeSpan);
    host.appendChild(fakeMonaco);
    await flush();

    check('[挑战10] 伪绝缘类名 not-monaco-editor-really 正常汉化 title', fakeMonaco.getAttribute('title') === '设置');
    check('[挑战10] 伪绝缘类名 not-monaco-editor-really 正常汉化子文本', fakeSpan.textContent === '文件');

    // 多类名混排中包含有效绝缘类名
    const mixedMonaco = d.createElement('div');
    mixedMonaco.className = 'my-theme monaco-editor custom-pane';
    mixedMonaco.setAttribute('title', 'Settings');
    const mixedSpan = d.createElement('span');
    mixedSpan.textContent = 'File';
    mixedMonaco.appendChild(mixedSpan);

    const beforeMixed = twLog.length;
    host.appendChild(mixedMonaco);
    await flush();

    check('[挑战10] 多类名中命中 monaco-editor 保持 title 绝缘', mixedMonaco.getAttribute('title') === 'Settings');
    check('[挑战10] 多类名中命中 monaco-editor 保持子文本绝缘', mixedSpan.textContent === 'File');
    const mixedTw = twLog.slice(beforeMixed).some(e => e.root === mixedMonaco);
    check('[挑战10] 多类名命中绝缘类跳过 TreeWalker 创建', !mixedTw);
  }

  // =========================================================================
  // 12. 挑战 11: 已有绝缘容器内部动态插入子节点
  // =========================================================================
  console.log('\n--- 挑战 11: 绝缘容器内动态插入子节点的逃逸防御 ---');
  {
    const existingEditor = d.createElement('div');
    existingEditor.className = 'monaco-editor';
    host.appendChild(existingEditor);
    await flush();

    // 动态在已有编辑器内部挂载新的 span
    const dynSpan = d.createElement('span');
    dynSpan.textContent = 'Settings';
    existingEditor.appendChild(dynSpan);
    await flush();

    check('[挑战11] 绝缘容器内动态新增 span: isSkipped 祖先链回溯防御生效，绝不汉化',
      dynSpan.textContent === 'Settings',
      () => dynSpan.textContent
    );
  }

  // =========================================================================
  // 恢复环境与产出报告
  // =========================================================================
  d.createTreeWalker = origCreateTw;
  fs.rmSync(SIM, { recursive: true, force: true });

  console.log('\n=============================================');
  console.log(`TreeWalker 对抗性测试总结: ${pass} 通过, ${fail} 失败`);
  if (failures.length > 0) {
    console.log('\n失败详情:');
    failures.forEach(f => console.log('  ' + f));
  }
  console.log('=============================================\n');

  process.exit(fail ? 1 : 0);
})();
