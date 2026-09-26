"use strict";
// Antigravity 主程序汉化模块：原生菜单词典 + 网页 UI 词典翻译注入
// 词典文件位于 ../cockpit-zh.json（zh-patch 目录下），可随时编辑。
// 本分支增强：1) 小改动同帧翻译（菜单打开无英文闪烁）2) 词典文件变更自动热载（无需 Ctrl+R）
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateMenu = translateMenu;
exports.attachWebTranslator = attachWebTranslator;
exports.MENU_LABELS = void 0;
const fs = require('fs');
const path = require('path');
// Electron 默认菜单及本应用菜单的英文 → 中文映射（保留 role，仅改显示文本）
const MENU_LABELS = {
    'File': '文件',
    'Edit': '编辑',
    'View': '查看',
    'Go': '前往',
    'Window': '窗口',
    'Help': '帮助',
    'New Window': '新建窗口',
    'New Tab': '新建标签页',
    'New Conversation': '新建对话',
    'Undo': '撤销',
    'Redo': '重做',
    'Cut': '剪切',
    'Copy': '复制',
    'Paste': '粘贴',
    'Paste and Match Style': '粘贴并匹配样式',
    'Delete': '删除',
    'Select All': '全选',
    'Start Dictation': '开始听写',
    'Emoji & Symbols': '表情与符号',
    'Speech': '语音',
    'Reload': '重新加载',
    'Force Reload': '强制重新加载',
    'Toggle Developer Tools': '切换开发者工具',
    'Toggle Full Screen': '切换全屏',
    'Enter Full Screen': '进入全屏',
    'Exit Full Screen': '退出全屏',
    'Reset Zoom': '重置缩放',
    'Zoom In': '放大',
    'Zoom Out': '缩小',
    'Actual Size': '实际大小',
    'Minimize': '最小化',
    'Zoom': '缩放',
    'Bring All to Front': '全部置于顶层',
    'Close': '关闭',
    'Close Window': '关闭窗口',
    'Close Tab': '关闭标签页',
    'Learn More': '了解更多',
    'Services': '服务',
    'Hide': '隐藏',
    'Hide Others': '隐藏其他',
    'Show All': '全部显示',
    'Preferences': '偏好设置',
    'Settings': '设置',
    'About': '关于',
    'Quit': '退出',
    'Docs': '文档',
    'Check for Updates': '检查更新',
    'Checking for Updates...': '正在检查更新...',
    'Downloading Update...': '正在下载更新...',
    'Restart to Update': '重启以安装更新',
};
exports.MENU_LABELS = MENU_LABELS;
function translateMenu(menu) {
    if (!menu || !menu.items) {
        return;
    }
    for (const item of menu.items) {
        const zh = MENU_LABELS[item.label];
        if (zh && item.label !== zh) {
            item.label = zh;
        }
        if (item.submenu) {
            translateMenu(item.submenu);
        }
    }
}
function loadDictionary() {
    const dicPath = path.join(__dirname, 'cockpit-zh.json');
    const raw = JSON.parse(fs.readFileSync(dicPath, 'utf-8'));
    return { dict: raw.dict || {}, rules: raw.rules || [] };
}
// 注入到页面上下文的翻译器（字符串拼接，避免模板字面量冲突）
const TRANSLATOR_BODY = [
    'var D=__DATA__;var dict=D.dict;',
    // 提取规则首字符（^ 之后的字面字符/字符类），无法提取返回 null（进 always 桶兜底，保证行为不变）
    'function firstChars(p){if(p.charAt(0)!=="^")return null;var i=1,c=p.charAt(i);',
    '  if(c==="\\\\"){var n=p.charAt(i+1);return n&&"*.+?^${}()|[]\\\\/".indexOf(n)>=0?[n]:null;}',
    '  if(c==="["){var j=p.indexOf("]",i+1);if(j<0)return null;var cls=p.slice(i+1,j);if(cls.charAt(0)==="^")return null;var cs=[];',
    '    for(var k=0;k<cls.length;k++){var cc=cls.charAt(k);',
    '      if(cc==="\\\\"){k++;if(k>=cls.length)return null;var nn=cls.charAt(k);if(nn==="d"||nn==="s"||nn==="w")return null;cs.push(nn);}',
    '      else if(cc==="-"&&k>0&&k<cls.length-1){var a=cls.charCodeAt(k-1),b=cls.charCodeAt(k+1);if(b-a>128)return null;for(var m=a+1;m<b;m++)cs.push(String.fromCharCode(m));}',
    '      else cs.push(cc);}',
    '    return cs.length?cs:null;}',
    '  if(c==="(")return null;',
    '  return c?[c]:null;}',
    // 规则预编译 + 首字符倒排索引：匹配时按文本首字符 O(1) 定位候选规则，跳过无关规则的全部 test
    'function compileRules(rules){var out=[],always=[],byChar={};rules=rules||[];',
    '  for(var i=0;i<rules.length;i++){try{var re=new RegExp(rules[i][0],rules[i][2]||"");var en=[re,rules[i][1]];out.push(en);',
    '    var fc=firstChars(rules[i][0]);',
    '    if(!fc){always.push(en);}',
    '    else{for(var k=0;k<fc.length;k++){var ch=fc[k];(byChar[ch]=byChar[ch]||[]).push(en);}}}catch(e){}}',
    '  return {all:out,always:always,byChar:byChar};}',
    'var RC=compileRules(D.rules);',
    'var SKIP_TAGS={SCRIPT:1,STYLE:1,NOSCRIPT:1,CODE:1,PRE:1,TEXTAREA:1,SVG:1,MATH:1,script:1,style:1,noscript:1,code:1,pre:1,textarea:1,svg:1,math:1};',
    'var ATTR_SKIP_SEL="code,pre,script,style,noscript,svg,math,.monaco-editor,.monaco-diff-editor,.cm-editor,.cm-s-default,.CodeMirror,.xterm,.ProseMirror,[contenteditable]:not([contenteditable=\\"false\\"])";',
    'var CONTENT_SKIP_SEL="code,pre,textarea,script,style,noscript,svg,math,.monaco-editor,.monaco-diff-editor,.cm-editor,.cm-s-default,.CodeMirror,.xterm,.ProseMirror,[contenteditable]:not([contenteditable=\\"false\\"])";',
    'var isComposing=false;',
    'if(typeof window!=="undefined"&&window.addEventListener){',
    '  window.addEventListener("compositionstart",function(){isComposing=true;},true);',
    '  window.addEventListener("compositionend",function(){isComposing=false;},true);',
    '  window.addEventListener("compositioncancel",function(){isComposing=false;},true);',
    '  window.addEventListener("blur",function(){isComposing=false;},true);',
    '}',
    'function isEditable(el){',
    '  if(!el||el.nodeType!==1)return false;',
    '  if(el.isContentEditable)return true;',
    '  if(el.getAttribute){var ce=el.getAttribute("contenteditable");if(ce!=null&&ce!=="false")return true;}',
    '  return false;}',
    'function isEditorCls(cls){',
    '  if(typeof cls!=="string"||!cls)return false;',
    '  if(cls.indexOf("monaco-")!==-1||cls.indexOf("cm-")!==-1||cls.indexOf("xterm")!==-1||cls.indexOf("ProseMirror")!==-1||cls.indexOf("CodeMirror")!==-1){',
    '    return /(?:^|\\s)(?:monaco-editor|monaco-diff-editor|cm-editor|cm-s-default|CodeMirror|xterm|ProseMirror)(?:\\s|$)/.test(cls);',
    '  }',
    '  return false;}',
    'function isRejectEl(el){',
    '  if(!el||el.nodeType!==1)return false;',
    '  if(SKIP_TAGS[el.tagName]||el.ownerSVGElement)return true;',
    '  if(isEditable(el))return true;',
    '  if(isEditorCls(el.className))return true;',
    '  return false;}',
    'function isSkipped(el,isAttr){',
    '  if(!el)return false;if(el.nodeType===3)el=el.parentElement||el.parentNode;if(!el||el.nodeType!==1)return false;',
    '  var tag=el.tagName;if(isAttr&&(tag==="TEXTAREA"||tag==="textarea"))return false;',
    '  if(isEditable(el))return true;',
    '  var sel=isAttr?ATTR_SKIP_SEL:CONTENT_SKIP_SEL;',
    '  if(el.closest){try{return !!el.closest(sel);}catch(e){}}',
    '  var c=el;',
    '  while(c){',
    '    var ctag=c.tagName;',
    '    if((!isAttr&&SKIP_TAGS[ctag])||(isAttr&&ctag!=="TEXTAREA"&&ctag!=="textarea"&&SKIP_TAGS[ctag])||isEditable(c)||c.ownerSVGElement)return true;',
    '    if(isEditorCls(c.className))return true;',
    '    c=c.parentElement;',
    '  }',
    '  return false;}',
    'function tr(s){var core=s.replace(/^\\s+|\\s+$/g,"");if(!core)return null;',
    '  if(Object.prototype.hasOwnProperty.call(dict,core)){var v=dict[core];return s.replace(core,function(){return v;});}',
    '  var bucket=RC.byChar[core.charAt(0)];',
    '  if(bucket){for(var i=0;i<bucket.length;i++){var rr=bucket[i];if(rr[0].test(core)){return s.replace(core,function(){return core.replace(rr[0],rr[1]);});}}}',
    '  for(var j=0;j<RC.always.length;j++){var ra=RC.always[j];if(ra[0].test(core)){return s.replace(core,function(){return core.replace(ra[0],ra[1]);});}}',
    '  return null;}',
    'var nodeMap=new WeakMap();',
    'function trRaw(n){',
    '  var val=n.nodeValue;if(!val||!/\\S/.test(val))return;',
    '  var rec=nodeMap.get(n);',
    '  if(rec){if(rec.broken)return;if(val===rec.val)return;}',
    '  var zh=tr(val);if(zh===null||zh===val)return;',
    '  var now=Date.now();',
    '  if(rec){',
    '    if(zh===rec.val&&now-rec.ts<500){rec.count++;if(rec.count>2){rec.broken=true;return;}}',
    '    else{rec.count=1;rec.ts=now;}',
    '    rec.val=zh;',
    '  }else{rec={val:zh,count:1,ts:now,broken:false};nodeMap.set(n,rec);}',
    '  n.nodeValue=zh;',
    '}',
    'function trNodeFast(n){',
    '  if(!n||n.nodeType!==3)return;',
    '  var rec=nodeMap.get(n);',
    '  if(rec){if(rec.broken)return;if(n.nodeValue===rec.val)return;}',
    '  if(isComposing)return;',
    '  var p=n.parentElement||n.parentNode;if(!p||p.nodeType!==1)return;',
    '  if(isEditable(p))return;',
    '  if(isSkipped(p,false))return;',
    '  trRaw(n);',
    '}',
    'var trNode=trNodeFast;',
    'var ATTRS=["placeholder","title","aria-label","aria-placeholder","data-tooltip","alt"];',
    'var twFilter={acceptNode:function(node){if(node.nodeType===1){return isRejectEl(node)?2:3;}return 1;}};',
    'function walk(root){if(!root)return;',
    '  if(root.nodeType===3){trNodeFast(root);return;}',
    '  if(document.createTreeWalker&&!isSkipped(root,false)){',
    '    var tw=document.createTreeWalker(root,5,twFilter);var budget=35;var n;',
    '    while(budget>0&&(n=tw.nextNode())){trRaw(n);budget--;}',
    '    if(budget===0){var next=tw.nextNode();if(next){',
    '      var drain=function(startNode){var curr=startNode;var b=35;',
    '        while(b>0&&curr){trRaw(curr);b--;if(b>0){curr=tw.nextNode();}}',
    '        if(curr){var more=tw.nextNode();if(more){setTimeout(function(){drain(more);},16);}}};',
    '      setTimeout(function(){drain(next);},16);',
    '    }}',
    '  }',
    '  if(root.querySelectorAll&&!isSkipped(root,true)){',
    '    var els=[];',
    '    if(root.matches&&root.matches("[placeholder],[title],[aria-label],[aria-placeholder],[data-tooltip],[alt]")){els.push(root);}',
    '    var matched=root.querySelectorAll("[placeholder],[title],[aria-label],[aria-placeholder],[data-tooltip],[alt]");',
    '    for(var m=0;m<matched.length;m++){els.push(matched[m]);}',
    '    for(var i=0;i<els.length;i++){if(isSkipped(els[i],true))continue;for(var j=0;j<ATTRS.length;j++){var a=ATTRS[j];var val=els[i].getAttribute(a);',
    '      if(!val)continue;var nv=tr(val);if(nv!==null&&nv!==val){els[i].setAttribute(a,nv);}}}',
    '  }}',
    'var timer=null,pending=[];',
    'function flush(){var list=pending;pending=[];for(var i=0;i<list.length;i++){try{walk(list[i]);}catch(e){}}}',
    'function schedule(nodes){for(var i=0;i<nodes.length;i++){pending.push(nodes[i]);}',
    '  if(timer){clearTimeout(timer);}timer=setTimeout(flush,60);}',
    'var mo=new MutationObserver(function(muts){',
    '  for(var i=0;i<muts.length;i++){var m=muts[i];',
    '    if(m.type==="childList"&&m.addedNodes.length){',
    '      if(m.addedNodes.length>30){schedule(m.addedNodes);}',
    '      else{for(var j=0;j<m.addedNodes.length;j++){var an=m.addedNodes[j];',
    '        if(an.nodeType===3&&!/\\S/.test(an.nodeValue)){continue;}',
    '        try{walk(an);}catch(e){}}}}',
    '    else if(m.type==="characterData"){try{trNodeFast(m.target);}catch(e){}}}});',
    'var rootEl=document.documentElement||document.body;',
    'mo.observe(rootEl,{childList:true,subtree:true,characterData:true});',
    'window.__antigravityZh={retranslate:function(){walk(document.body);var t=tr(document.title);if(t){document.title=t;}},',
    '  setData:function(nd){if(!nd){return;}D=nd;dict=nd.dict||{};RC=compileRules(nd.rules);try{walk(document.body);}catch(e){}}};',
    'walk(document.body);var t0=tr(document.title);if(t0){document.title=t0;}'
].join('\n');
// Subagent 运行时长原生动态显示模块 (Zero-Flicker & Native Minimalist)
const SUBAGENT_TIMER_BODY = [
    ';(function(){',
    '  var taskTimes=new Map();',
    '  function fmtDur(s){',
    '    s=Math.max(0,Math.floor(s));',
    '    if(s<60){return s+"s";}',
    '    var m=Math.floor(s/60),sec=s%60;',
    '    if(m<60){return m+"m "+(sec<10?"0":"")+sec+"s";}',
    '    var h=Math.floor(m/60),remM=m%60;',
    '    return h+"h "+(remM<10?"0":"")+remM+"m";',
    '  }',
    '  function getSpan(p,cls){',
    '    var sp=p.querySelector("."+cls);',
    '    if(!sp){',
    '      sp=document.createElement("span");',
    '      sp.className=cls;',
    '      sp.style.cssText="margin-left:6px;font-variant-numeric:tabular-nums;opacity:0.65;font-size:0.88em;font-weight:normal;letter-spacing:0.2px;display:inline-block;vertical-align:baseline;";',
    '      p.appendChild(sp);',
    '    }',
    '    return sp;',
    '  }',
    '  function tick(){',
    '    var now=Date.now();',
    '    // 1. 图 1: 输入框上方的 running-items-panel (正在运行项面板)',
    '    var panel=document.querySelector(\'[data-testid="running-items-panel"]\');',
    '    if(panel){',
    '      var itemRows=panel.querySelectorAll(\'.overflow-y-auto > div, [class*="flex items-center"]\');',
    '      for(var r=0;r<itemRows.length;r++){',
    '        var row=itemRows[r];',
    '        var txtEl=row.querySelector(\'span, .text-sm, .truncate\')||row;',
    '        var rawText=txtEl.textContent.replace(/·\\s*\\d+[smh].*/g,"").trim();',
    '        if(rawText&&rawText.length>1&&!rawText.includes("running")&&!rawText.includes("运行中")&&!rawText.includes("subagent")){',
    '          var pk="panel_"+rawText;',
    '          var pst=taskTimes.get(pk);if(!pst){pst=now;taskTimes.set(pk,pst);}',
    '          var pelap=(now-pst)/1000;',
    '          var psp=getSpan(txtEl,"ag-panel-sub-timer");',
    '          psp.textContent="· "+fmtDur(pelap);',
    '        }',
    '      }',
    '    }',
    '    // 2. 图 2: 辅助面板/树节点中的 subagent-node',
    '    var nodes=document.querySelectorAll(\'[data-testid="subagent-node"]\');',
    '    for(var n=0;n<nodes.length;n++){',
    '      var node=nodes[n];',
    '      var cid=node.getAttribute("data-cascade-id")||("node_"+n);',
    '      var statusEl=node.querySelector(\'.text-xs\');',
    '      var isWorking=statusEl&&/(工作中|Working)/.test(statusEl.textContent);',
    '      if(isWorking){',
    '        var nst=taskTimes.get(cid);if(!nst){nst=now;taskTimes.set(cid,nst);}',
    '        var nelap=(now-nst)/1000;',
    '        var nsp=getSpan(statusEl,"ag-node-sub-timer");',
    '        nsp.textContent="· "+fmtDur(nelap);',
    '      }',
    '    }',
    '  }',
    '  if(window.__agTimerInterval){clearInterval(window.__agTimerInterval);}',
    '  window.__agTimerInterval=setInterval(tick,1000);',
    '  tick();',
    '})();'
].join('\n');
function buildScript(dic) {
    return '(function(){if(window.__antigravityZh){window.__antigravityZh.retranslate();return;}' +
        TRANSLATOR_BODY.replace('__DATA__', JSON.stringify(dic)) + '\n' +
        SUBAGENT_TIMER_BODY +
        '})()';
}
// 已注册窗口与词典监视状态（模块级，多窗口共享）
const registeredWindows = new Set();
let watchStarted = false;
// 词典热载：文件变更后把新词典推送到所有已注册窗口
function pushDictionaryToWindows() {
    let dic;
    try {
        dic = loadDictionary();
    }
    catch (e) {
        return;
    }
    const js = 'window.__antigravityZh&&window.__antigravityZh.setData(' + JSON.stringify(dic) + ')';
    for (const w of registeredWindows) {
        if (w && !w.isDestroyed()) {
            w.webContents.executeJavaScript(js, true).catch(() => { });
        }
    }
}
/**
 * 为窗口附加网页 UI 翻译：每次 did-finish-load 后注入词典翻译脚本。
 * 词典热更新：修改 cockpit-zh.json 后自动推送到已打开窗口（无需手动刷新）。
 */
function attachWebTranslator(win) {
    registeredWindows.add(win);
    win.webContents.on('did-finish-load', () => {
        if (win.isDestroyed()) {
            return;
        }
        let dic;
        try {
            dic = loadDictionary();
        }
        catch (e) {
            console.error('[zh-i18n] 读取词典失败:', e.message);
            return;
        }
        win.webContents.executeJavaScript(buildScript(dic), true).catch(() => { });
    });
    if (!watchStarted) {
        watchStarted = true;
        try {
            const dicPath = path.join(__dirname, 'cockpit-zh.json');
            let reloadTimer = null;
            fs.watch(dicPath, () => {
                if (reloadTimer) {
                    clearTimeout(reloadTimer);
                }
                reloadTimer = setTimeout(pushDictionaryToWindows, 200);
            });
        }
        catch (e) {
            // 词典监视失败不影响基础翻译功能
        }
    }
}
