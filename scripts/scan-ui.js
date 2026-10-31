// 扫描真实界面里所有「仍是纯英文」的用户可见文本
const http = require('http');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const port = process.argv[2];
const pageIndex = +(process.argv[3] || 0);

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
    // 只处理「自身没有元素子节点」的叶子容器，避免父容器把整块内容重复上报
    if (el.children.length === 0 || el.children.length > 3) {
      var direct = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3) direct += el.childNodes[i].nodeValue + ' ';
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
        const pg = pages[pageIndex];
        if (!pg) return resolve({ pages: pages.length, items: [] });
        const ws = new WebSocket(pg.webSocketDebuggerUrl);
        let done = false;
        const finish = (v) => { if (done) return; done = true; try { ws.close(); } catch (e) { } resolve(v); };
        ws.on('open', () => ws.send(JSON.stringify({
          id: 1, method: 'Runtime.evaluate',
          params: { expression: SCAN_EXPR, returnByValue: true },
        })));
        ws.on('message', m => {
          const d = JSON.parse(m);
          if (d.id === 1) {
            const v = d.result && d.result.result && d.result.result.value;
            finish({ url: pg.url, pages: pages.length, items: v ? JSON.parse(v) : [] });
          }
        });
        ws.on('error', e => finish({ url: pg.url, pages: pages.length, items: [], error: e.message }));
        setTimeout(() => finish({ url: pg.url, pages: pages.length, items: [], error: 'timeout' }), 10000);
      });
    }).on('error', e => reject(e));
  });
}

(async () => {
  const r = await evalOn(port, pageIndex);
  console.log(JSON.stringify(r, null, 2));
})();
