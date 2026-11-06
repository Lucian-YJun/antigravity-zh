// 扫描真实界面里所有「仍是纯英文」的用户可见文本
const http = require('http');
const { loadWebSocket, isAntigravityPage, isTrustedDebuggerUrl } = require('./lib/cdp-client');

// loadWebSocket 内部已经 require('ws') 并在缺失时给出可操作的提示；
// 旧版又跟了一个指向 node_modules 绝对路径的 require，结果缺依赖时
// 会先打一条 warning、再抛一个未捕获的 MODULE_NOT_FOUND 栈。
const WebSocket = loadWebSocket();
if (!WebSocket) {
  console.error('❌ 缺少依赖 ws，无法扫描。请先在本目录运行: npm install');
  process.exit(1);
}

const port = +(process.argv[2] || 0);
const pageIndex = +(process.argv[3] || 0);

// 参数校验必须放在 require.main 分支里：本文件末尾有 module.exports = { evalOn, SCAN_EXPR }，
// 顶层 process.exit(1) 会让任何 require('./scan-ui') 直接杀掉宿主进程。
function validatePort() {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error('用法: node scripts/scan-ui.js <CDP端口> [页面序号]');
    process.exit(1);
  }
}

const SCAN_EXPR = `(function(){
  var out = [];
  var seen = {};
  var SKIP = {SCRIPT:1,STYLE:1,NOSCRIPT:1,CODE:1,PRE:1,TEXTAREA:1,SVG:1,MATH:1};
  var ATTRS = ['placeholder','title','aria-label','aria-placeholder','data-tooltip','alt'];

  function isEnglish(t){
    if (!t) return false;
    var s = t.trim();
    if (!s) return false;
    // 至少含一个拉丁字母，且不含中日韩字符
    if (!/[A-Za-z]/.test(s)) return false;
    if (/[\\u4e00-\\u9fa5\\u3040-\\u30ff]/.test(s)) return false;
    return true;
  }
  function push(kind, text, el){
    var t = text.replace(/\\s+/g, ' ').trim();
    if (!isEnglish(t)) return;
    if (t.length > 120) t = t.slice(0, 120) + '…';
    if (seen[t]) return;
    seen[t] = 1;
    out.push({ kind: kind, text: t, tag: el && el.tagName ? el.tagName.toLowerCase() : '' });
  }

  // 遍历文本节点：先按容器聚合，才能拿到「同一句被拆成多个 span」的完整原文
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: function(n){
      if (SKIP[n.tagName]) return NodeFilter.FILTER_REJECT;
      var cls = n.className && typeof n.className === 'string' ? n.className : '';
      if (/monaco-editor|monaco-diff-editor|cm-editor|CodeMirror|xterm|ProseMirror/.test(cls)) return NodeFilter.FILTER_REJECT;
      if (n.isContentEditable) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var el;
  while ((el = walker.nextNode())) {
    // 只要元素自身带直接文本子节点就聚合上报。
    // 旧条件是 (子元素数 === 0 || 子元素数 > 3)，会把「有 1~3 个元素子节点、
    // 同时自己还有直接文本」的容器整块跳过 —— 而 <div>共 <span>3</span> 项</div>
    // 这类结构在前端极常见，于是这个专门用来找漏译的工具自己会系统性漏报。
    var hasDirectText = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) { hasDirectText = true; break; }
    }
    if (el.children.length === 0 || hasDirectText) {
      var direct = '';
      for (var j = 0; j < el.childNodes.length; j++) {
        if (el.childNodes[j].nodeType === 3) direct += el.childNodes[j].nodeValue + ' ';
      }
      if (direct) push('text', direct, el);
    }
    for (var a = 0; a < ATTRS.length; a++) {
      var v = el.getAttribute && el.getAttribute(ATTRS[a]);
      if (v) push('attr:' + ATTRS[a], v, el);
    }
  }
  return JSON.stringify(out);
})()`;

function evalOn(port, pageIndex) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let pages;
        try { pages = JSON.parse(raw).filter(t => t.type === 'page'); }
        catch (e) { return reject(new Error('解析 /json 失败')); }
        // 与 sync-dict.js 保持同一套校验：只连属于 Antigravity 的回环页面。
        // 仓库里已经有这两个判定函数，本文件此前没有用。
        const trusted = pages.filter(t => t
          && isAntigravityPage(t.url)
          && isTrustedDebuggerUrl(t.webSocketDebuggerUrl, port));
        const pg = trusted[pageIndex];
        if (!pg) return resolve({ pages: trusted.length, items: [] });
        const ws = new WebSocket(pg.webSocketDebuggerUrl);
        let done = false;
        const finish = (v) => { if (done) return; done = true; try { ws.close(); } catch (e) { } resolve(v); };
        ws.on('open', () => ws.send(JSON.stringify({
          id: 1, method: 'Runtime.evaluate',
          params: { expression: SCAN_EXPR, returnByValue: true },
        })));
        ws.on('message', m => {
          // CDP 会推送各种事件消息，不都是本次请求的回复；
          // 旧版直接 JSON.parse，遇到非 JSON 帧会在事件回调里抛未捕获异常并崩掉进程。
          let d;
          try { d = JSON.parse(m); } catch (e) { return; }
          if (d.id === 1) {
            const v = d.result && d.result.result && d.result.result.value;
            let items = [];
            try { items = v ? JSON.parse(v) : []; } catch (e) { items = []; }
            finish({ url: pg.url, pages: pages.length, items });
          }
        });
        ws.on('error', e => finish({ url: pg.url, pages: pages.length, items: [], error: e.message }));
        setTimeout(() => finish({ url: pg.url, pages: pages.length, items: [], error: 'timeout' }), 10000);
      });
    }).on('error', e => reject(e));
  });
}

if (require.main === module) {
  validatePort();
  (async () => {
    const r = await evalOn(port, pageIndex);
    console.log(JSON.stringify(r, null, 2));
  })().catch((e) => {
    // 没有 catch 的话，连接失败会变成 unhandled rejection，报错信息很难读
    console.error(`❌ 扫描失败: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}

module.exports = { evalOn, SCAN_EXPR };
