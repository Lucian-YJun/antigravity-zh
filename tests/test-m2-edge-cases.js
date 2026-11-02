// TreeWalker 根节点优化专项边缘用例与性能实证验证 (Milestone M2 Challenger 2)
// 覆盖范围：
// 1. 根节点多属性排列组合 (title, placeholder, aria-label, aria-placeholder, data-tooltip, alt)
// 2. 空根节点与退化节点 (无属性无子节点, Comment, 空字符串文本节点)
// 3. TextNode 直接作为根节点 (孤立 TextNode, 挂载 TextNode, 绝缘 TextNode, 空白符)
// 4. DocumentFragment 根节点 (混合常规容器, textarea, monaco, pre, 独立 TextNode)
// 5. 已挂载元素上的动态属性变更 (原生 setAttribute 配合 walk / 属性幂等性 / 绝缘保护)
// 6. 性能量化：createTreeWalker 调用量与节点遍历量大幅下降验证，常规容器零退化

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SIM = path.join(__dirname, 'zh-challenger2-sim');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
const SRC = path.join(__dirname, '../src');
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));
const zh = require(path.join(SIM, 'zh-i18n.js'));

let pass = 0, fail = 0;
const failureDetails = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('PASS  ' + name);
  } else {
    fail++;
    const d = typeof detail === 'function' ? (() => { try { return detail(); } catch (e) { return '读取失败: ' + e.message; } })() : detail;
    const msg = 'FAIL  ' + name + (d !== undefined ? '  -> 实际: ' + JSON.stringify(d) : '');
    console.log(msg);
    failureDetails.push(msg);
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
  console.log('=== Milestone M2: TreeWalker 根节点边缘用例与性能挑战测试 ===\n');

  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="static">Command Palette</div>
    <div id="host"></div>
  </body></html>`, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  const d = w.document;
  const host = d.getElementById('host');

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

  await waitFor(() => d.getElementById('static').textContent === '命令面板');
  check('翻译引擎初始全页翻译就绪', d.getElementById('static').textContent === '命令面板');

  // 获取 window 上注入的 walk 引用及环境
  // 注入脚本包装在闭包中，但 window.__antigravityZh 提供了 retranslate 等。
  // 为了精确测试 walk(root) 的内部机制，我们通过拦截 document.createTreeWalker 来监控一切行为。
  const origCreateTw = d.createTreeWalker;
  const twAuditLog = []; // { root, whatToShow, inspectedNodes: [], returnedNodes: [] }

  d.createTreeWalker = function(root, whatToShow, filter) {
    const entry = {
      root: root,
      whatToShow: whatToShow,
      inspectedNodes: [],
      returnedNodes: []
    };
    twAuditLog.push(entry);

    let wrappedFilter = filter;
    if (filter && typeof filter.acceptNode === 'function') {
      wrappedFilter = {
        acceptNode: function(node) {
          entry.inspectedNodes.push(node);
          return filter.acceptNode(node);
        }
      };
    } else if (typeof filter === 'function') {
      wrappedFilter = function(node) {
        entry.inspectedNodes.push(node);
        return filter(node);
      };
    }

    const walker = origCreateTw.call(d, root, whatToShow, wrappedFilter);
    const origNextNode = walker.nextNode;
    walker.nextNode = function() {
      const node = origNextNode.call(walker);
      if (node) {
        entry.returnedNodes.push(node);
      }
      return node;
    };
    return walker;
  };

  // =========================================================================
  // 第一部分：根节点多属性排列组合 (Root Attributes Permutations)
  // =========================================================================
  console.log('\n--- 1. 根节点多属性排列组合挑战 ---');

  // 1.1 常规元素同时具备 5 种白名单属性 (title, placeholder, aria-label, data-tooltip, alt)
  {
    const el = d.createElement('input');
    el.setAttribute('title', 'Settings');
    el.setAttribute('placeholder', 'Search tasks...');
    el.setAttribute('aria-label', 'Command Palette');
    el.setAttribute('data-tooltip', 'Help');
    el.setAttribute('alt', 'File');
    // 同时包含非白名单属性（必须严格保持原样）
    el.setAttribute('id', 'Settings');
    el.setAttribute('name', 'Command Palette');
    el.setAttribute('data-custom', 'Search tasks...');

    const beforeTwCount = twAuditLog.length;
    host.appendChild(el);
    await flush();

    check('常规根节点: title 属性汉化为 "设置"', el.getAttribute('title') === '设置', () => el.getAttribute('title'));
    check('常规根节点: placeholder 属性汉化为 "搜索任务..."', el.getAttribute('placeholder') === '搜索任务...', () => el.getAttribute('placeholder'));
    check('常规根节点: aria-label 属性汉化为 "命令面板"', el.getAttribute('aria-label') === '命令面板', () => el.getAttribute('aria-label'));
    check('常规根节点: data-tooltip 属性汉化为 "帮助"', el.getAttribute('data-tooltip') === '帮助', () => el.getAttribute('data-tooltip'));
    check('常规根节点: alt 属性汉化为 "文件"', el.getAttribute('alt') === '文件', () => el.getAttribute('alt'));
    // 黑名单/非白名单属性严格保持原样
    check('常规根节点: id 属性严格保持 "Settings"', el.getAttribute('id') === 'Settings');
    check('常规根节点: name 属性严格保持 "Command Palette"', el.getAttribute('name') === 'Command Palette');
    check('常规根节点: data-custom 属性严格保持 "Search tasks..."', el.getAttribute('data-custom') === 'Search tasks...');
  }

  // 1.2 Textarea 根节点具备多个白名单属性
  {
    const ta = d.createElement('textarea');
    ta.setAttribute('title', 'Settings');
    ta.setAttribute('placeholder', 'Search tasks...');
    ta.setAttribute('aria-label', 'Delete Conversation');
    ta.textContent = 'Command Palette\nFile\nSettings'; // 内部文本必须保护

    const beforeTwCount = twAuditLog.length;
    host.appendChild(ta);
    await flush();

    check('Textarea 根节点: title 汉化为 "设置"', ta.getAttribute('title') === '设置');
    check('Textarea 根节点: placeholder 汉化为 "搜索任务..."', ta.getAttribute('placeholder') === '搜索任务...');
    check('Textarea 根节点: aria-label 汉化为 "删除对话"', ta.getAttribute('aria-label') === '删除对话');
    check('Textarea 根节点: 内部多行文本严格未翻译', ta.textContent === 'Command Palette\nFile\nSettings');
    // 关键：已在 makeJob 中剪枝，绝不为该 textarea 创建 TreeWalker
    const taWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === ta);
    check('Textarea 根节点: 属性翻译后直接剪枝，创建 TreeWalker 数量为 0', taWalkers.length === 0, () => taWalkers.length);
  }

  // 1.3 绝缘根节点具备白名单属性 (Monaco 编辑器、Pre 代码块)
  {
    const monaco = d.createElement('div');
    monaco.className = 'monaco-editor';
    monaco.setAttribute('title', 'Settings');
    monaco.setAttribute('aria-label', 'Command Palette');
    const monacoSpan = d.createElement('span');
    monacoSpan.textContent = 'File';
    monaco.appendChild(monacoSpan);

    const beforeTwCount = twAuditLog.length;
    host.appendChild(monaco);
    await flush();

    check('Monaco 绝缘根节点: title 属性严格保持英文不篡改', monaco.getAttribute('title') === 'Settings');
    check('Monaco 绝缘根节点: aria-label 属性严格保持英文不篡改', monaco.getAttribute('aria-label') === 'Command Palette');
    check('Monaco 绝缘根节点: 内部文本保持英文不篡改', monacoSpan.textContent === 'File');
    const monacoWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === monaco);
    check('Monaco 绝缘根节点: 100% 跳过 TreeWalker 创建', monacoWalkers.length === 0, () => monacoWalkers.length);
  }

  // =========================================================================
  // 第二部分：空根节点与退化节点 (Empty & Degenerate Roots)
  // =========================================================================
  console.log('\n--- 2. 空根节点与退化节点挑战 ---');

  // 2.1 空 div 根节点 (无属性无子节点)
  {
    const emptyDiv = d.createElement('div');
    const beforeTwCount = twAuditLog.length;
    let err = null;
    try {
      host.appendChild(emptyDiv);
      await flush();
    } catch (e) {
      err = e;
    }
    check('空 div 根节点: 安全挂载且无任何异常抛出', err === null);
    const divWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === emptyDiv);
    check('空 div 根节点: TreeWalker 正确创建', divWalkers.length === 1);
    check('空 div 根节点: nextNode() 立即返回 null，遍历节点数为 0', divWalkers[0].returnedNodes.length === 0);
  }

  // 2.2 空 span / 空 p 根节点
  {
    const emptySpan = d.createElement('span');
    const beforeTwCount = twAuditLog.length;
    host.appendChild(emptySpan);
    await flush();
    const spanWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === emptySpan);
    check('空 span 根节点: 安全挂载且遍历节点数为 0', spanWalkers.length === 1 && spanWalkers[0].returnedNodes.length === 0);
  }

  // 2.3 空 textarea 根节点 (无属性无文本)
  {
    const emptyTa = d.createElement('textarea');
    const beforeTwCount = twAuditLog.length;
    host.appendChild(emptyTa);
    await flush();
    const taWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === emptyTa);
    check('空 textarea 根节点: isRejectEl 剪枝生效，TreeWalker 创建量为 0', taWalkers.length === 0);
  }

  // 2.4 注释节点 (Comment node, nodeType === 8) 作为根挂载
  {
    const comment = d.createComment('Test Settings');
    let commentErr = null;
    try {
      host.appendChild(comment);
      await flush();
    } catch (e) {
      commentErr = e;
    }
    check('Comment 注释节点挂载: 无任何异常抛出', commentErr === null);
    check('Comment 注释内容未被篡改', comment.nodeValue === 'Test Settings');
  }

  // =========================================================================
  // 第三部分：TextNode 直接作为根节点 (Direct TextNode Roots)
  // =========================================================================
  console.log('\n--- 3. TextNode 直接作为根节点挑战 ---');

  // 3.1 挂载在标准容器下的独立 TextNode
  {
    const textNode = d.createTextNode('Settings');
    const beforeTwCount = twAuditLog.length;
    host.appendChild(textNode);
    await flush();

    check('标准容器下的 TextNode: 同帧翻译为 "设置"', textNode.nodeValue === '设置', () => textNode.nodeValue);
    const twCreated = twAuditLog.slice(beforeTwCount).some(e => e.root === textNode);
    check('标准容器下的 TextNode: 走 trNodeFast 极速通道，绝不创建 TreeWalker', !twCreated);
  }

  // 3.2 挂载在绝缘容器下的独立 TextNode
  {
    const monacoContainer = d.createElement('div');
    monacoContainer.className = 'monaco-editor';
    host.appendChild(monacoContainer);
    await flush();

    const insulatedText = d.createTextNode('Settings');
    const beforeTwCount = twAuditLog.length;
    monacoContainer.appendChild(insulatedText);
    await flush();

    check('绝缘容器下的 TextNode: 严格受保护保持英文 "Settings"', insulatedText.nodeValue === 'Settings', () => insulatedText.nodeValue);
    const twCreated = twAuditLog.slice(beforeTwCount).some(e => e.root === insulatedText);
    check('绝缘容器下的 TextNode: 绝不创建 TreeWalker', !twCreated);
  }

  // 3.3 纯空白符 TextNode
  {
    const whitespaceText = d.createTextNode('   \n\t  ');
    host.appendChild(whitespaceText);
    await flush();
    check('纯空白符 TextNode: 安全跳过且保持原空白字符', whitespaceText.nodeValue === '   \n\t  ');
  }

  // 3.4 空字符串 TextNode
  {
    const emptyText = d.createTextNode('');
    host.appendChild(emptyText);
    await flush();
    check('空字符串 TextNode: 安全跳过且保持空字符串', emptyText.nodeValue === '');
  }

  // =========================================================================
  // 第四部分：DocumentFragment 根节点 (DocumentFragment Roots)
  // =========================================================================
  console.log('\n--- 4. DocumentFragment 根节点挑战 ---');

  // 4.1 DocumentFragment 包含复合混合结构
  {
    const frag = d.createDocumentFragment();

    // 1) 正常容器与子节点
    const normalDiv = d.createElement('div');
    normalDiv.setAttribute('title', 'Settings');
    const normalSpan = d.createElement('span');
    normalSpan.textContent = 'File';
    normalDiv.appendChild(normalSpan);
    frag.appendChild(normalDiv);

    // 2) Textarea 容器
    const ta = d.createElement('textarea');
    ta.setAttribute('placeholder', 'Settings');
    ta.textContent = 'Settings';
    frag.appendChild(ta);

    // 3) Monaco 编辑器
    const monaco = d.createElement('div');
    monaco.className = 'monaco-editor';
    const monacoSpan = d.createElement('span');
    monacoSpan.textContent = 'Settings';
    monaco.appendChild(monacoSpan);
    frag.appendChild(monaco);

    // 4) Pre/Code 代码块
    const pre = d.createElement('pre');
    const code = d.createElement('code');
    const codeSpan = d.createElement('span');
    codeSpan.textContent = 'Settings';
    code.appendChild(codeSpan);
    pre.appendChild(code);
    frag.appendChild(pre);

    // 5) 独立 TextNode
    const standaloneText = d.createTextNode('Command Palette');
    frag.appendChild(standaloneText);

    // 挂载 DocumentFragment
    const beforeTwCount = twAuditLog.length;
    host.appendChild(frag);
    await flush();

    check('DocumentFragment: 正常容器 title 汉化为 "设置"', normalDiv.getAttribute('title') === '设置');
    check('DocumentFragment: 正常容器 span 文本汉化为 "文件"', normalSpan.textContent === '文件');
    check('DocumentFragment: Textarea placeholder 汉化为 "设置"', ta.getAttribute('placeholder') === '设置');
    check('DocumentFragment: Textarea 内部文本严格保持 "Settings"', ta.textContent === 'Settings');
    check('DocumentFragment: Monaco 内部文本严格保持 "Settings"', monacoSpan.textContent === 'Settings');
    check('DocumentFragment: Pre/Code 内部文本严格保持 "Settings"', codeSpan.textContent === 'Settings');
    check('DocumentFragment: 独立文本节点汉化为 "命令面板"', standaloneText.nodeValue === '命令面板');

    // 验证挂载后子节点的 TreeWalker 创建情况：
    // DocumentFragment 挂载到 host 时，DOM 将其各子节点依次 append 到 host。
    // MutationObserver 为每个 addedNode 触发 walk(root)。
    // 验证：ta, monaco, pre 作为 addedNode 时均跳过 TreeWalker 创建！
    const recentWalkers = twAuditLog.slice(beforeTwCount);
    const taWalkers = recentWalkers.filter(e => e.root === ta);
    const monacoWalkers = recentWalkers.filter(e => e.root === monaco);
    const preWalkers = recentWalkers.filter(e => e.root === pre);
    check('DocumentFragment: Textarea 子节点完全跳过 TreeWalker 创建', taWalkers.length === 0);
    check('DocumentFragment: Monaco 子节点完全跳过 TreeWalker 创建', monacoWalkers.length === 0);
    check('DocumentFragment: Pre/Code 子节点完全跳过 TreeWalker 创建', preWalkers.length === 0);
  }

  // =========================================================================
  // 第五部分：已挂载元素上的动态属性变更 (Dynamic Attribute Mutations)
  // =========================================================================
  console.log('\n--- 5. 动态属性变更与全景响应挑战 ---');

  // 5.1 已挂载元素修改属性并通过 retranslate() 或 walk(el) 触发
  {
    const dynContainer = d.createElement('div');
    dynContainer.setAttribute('title', 'Initial');
    host.appendChild(dynContainer);
    await flush();

    // 动态变更为新英文词条
    dynContainer.setAttribute('title', 'Project Settings');
    dynContainer.setAttribute('aria-label', 'Delete Conversation');

    // 触发 retranslate
    w.__antigravityZh.retranslate();
    await flush();

    check('动态属性变更: retranslate 触发后 title 成功汉化为 "项目设置"', dynContainer.getAttribute('title') === '项目设置', () => dynContainer.getAttribute('title'));
    check('动态属性变更: retranslate 触发后 aria-label 成功汉化为 "删除对话"', dynContainer.getAttribute('aria-label') === '删除对话', () => dynContainer.getAttribute('aria-label'));
  }

  // 5.2 已挂载 Textarea 动态变更 placeholder
  {
    const dynTa = d.createElement('textarea');
    dynTa.setAttribute('placeholder', 'Initial');
    dynTa.textContent = 'Settings';
    host.appendChild(dynTa);
    await flush();

    dynTa.setAttribute('placeholder', 'Search tasks...');
    dynTa.setAttribute('title', 'Help');

    const beforeTwCount = twAuditLog.length;
    w.__antigravityZh.retranslate();
    await flush();

    check('动态 Textarea: retranslate 后 placeholder 成功更新为 "搜索任务..."', dynTa.getAttribute('placeholder') === '搜索任务...', () => dynTa.getAttribute('placeholder'));
    check('动态 Textarea: retranslate 后 title 成功更新为 "帮助"', dynTa.getAttribute('title') === '帮助', () => dynTa.getAttribute('title'));
    check('动态 Textarea: 内部文本 "Settings" 绝缘不篡改', dynTa.textContent === 'Settings');
    const taWalkers = twAuditLog.slice(beforeTwCount).filter(e => e.root === dynTa);
    check('动态 Textarea: retranslate 过程依然享受剪枝保护 (0 TreeWalker 创建)', taWalkers.length === 0);
  }

  // 5.3 已挂载 Monaco 编辑器动态设置属性
  {
    const dynMonaco = d.createElement('div');
    dynMonaco.className = 'monaco-editor';
    dynMonaco.setAttribute('title', 'Initial');
    host.appendChild(dynMonaco);
    await flush();

    dynMonaco.setAttribute('title', 'Settings');
    w.__antigravityZh.retranslate();
    await flush();

    check('动态 Monaco 编辑器: 属性严格保持英文 "Settings" (绝缘隔离不破损)', dynMonaco.getAttribute('title') === 'Settings');
  }

  // 5.4 属性汉化的幂等性验证 (多次重复 retranslate)
  {
    const idemDiv = d.createElement('div');
    idemDiv.setAttribute('title', 'Settings');
    idemDiv.setAttribute('aria-label', 'Command Palette');
    host.appendChild(idemDiv);
    await flush();

    check('幂等性测试: 初始汉化成功', idemDiv.getAttribute('title') === '设置' && idemDiv.getAttribute('aria-label') === '命令面板');

    // 连续触发 5 次 retranslate
    for (let i = 0; i < 5; i++) {
      w.__antigravityZh.retranslate();
    }
    await flush();

    check('幂等性测试: 5 次重译后 title 稳定维持 "设置"', idemDiv.getAttribute('title') === '设置');
    check('幂等性测试: 5 次重译后 aria-label 稳定维持 "命令面板"', idemDiv.getAttribute('aria-label') === '命令面板');
  }

  // =========================================================================
  // 第六部分：性能与遍历量实证对比 (Performance & TreeWalker Count Verification)
  // =========================================================================
  console.log('\n--- 6. 性能与 TreeWalker 调用量 / 节点遍历量量化实证 ---');

  // 6.1 绝缘根节点与常规容器的 createTreeWalker 调用量实证对比
  {
    const BATCH = 50;
    const testCases = [
      { name: 'textarea', create: () => { const el = d.createElement('textarea'); el.setAttribute('placeholder', 'Settings'); el.textContent = 'File'; return el; }, expectTw: 0 },
      { name: 'monaco-editor', create: () => { const el = d.createElement('div'); el.className = 'monaco-editor'; const s = d.createElement('span'); s.textContent = 'File'; el.appendChild(s); return el; }, expectTw: 0 },
      { name: 'pre/code', create: () => { const el = d.createElement('pre'); const c = d.createElement('code'); c.textContent = 'File'; el.appendChild(c); return el; }, expectTw: 0 },
      { name: 'svg', create: () => { const el = d.createElement('svg'); const t = d.createElement('text'); t.textContent = 'File'; el.appendChild(t); return el; }, expectTw: 0 },
      { name: 'contenteditable', create: () => { const el = d.createElement('div'); el.setAttribute('contenteditable', 'true'); el.textContent = 'File'; return el; }, expectTw: 0 },
      { name: 'normal-container', create: () => { const el = d.createElement('div'); el.setAttribute('title', 'Settings'); const s = d.createElement('span'); s.textContent = 'File'; el.appendChild(s); return el; }, expectTw: 1 },
    ];

    const results = {};

    for (const tc of testCases) {
      const beforeCount = twAuditLog.length;
      const elements = [];
      for (let i = 0; i < BATCH; i++) {
        const el = tc.create();
        elements.push(el);
        host.appendChild(el);
      }
      await flush();

      const afterCount = twAuditLog.length;
      const twCreatedForBatch = twAuditLog.slice(beforeCount).filter(e => elements.includes(e.root)).length;
      results[tc.name] = {
        batch: BATCH,
        actualTw: twCreatedForBatch,
        expectedTw: tc.expectTw * BATCH,
        twPerInstance: twCreatedForBatch / BATCH
      };

      check(`[性能量化] ${tc.name} 根节点: ${BATCH} 实例创建 TreeWalker 期望 ${tc.expectTw * BATCH} 次，实际 ${twCreatedForBatch} 次`,
        twCreatedForBatch === tc.expectTw * BATCH,
        () => `${twCreatedForBatch} vs ${tc.expectTw * BATCH}`
      );
    }

    console.log('\n[TreeWalker 实例创建量统计汇总]:');
    console.table(results);
  }

  // 6.2 节点遍历量对比 (Deep Subtree Traversal Avoidance)
  {
    // 构建一个深层嵌套的 Monaco 编辑器树 (包含 200 个 view-line 和 400 个 token span)
    const largeMonaco = d.createElement('div');
    largeMonaco.className = 'monaco-editor';
    let totalDescendants = 0;
    for (let i = 0; i < 200; i++) {
      const line = d.createElement('div');
      line.className = 'view-line';
      const s1 = d.createElement('span');
      s1.textContent = 'const File = 1;';
      const s2 = d.createElement('span');
      s2.textContent = '/* Settings */';
      line.appendChild(s1);
      line.appendChild(s2);
      largeMonaco.appendChild(line);
      totalDescendants += 3;
    }

    const beforeTwCount = twAuditLog.length;
    const startTime = Date.now();
    host.appendChild(largeMonaco);
    await flush();
    const duration = Date.now() - startTime;

    const monacoTwEntries = twAuditLog.slice(beforeTwCount).filter(e => e.root === largeMonaco);
    const inspectedCount = monacoTwEntries.reduce((sum, e) => sum + e.inspectedNodes.length, 0);
    const returnedCount = monacoTwEntries.reduce((sum, e) => sum + e.returnedNodes.length, 0);

    console.log(`\n[大型 Monaco 树剪枝实证] 子节点总数: ${totalDescendants}, 耗时: ${duration}ms`);
    console.log(`  - TreeWalker 创建次数: ${monacoTwEntries.length} (优化前: 1)`);
    console.log(`  - acceptNode 检查节点数: ${inspectedCount} (优化前: >= ${totalDescendants})`);
    console.log(`  - nextNode 遍历节点数: ${returnedCount} (优化前: >= ${totalDescendants})`);

    check('大型 Monaco 树: TreeWalker 实例化彻底归零 (0)', monacoTwEntries.length === 0);
    check('大型 Monaco 树: acceptNode 检查节点数彻底归零 (0)', inspectedCount === 0);
    check('大型 Monaco 树: nextNode 遍历节点数彻底归零 (0)', returnedCount === 0);
    check('大型 Monaco 树: 处理耗时极低 (< 50ms)', duration < 50, () => duration);
  }

  // 6.3 常规容器根节点免检验证 (TreeWalker Root Exemption Guarantee)
  {
    const directContainer = d.createElement('div');
    directContainer.setAttribute('title', 'Settings');
    const childSpan = d.createElement('span');
    childSpan.textContent = 'File';
    directContainer.appendChild(childSpan);

    const beforeTwCount = twAuditLog.length;
    host.appendChild(directContainer);
    await flush();

    const containerTwEntries = twAuditLog.slice(beforeTwCount).filter(e => e.root === directContainer);
    check('常规容器: 正常创建 1 个 TreeWalker 用于遍历子孙', containerTwEntries.length === 1);

    const twEntry = containerTwEntries[0];
    const rootInspected = twEntry.inspectedNodes.includes(directContainer);
    const rootReturned = twEntry.returnedNodes.includes(directContainer);

    check('常规容器: twFilter.acceptNode 绝对不检查 root 自身', !rootInspected);
    check('常规容器: tw.nextNode() 绝对不返回 root 自身', !rootReturned);
    check('常规容器: 子节点正常被遍历并汉化', childSpan.textContent === '文件');
    check('常规容器: 根节点属性被正常汉化', directContainer.getAttribute('title') === '设置');
  }

  // =========================================================================
  // 总结与裁决 (Summary & Verdict)
  // =========================================================================
  console.log('\n=============================================');
  console.log(`Milestone M2 边缘用例与性能挑战结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) {
    console.log('\n失败项详情:');
    failureDetails.forEach(f => console.log('  ' + f));
    console.log('\n最终裁决: REJECT');
  } else {
    console.log('\n全部边缘用例与性能指标 100% 通过验证！');
    console.log('最终裁决: APPROVE');
  }
  console.log('=============================================\n');

  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('测试异常崩溃:', e);
  process.exit(1);
});
