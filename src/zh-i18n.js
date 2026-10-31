"use strict";
// Antigravity 主程序汉化模块：原生菜单词典 + 网页 UI 词典翻译注入
// 词典文件位于 ../cockpit-zh.json（zh-patch 目录下），可随时编辑。
// 本分支增强：1) 小改动同帧翻译（菜单打开无英文闪烁）2) 词典文件变更自动热载（无需 Ctrl+R）
exports.translateMenu = translateMenu;
exports.attachWebTranslator = attachWebTranslator;
exports.MENU_LABELS = void 0;
const fs = require('fs');
const path = require('path');
// 归一化实现：主进程菜单与页面注入脚本共用同一份源码（注入时序列化进字符串），
// 避免两套规则各写一遍后慢慢漂移。
function normEngine() {
    // 尾部标点参与归一化，但按类别分组：句号/省略号/冒号/问号/感叹号在原词典里
    // 对应不同译文形态（删除对话。 / 删除对话... / 删除对话：），合并会把语义抹平。
    var TRAIL_PUNCT = { 46: 1, 12290: 1, 8230: 1, 58: 1, 65306: 1, 63: 1, 65311: 1, 33: 1, 65281: 1 };
    function isSpace(c) {
        return c <= 32 || c === 160 || c === 0xFEFF || (c >= 0x2000 && c <= 0x200B) || c === 0x3000;
    }
    // 快路径判定：全小写、无尾部标点、无连续/异形空白时归一化是恒等变换，
    // 直接查原表即可，不必为每个 miss 构造归一化字符串。
    function needsNorm(s) {
        var len = s.length;
        if (len === 0)
            return false;
        if (TRAIL_PUNCT[s.charCodeAt(len - 1)])
            return true;
        var prevSpace = false;
        for (var i = 0; i < len; i++) {
            var c = s.charCodeAt(i);
            if (c >= 65 && c <= 90)
                return true;
            if (isSpace(c)) {
                // 连续空白或非普通空格都要折叠，否则会漏掉「双空格」这类变体
                if (prevSpace || c !== 32)
                    return true;
                prevSpace = true;
            }
            else {
                prevSpace = false;
            }
        }
        return false;
    }
    function normKey(s) {
        var len = s.length, end = len, dots = 0, ell = false, colon = false, ques = false, excl = false;
        while (end > 0) {
            var c = s.charCodeAt(end - 1);
            if (!TRAIL_PUNCT[c])
                break;
            if (c === 46 || c === 12290)
                dots++;
            else if (c === 8230)
                ell = true;
            else if (c === 58 || c === 65306)
                colon = true;
            else if (c === 63 || c === 65311)
                ques = true;
            else
                excl = true;
            end--;
        }
        var kinds = (dots ? 1 : 0) + (ell ? 1 : 0) + (colon ? 1 : 0) + (ques ? 1 : 0) + (excl ? 1 : 0);
        var sig = '';
        if (kinds === 1) {
            if (ell || dots > 1)
                sig = '\u0001e';
            else if (dots === 1)
                sig = '\u0001d';
            else if (colon)
                sig = '\u0001c';
            else if (ques)
                sig = '\u0001q';
            else
                sig = '\u0001x';
        }
        else if (kinds > 1) {
            sig = '\u0001' + s.slice(end);
        }
        var out = '', prevSpace = false;
        for (var j = 0; j < end; j++) {
            var ch = s.charCodeAt(j);
            if (isSpace(ch)) {
                if (!prevSpace)
                    out += ' ';
                prevSpace = true;
            }
            else {
                prevSpace = false;
                if (ch >= 65 && ch <= 90)
                    ch += 32;
                out += String.fromCharCode(ch);
            }
        }
        if (prevSpace)
            out = out.slice(0, out.length - 1);
        return out + sig;
    }
    // 索引在加载/热载时构建一次，查找只是哈希查表。
    // includeIdentity 为真时连「归一化是恒等变换」的键也入索引（菜单只查一次，不需要快路径）。
    function compileNorm(dict, includeIdentity) {
        var vals = Object.create(null);
        var ambiguous = Object.create(null);
        var hasOwn = Object.prototype.hasOwnProperty;
        var k;
        // 第一遍统计每个归一键的全部译文：规范形态本身也是一条译文，
        // 漏掉它会让「一个变体 + 一个规范形态」的歧义组被悄悄挑一个。
        for (k in dict) {
            if (!hasOwn.call(dict, k))
                continue;
            var nk = normKey(k);
            if (vals[nk] === undefined)
                vals[nk] = dict[k];
            else if (vals[nk] !== dict[k])
                ambiguous[nk] = 1;
        }
        var idx = Object.create(null);
        // 第二遍只收录无歧义的键；同一归一键对应不同译文时整组作废，
        // 宁可回落到英文，也不猜一个可能错的译文。
        for (k in dict) {
            if (!hasOwn.call(dict, k))
                continue;
            var nk2 = normKey(k);
            if (ambiguous[nk2] || (nk2 === k && !includeIdentity))
                continue;
            idx[nk2] = vals[nk2];
        }
        return idx;
    }
    return { needsNorm: needsNorm, normKey: normKey, compileNorm: compileNorm };
}
const NORM_IMPL = normEngine();
const NORM_SRC = '(' + normEngine.toString() + ')()';
// Electron 默认菜单及本应用菜单的英文 → 中文映射（保留 role，仅改显示文本）
const MENU_LABELS = {
    'File': '文件',
    'Edit': '编辑',
    'View': '查看',
    'Go': '前往',
    'Window': '窗口',
    'Help': '帮助',
    'Give Feedback': '提供反馈',
    'Files': '文件',
    'Folder': '文件夹',
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
    'Connect to WSL': '连接到 WSL',
    'Reopen Locally': '在本地重新打开',
    'Selection': '选择',
    'Run': '运行',
    'Terminal': '终端',
    'Full View': '完整视图',
    'Background Commands': '后台命令',
    'Built-in Browser': '内置浏览器',
    'External Browser': '外部浏览器',
    'Replace with New': '替换为新对话',
    'Permission Preset': '权限预设',
    'Permission Presets': '权限预设',
    'Browser Subagent': '浏览器子智能体',
    'Boost Mode': 'Boost 模式',
    'Switch to Boost Mode': '切换到 Boost 模式',
    'Exit Boost Mode': '退出 Boost 模式',
    'Enable Boost Mode': '启用 Boost 模式',
    'Disable Boost Mode': '禁用 Boost 模式',
    'No changes to review': '没有需要审查的更改',
    'Sort Projects': '项目排序',
    'Custom Order': '自定义排序',
    'Auto Pin': '自动置顶',
    'Auto-Pin': '自动置顶',
    'Archived Only': '仅已归档',
    'Mark All as Read': '全部标记为已读',
    'Collapse All Folders': '折叠所有文件夹',
    'Expand All Folders': '展开所有文件夹',
    'Move Conversation Up': '上移对话',
    'Move Conversation Down': '下移对话',
    'Open Keyboard Shortcuts': '打开键盘快捷键',
    'Keyboard Shortcuts': '键盘快捷键',
    'Download Diagnostics': '下载诊断信息',
    'Toggle Between Light/Dark Themes': '切换浅色/深色主题',
    'Toggle Light/Dark Themes': '切换浅色/深色主题',
    'Toggle Between Light and Dark Themes': '切换浅色/深色主题',
    'Extensions': '扩展',
    'Extension': '扩展',
    'No extensions available': '无可用扩展',
    'No extensions available.': '无可用扩展。',
    'Search automations...': '搜索自动化...',
    'Search automations': '搜索自动化',
    'No automations configured.': '尚未配置自动化。',
    'No automations configured': '尚未配置自动化',
    'Reopen Closed Tab': '重新打开关闭的标签页',
    'Reopen Closed Editor': '重新打开关闭的编辑器',
    'Previous Aux Pane Tab': '上一个辅助窗格标签页',
    'Previous Auxiliary Pane Tab': '上一个辅助窗格标签页',
    'Next Aux Pane Tab': '下一个辅助窗格标签页',
    'Next Auxiliary Pane Tab': '下一个辅助窗格标签页',
    'Delete Conversation': '删除对话',
    'Delete Conversation.': '删除对话。',
    'Delete Conversation...': '删除对话...',
    'Delete Conversation:': '删除对话：',
    'Delete Conversation?': '删除对话？',
    'Permission Settings': '权限设置',
    'Permission Settings.': '权限设置。',
    'Permission Settings...': '权限设置...',
    'when working in these conversations.': '在这些对话中工作时。',
    'when working in these conversations': '在这些对话中工作时',
    'Copy Project Name': '复制项目名称',
    'Copy Project Name.': '复制项目名称。',
    'Copy Project Name...': '复制项目名称...',
    'Project Settings': '项目设置',
    'Project Settings.': '项目设置。',
    'Project Settings...': '项目设置...',
    'Show in File Explorer': '在文件资源管理器中显示',
    'Show in File Explorer.': '在文件资源管理器中显示。',
    'Show in File Explorer...': '在文件资源管理器中显示...',
    'Show in Explorer': '在资源管理器中显示',
    'Show in Finder': '在访达中显示',
    'Delete Project': '删除项目',
    'Delete Project.': '删除项目。',
    'Delete Project...': '删除项目...',
    'Search customizations...': '搜索自定义项...',
    'Search customizations': '搜索自定义项',
    'Search Customizations...': '搜索自定义项...',
    'search customizations...': '搜索自定义项...',
    'Search customizations.': '搜索自定义项。',
    'Search customizations…': '搜索自定义项…',
    'Search Customizations…': '搜索自定义项…',
    'search customizations…': '搜索自定义项…',
    'No customizations configured.': '尚未配置自定义项。',
    'No customizations configured': '尚未配置自定义项',
    'No customizations available.': '无可用自定义项。',
    'No customizations available': '无可用自定义项',
    'No customizations found.': '未找到自定义项。',
    'No customizations found': '未找到自定义项',
    'Previous Worktrees': '先前的工作树',
    'Previous Worktrees.': '先前的工作树。',
    'Previous Worktrees...': '先前的工作树...',
    'Previous Worktrees:': '先前的工作树：',
    'Previous Worktree': '先前的工作树',
    'Previous Worktree.': '先前的工作树。',
    'Previous Worktree...': '先前的工作树...',
    'Previous Worktree:': '先前的工作树：',
    'Local Checkout': '本地仓库',
    'Local Checkout.': '本地仓库。',
    'Local Checkout...': '本地仓库...',
    'Local Checkout:': '本地仓库：',
    'Local Checkouts': '本地仓库',
    'Local Checkouts.': '本地仓库。',
    'Local Checkouts...': '本地仓库...',
    'Local Checkouts:': '本地仓库：',
};
exports.MENU_LABELS = MENU_LABELS;
// 供工具复用同一份归一化逻辑（add-terms 用它判断新词条是否已被现有条目覆盖），
// 避免脚本里再造一套规则、与引擎逐渐走偏。
exports.normEngine = normEngine;
// 菜单归一化索引：构造菜单是一次性动作，直接建全量索引（含规范形态），
// 让「大小写 × 尾部标点」的变体都能命中，词典里就不必再逐条展开。
const MENU_NORM = NORM_IMPL.compileNorm(MENU_LABELS, true);
function translateMenu(menu) {
    if (!menu || !menu.items) {
        return;
    }
    for (const item of menu.items) {
        const label = item.label;
        if (typeof label === 'string' && label) {
            let zh = MENU_LABELS[label];
            // 菜单只在建菜单时跑一遍，不做快路径判断：省下的一次查表远不值当漏译的风险
            if (!zh) {
                zh = MENU_NORM[NORM_IMPL.normKey(label)];
            }
            if (zh && label !== zh) {
                item.label = zh;
            }
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
    'var hasOwn=Object.prototype.hasOwnProperty;',
    'var missCurr=new Set(),missPrev=new Set();',
    'var ALPHA_RE=/[a-zA-Z]/;',
    'var EDITOR_CLS_RE=/(?:^|\\s)(?:monaco-editor|monaco-diff-editor|cm-editor|cm-s-default|CodeMirror|xterm|ProseMirror)(?:\\s|$)/;',
    'var ATTRS=["placeholder","title","aria-label","aria-placeholder","data-tooltip","alt"];',
    'var SKIP_TAGS={SCRIPT:1,STYLE:1,NOSCRIPT:1,CODE:1,PRE:1,TEXTAREA:1,SVG:1,MATH:1,script:1,style:1,noscript:1,code:1,pre:1,textarea:1,svg:1,math:1};',
    'var ATTR_SKIP_SEL="code,pre,script,style,noscript,svg,math,.monaco-editor,.monaco-diff-editor,.cm-editor,.cm-s-default,.CodeMirror,.xterm,.ProseMirror,[contenteditable]:not([contenteditable=\\"false\\"])";',
    'var CONTENT_SKIP_SEL="code,pre,textarea,script,style,noscript,svg,math,.monaco-editor,.monaco-diff-editor,.cm-editor,.cm-s-default,.CodeMirror,.xterm,.ProseMirror,[contenteditable]:not([contenteditable=\\"false\\"])";',
    'function isSpace(c){return c<=32||c===160||c===0xFEFF||(c>=0x2000&&c<=0x200B)||c===0x3000;}',
    'function isAllSpace(s){var len=s.length;for(var i=0;i<len;i++){var c=s.charCodeAt(i);if(!isSpace(c))return false;}return true;}',
    // 归一化规则与主进程共用同一份实现（NORM_SRC 由 normEngine 序列化注入），
    // 避免「菜单能认的写法页面认不得」这类两套规则漂移。
    'var NE=__NORM__;var needsNorm=NE.needsNorm,normKey=NE.normKey;',
    // 索引在注入时构建一次：tr() 热路径只做一次哈希查表，绝不做线性搜索
    'var NORM=NE.compileNorm(dict,true);',
    // 非规范形态的译文缓存：长句每次重建归一化字符串太贵（实测长弹窗句会慢到 3 倍），
    // 同一句在 UI 里会反复出现（每次 DOM 变更都查一遍），缓存一次即可摊平这笔开销。
    'var normHit=new Map();',
    'function normLookup(core){',
    '  var v=normHit.get(core);',
    '  if(v!==undefined)return v;',
    '  v=NORM[normKey(core)];',
    '  if(v===undefined)v=null;',
    '  if(normHit.size>=2000)normHit.clear();',
    '  normHit.set(core,v);',
    '  return v;}',
    'function firstChars(p){if(p.charAt(0)!=="^")return null;var i=1,c=p.charAt(i);',
    '  if(c==="\\\\"){var n=p.charAt(i+1);',
    '    if(n==="d")return ["0","1","2","3","4","5","6","7","8","9"];',
    '    return n&&"*.+?^${}()|[]\\\\/".indexOf(n)>=0?[n]:null;}',
    '  if(c==="("){if(p.charAt(i+1)==="\\\\"&&p.charAt(i+2)==="d")return ["0","1","2","3","4","5","6","7","8","9"];return null;}',
    '  if(c==="["){var j=p.indexOf("]",i+1);if(j<0)return null;var cls=p.slice(i+1,j);if(cls.charAt(0)==="^")return null;var cs=[];',
    '    for(var k=0;k<cls.length;k++){var cc=cls.charAt(k);',
    '      if(cc==="\\\\"){k++;if(k>=cls.length)return null;var nn=cls.charAt(k);',
    '        if(nn==="d"){for(var d=48;d<=57;d++)cs.push(String.fromCharCode(d));continue;}',
    '        if(nn==="s"||nn==="w")return null;cs.push(nn);}',
    '      else if(cc==="-"&&k>0&&k<cls.length-1){var a=cls.charCodeAt(k-1),b=cls.charCodeAt(k+1);if(b-a>128)return null;for(var m=a+1;m<b;m++)cs.push(String.fromCharCode(m));}',
    '      else cs.push(cc);}',
    '    return cs.length?cs:null;}',
    '  return c?[c]:null;}',
    'function compileRules(rules){var out=[],always=[],byChar={};rules=rules||[];',
    '  for(var i=0;i<rules.length;i++){try{var re=new RegExp(rules[i][0],rules[i][2]||"");var en=[re,rules[i][1]];out.push(en);',
    '    var fc=firstChars(rules[i][0]);',
    '    if(!fc){always.push(en);}',
    '    else{for(var k=0;k<fc.length;k++){var ch=fc[k];(byChar[ch]=byChar[ch]||[]).push(en);}}}catch(e){}}',
    '  return {all:out,always:always,byChar:byChar};}',
    'var RC=compileRules(D.rules);',
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
    // 只走正则一条路径：正则里的每个类名（monaco-* / cm-editor / cm-s-default / CodeMirror /
    // xterm / ProseMirror）都带前缀或完整写出，正则命中即包含原 indexOf 预筛的全部情形，
    // 预筛只是重复表达同一语义（已用 50 万组类名验证两者结果完全一致）。
    '  return EDITOR_CLS_RE.test(cls);}',
    'function isRejectEl(el){',
    '  if(!el||el.nodeType!==1)return false;',
    '  if(SKIP_TAGS[el.tagName]||el.ownerSVGElement)return true;',
    '  if(isEditable(el))return true;',
    '  if(isEditorCls(el.className))return true;',
    '  return false;}',
    'function isSkipped(el,isAttr){',
    '  if(!el)return false;if(el.nodeType===3)el=el.parentElement||el.parentNode;if(!el||el.nodeType!==1)return false;',
    '  var tag=el.tagName;',
    '  if(!isAttr&&SKIP_TAGS[tag])return true;',
    '  if(isAttr&&tag!=="TEXTAREA"&&tag!=="textarea"&&SKIP_TAGS[tag])return true;',
    '  if(isEditable(el))return true;',
    '  if(isEditorCls(el.className))return true;',
    '  var sel=isAttr?ATTR_SKIP_SEL:CONTENT_SKIP_SEL;',
    '  if(el.closest){try{return !!el.closest(sel);}catch(e){}}',
    '  var c=el.parentElement;',
    '  while(c){',
    '    var ctag=c.tagName;',
    '    if((!isAttr&&SKIP_TAGS[ctag])||(isAttr&&ctag!=="TEXTAREA"&&ctag!=="textarea"&&SKIP_TAGS[ctag])||isEditable(c)||c.ownerSVGElement)return true;',
    '    if(isEditorCls(c.className))return true;',
    '    c=c.parentElement;',
    '  }',
    '  return false;}',
    'function tr(s){',
    '  var len=s.length;if(len===0)return null;',
    '  var c0=s.charCodeAt(0),cEnd=s.charCodeAt(len-1);',
    '  var start=0,end=len;',
    '  if(isSpace(c0)){while(start<len&&isSpace(s.charCodeAt(start)))start++;if(start===len)return null;}',
    '  if(isSpace(cEnd)){while(end>start&&isSpace(s.charCodeAt(end-1)))end--;}',
    '  var core=(start===0&&end===len)?s:s.slice(start,end);',
    '  var fc=core.charCodeAt(0);',
    '  if(fc>=0x4e00&&fc<=0x9fa5)return null;',
    '  var isAlpha=(fc>=65&&fc<=90)||(fc>=97&&fc<=122);',
    '  var isDigit=(fc>=48&&fc<=57);',
    '  if(!isAlpha&&!isDigit&&!ALPHA_RE.test(core))return null;',
    '  if(missCurr.has(core)||missPrev.has(core))return null;',
    '  if(hasOwn.call(dict,core)){',
    '    var v=dict[core];',
    '    return (start===0&&end===len)?v:(s.slice(0,start)+v+s.slice(end));',
    '  }',
    // 归一化兜底：精确未命中时查归一化索引。
    // needsNorm 为真才构造归一化键；为假说明 core 已是规范形态，直接拿它查表（零分配）。
    // 这里不能跳过查找——索引里的键来自词典中的非规范写法（"Dashboard" → "dashboard"），
    // 跳过就会漏掉「词典只有 Title Case、界面出现全小写」这类情况。
    '  if(NORM!==null){',
    '    var nv=needsNorm(core)?normLookup(core):NORM[core];',
    '    if(nv!==null&&nv!==undefined)return (start===0&&end===len)?nv:(s.slice(0,start)+nv+s.slice(end));',
    '  }',
    '  var bucket=RC.byChar[core.charAt(0)];',
    '  if(bucket){',
    '    for(var i=0;i<bucket.length;i++){',
    '      var rr=bucket[i];',
    '      if(rr[0].test(core)){',
    '        var res=core.replace(rr[0],rr[1]);',
    '        return (start===0&&end===len)?res:(s.slice(0,start)+res+s.slice(end));',
    '      }',
    '    }',
    '  }',
    '  for(var j=0;j<RC.always.length;j++){',
    '    var ra=RC.always[j];',
    '    if(ra[0].test(core)){',
    '      var rres=core.replace(ra[0],ra[1]);',
    '      return (start===0&&end===len)?rres:(s.slice(0,start)+rres+s.slice(end));',
    '    }',
    '  }',
    '  if(missCurr.size>=2000){missPrev=missCurr;missCurr=new Set();}',
    '  missCurr.add(core);',
    '  return null;}',
    'var nodeMap=new WeakMap();',
    'var dataRev=0;',    'var BREAK_COOLDOWN=1000;',
    // 冷却中的节点到期后必须主动重试：MutationObserver 只在 DOM 变更时触发，
    // 节点一旦不再被改写就再没有机会被翻译，会永久停在英文。
    'var cooldownQueue=[];var cooldownTimer=null;',
    'function enqueueCooldown(n,until){',
    '  cooldownQueue.push([n,until]);',
    '  if(cooldownTimer!==null)return;',
    '  cooldownTimer=setTimeout(drainCooldown,BREAK_COOLDOWN+50);}',
    'function drainCooldown(){',
    '  cooldownTimer=null;var list=cooldownQueue;cooldownQueue=[];',
    '  var now=Date.now();var again=[];',
    '  for(var i=0;i<list.length;i++){var n=list[i][0],until=list[i][1];',
    '    if(!n||n.nodeType!==3)continue;',
    '    if(until>now){again.push([n,until]);continue;}',
    '    try{trNodeFast(n);}catch(e){}}',
    '  if(again.length){cooldownQueue=again;cooldownTimer=setTimeout(drainCooldown,BREAK_COOLDOWN+50);}}',
    'function trRaw(n){',
    '  var val=n.nodeValue;if(!val||val.length===0||isAllSpace(val))return;',
    '  var rec=nodeMap.get(n);',
    '  var now=Date.now();',
    // 熔断只冷却固定时长：冷却期满自动重试，避免个别节点被永久钉死在英文
    '  if(rec){if(rec.brokenUntil>now)return;if(val===rec.val)return;}',
    '  var zh=tr(val);',
    '  if(zh===null||zh===val){',
    '    if(rec){rec.val=val;rec.unhit=true;}else{nodeMap.set(n,{val:val,count:0,ts:now,brokenUntil:0,unhit:true});}',
    '    return;',
    '  }',
    '  if(rec){',
    '    if(zh===rec.val&&now-rec.ts<500){rec.count++;',
    // 同一译文的反复回写超过 2 次即冷却 1 秒；冷却期内只读不写，框架持续回写时也不会打死主线程
    '      if(rec.count>2){rec.brokenUntil=now+BREAK_COOLDOWN;rec.ts=now;rec.count=0;enqueueCooldown(n,rec.brokenUntil);return;}}',
    '    else{rec.count=1;rec.ts=now;}',
    '    rec.val=zh;rec.unhit=false;',
    '  }else{rec={val:zh,count:1,ts:now,brokenUntil:0,unhit:false};nodeMap.set(n,rec);}',
    '  n.nodeValue=zh;',
    '}',
    'function trNodeFast(n){',
    '  if(!n||n.nodeType!==3)return;',
    '  var rec=nodeMap.get(n);',
    '  if(rec){if(rec.brokenUntil>Date.now())return;if(n.nodeValue===rec.val)return;}',
    '  if(isComposing)return;',
    '  var p=n.parentElement||n.parentNode;if(!p||p.nodeType!==1)return;',
    '  if(isEditable(p))return;',
    '  if(isSkipped(p,false))return;',
    '  trRaw(n);',
    '}',
    'var trNode=trNodeFast;',
    // 只裁剪「文本与属性都绝缘」的子树；textarea 文本禁译但占位符要译，不能整棵剪掉
    'var twFilter={acceptNode:function(node){',
    '  if(node.nodeType!==1)return 1;',
    '  if(!isRejectEl(node))return 1;',
    '  var tag=node.tagName;',
    '  if(tag==="TEXTAREA"||tag==="textarea")return 1;',
    '  return 2;}};',
    'function trAttrsOnElement(el){',
    '  if(isSkipped(el,true))return;',
    '  for(var j=0;j<ATTRS.length;j++){',
    '    var a=ATTRS[j];var val=el.getAttribute(a);if(!val||val.length===0)continue;',
    '    var nv=tr(val);if(nv!==null&&nv!==val){el.setAttribute(a,nv);}',
    '  }',
    '}',
    'function hasTrAttrs(el){',
    '  if(!el.hasAttributes||!el.hasAttributes())return false;',
    '  for(var j=0;j<ATTRS.length;j++){if(el.hasAttribute(ATTRS[j]))return true;}',
    '  return false;}',
    'function walk(root){if(!root)return;var job=makeJob(root);',
    '  if(job.done)return;',
    // 同步阶段至少推进 MIN_SYNC 项：小改动（React 单行状态）必须绘制前完成，否则就是肉眼可见闪烁
    '  var deadline=nowMs()+SLICE_MS;',
    '  try{if(stepJob(job,deadline,MIN_SYNC))return;}catch(e){return;}',
    // 同步部分用完时间片：剩余节点交给延迟队列，保证同帧小改动不被大扫描挤在后面
    '  deferJob(job);}',
    // 文本与属性在同一次遍历里共享 8ms 时间片：属性不再整段同步扫完，也不会被文本分支饿死
    'var SLICE_MS=8,MIN_SYNC=64;',
    'var nowMs=(typeof performance!=="undefined"&&performance.now)?function(){return performance.now();}:function(){return Date.now();};',
    'var jobQueue=[],pumpTimer=null,pumping=false;',
    'function makeJob(root){',
    '  var job={root:root,tw:null,work:0};',
    '  if(root.nodeType===3){trNodeFast(root);job.done=true;return job;}',
    '  if(root.nodeType===1&&hasTrAttrs(root)){trAttrsOnElement(root);}',
    '  if(document.createTreeWalker){job.tw=document.createTreeWalker(root,5,twFilter);}',
    '  return job;}',
    // minWork 用于同步阶段保证前进；续摊阶段传 0，让出更积极
    'function stepJob(job,deadline,minWork){',
    '  minWork=minWork||0;',
    '  if(job.tw){var n;',
    '    while(true){',
    '      n=job.tw.nextNode();',
    '      if(!n){job.tw=null;break;}',
    '      if(n.nodeType===3){trNodeFast(n);}',
    '      else if(n.nodeType===1&&hasTrAttrs(n)){trAttrsOnElement(n);}',
    // 先做一项再判预算：保证每次都前进，超出最多一项且单项成本有界
    '      if(++job.work>minWork&&nowMs()>deadline)return false;',
    '    }}',
    '  job.done=true;return true;}',
    'function pump(){pumpTimer=null;pumping=true;',
    '  var deadline=nowMs()+SLICE_MS;',
    '  try{',
    // 跨任务边界也判预算：上一个任务的最后一项可能已经用光时间片，不能再开新任务
    '    while(jobQueue.length&&nowMs()<=deadline){',
    '      if(!stepJob(jobQueue[0],deadline))break;',
    '      jobQueue.shift();',
    '    }',
    '  }catch(e){jobQueue.shift();}',
    '  pumping=false;',
    '  if(jobQueue.length){pumpTimer=setTimeout(pump,0);}}',
    'function deferJob(job){jobQueue.push(job);',
    '  if(pumping||pumpTimer!==null)return;pumpTimer=setTimeout(pump,0);}',
    'var timer=null,pending=[];',
    'function flush(){var list=pending;pending=[];',
    '  for(var i=0;i<list.length;i++){var job=makeJob(list[i]);if(!job.done){jobQueue.push(job);}}',
    '  if(jobQueue.length&&!pumping&&pumpTimer===null){pumpTimer=setTimeout(pump,0);}}',
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
    // rev 为可选词典版本号：多窗口并发热载时，慢窗口的旧 payload 不得覆盖新 payload
    '  setData:function(nd,rev){if(!nd){return;}',
    '    if(rev>0){if(rev<=dataRev){return;}dataRev=rev;}',
    '    D=nd;dict=nd.dict||{};missCurr.clear();missPrev.clear();normHit.clear();nodeMap=new WeakMap();cooldownQueue=[];if(cooldownTimer!==null){clearTimeout(cooldownTimer);cooldownTimer=null;}RC=compileRules(nd.rules);NORM=NE.compileNorm(dict,true);try{walk(document.body);}catch(e){}}};',
    'walk(document.body);var t0=tr(document.title);if(t0){document.title=t0;}'
].join('\n');
// Subagent 运行时长原生动态显示模块 2.0 (Zero-Flicker, Persistence & Adaptive Scheduling)
const SUBAGENT_TIMER_BODY = [
    ';(function(){',
    '  var taskTimes=new Map();',
    '  var TIMER_CLEAN_RE=/·\\s*\\d+[smh].*/g;',
    '  var STORAGE_PREFIX="__agy_st_";',
    '  function getStored(k){',
    '    try{',
    '      if(typeof sessionStorage!=="undefined"){',
    '        var v=sessionStorage.getItem(STORAGE_PREFIX+k);',
    '        if(v){var n=Number(v);if(n>0&&n<=Date.now())return n;}',
    '      }',
    '    }catch(e){}',
    '    return null;',
    '  }',
    '  function setStored(k,v){',
    '    try{',
    '      if(typeof sessionStorage!=="undefined"){',
    '        sessionStorage.setItem(STORAGE_PREFIX+k,String(v));',
    '      }',
    '    }catch(e){}',
    '  }',
    '  function delStored(k){',
    '    try{',
    '      if(typeof sessionStorage!=="undefined"){',
    '        sessionStorage.removeItem(STORAGE_PREFIX+k);',
    '      }',
    '    }catch(e){}',
    '  }',
    '  function getNativeTime(el){',
    '    if(!el)return null;',
    '    try{',
    '      var cur=el;',
    '      for(var i=0;i<3&&cur;i++){',
    '        if(cur.dataset){',
    '          var ds=cur.dataset;',
    '          var t=ds.createdAt||ds.startTime||ds.timestamp||ds.created;',
    '          if(t){var pt=Number(t)||Date.parse(t);if(pt>0&&pt<=Date.now())return pt;}',
    '        }',
    '        cur=cur.parentElement;',
    '      }',
    '      var keys=Object.keys(el);',
    '      for(var k=0;k<keys.length;k++){',
    '        var key=keys[k];',
    '        if(key.indexOf("__reactFiber$")===0||key.indexOf("__reactProps$")===0){',
    '          var obj=el[key];if(!obj)continue;',
    '          var p=obj.memoizedProps||obj;',
    '          var task=p.task||p.item||p.node||p.cascade||p;',
    '          if(task){',
    '            var ct=task.createdAt||task.startTime||task.timestamp||task.startedAt;',
    '            if(ct){var pt2=Number(ct)||Date.parse(ct);if(pt2>0&&pt2<=Date.now())return pt2;}',
    '          }',
    '        }',
    '      }',
    '    }catch(e){}',
    '    return null;',
    '  }',
    '  function resolveStartTime(k,el){',
    '    var t=taskTimes.get(k);if(t)return t;',
    '    var nat=getNativeTime(el);',
    '    if(nat){taskTimes.set(k,nat);setStored(k,nat);return nat;}',
    '    var st=getStored(k);',
    '    if(st){taskTimes.set(k,st);return st;}',
    '    var now=Date.now();',
    '    taskTimes.set(k,now);setStored(k,now);return now;',
    '  }',
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
    '    var activeKeys=new Set();',
    '    // 1. 图 1: 输入框上方的 running-items-panel (正在运行项面板)',
    '    var panel=document.querySelector(\'[data-testid="running-items-panel"]\');',
    '    if(panel){',
    '      var itemRows=panel.querySelectorAll(\'.overflow-y-auto > div, [class*="flex items-center"]\');',
    '      for(var r=0;r<itemRows.length;r++){',
    '        var row=itemRows[r];',
    '        var txtEl=row.querySelector(\'span, .text-sm, .truncate\')||row;',
    '        var rawText=txtEl.textContent.replace(TIMER_CLEAN_RE,"").trim();',
    '        if(rawText&&rawText.length>1&&!rawText.includes("running")&&!rawText.includes("运行中")&&!rawText.includes("subagent")){',
    '          var pk="panel_"+rawText;',
    '          activeKeys.add(pk);',
    '          var pst=resolveStartTime(pk,row);',
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
    '        activeKeys.add(cid);',
    '        var nst=resolveStartTime(cid,node);',
    '        var nelap=(now-nst)/1000;',
    '        var nsp=getSpan(statusEl,"ag-node-sub-timer");',
    '        nsp.textContent="· "+fmtDur(nelap);',
    '      }',
    '    }',
    '    // 垃圾回收：对超过 2 小时未活跃的 key 进行清理',
    '    taskTimes.forEach(function(val,k){',
    '      if(!activeKeys.has(k)&&(now-val>7200000)){taskTimes.delete(k);delStored(k);}',
    '    });',
    '  }',
    '  function onVisibilityChange(){',
    '    if(document.hidden){',
    '      if(window.__agTimerInterval){clearInterval(window.__agTimerInterval);window.__agTimerInterval=null;}',
    '    }else{',
    '      tick();',
    '      if(!window.__agTimerInterval){window.__agTimerInterval=setInterval(tick,1000);}',
    '    }',
    '  }',
    '  if(typeof document!=="undefined"&&document.addEventListener){',
    '    document.removeEventListener("visibilitychange",onVisibilityChange);',
    '    document.addEventListener("visibilitychange",onVisibilityChange);',
    '  }',
    '  if(window.__agTimerInterval){clearInterval(window.__agTimerInterval);}',
    '  window.__agTimerInterval=setInterval(tick,1000);',
    '  tick();',
    '})();'
].join('\n');
function buildScript(dic) {
    return '(function(){if(window.__antigravityZh){window.__antigravityZh.retranslate();return;}' +
        TRANSLATOR_BODY.replace('__DATA__', JSON.stringify(dic)).replace('__NORM__', NORM_SRC) + '\n' +
        SUBAGENT_TIMER_BODY +
        '})()';
}
// 已注册窗口与词典监视状态（模块级，多窗口共享）
const registeredWindows = new Set();
let watchStarted = false;
// 词典版本号：热载推送时递增，页面侧据此丢弃迟到的旧 payload。
// 必须与 sync-dict.js 的 CDP 推送处于同一量级（都用毫秒时间戳），
// 否则较小的一方会被页面永久判为陈旧而丢弃。
let dictRev = 0;
// 词典热载：文件变更后把新词典推送到所有已注册窗口
function pushDictionaryToWindows() {
    let dic;
    try {
        dic = loadDictionary();
    }
    catch (e) {
        return;
    }
    // 与其他推送源（sync-dict.js 用 Date.now()）保持同一时间尺度，
    // 并保证即使同一毫秒内连续推送也严格递增。
    dictRev = Math.max(Date.now(), dictRev + 1);
    const js = 'window.__antigravityZh&&window.__antigravityZh.setData(' + JSON.stringify(dic) + ',' + dictRev + ')';
    for (const w of registeredWindows) {
        if (!w || w.isDestroyed()) {
            registeredWindows.delete(w);
            continue;
        }
        w.webContents.executeJavaScript(js, true).catch(() => { });
    }
}
// fs.watch 不可用时的兜底：轮询词典 mtime
function startMtimePoll(dicPath, onChange) {
    let last = 0;
    try {
        last = fs.statSync(dicPath).mtimeMs;
    }
    catch (e) {
        return;
    }
    const timer = setInterval(() => {
        let m = 0;
        try {
            m = fs.statSync(dicPath).mtimeMs;
        }
        catch (e) {
            return;
        }
        if (m !== last) {
            last = m;
            onChange();
        }
    }, 500);
    if (timer.unref) {
        timer.unref();
    }
}
function startDictionaryWatch() {
    const dicPath = path.join(__dirname, 'cockpit-zh.json');
    let reloadTimer = null;
    const onChange = () => {
        if (reloadTimer) {
            clearTimeout(reloadTimer);
        }
        reloadTimer = setTimeout(pushDictionaryToWindows, 200);
    };
    try {
        const watcher = fs.watch(dicPath, onChange);
        // FSWatcher 的 error 是异步事件，外层 try/catch 接不住，未处理会直接终止主进程
        watcher.on('error', () => {
            try {
                watcher.close();
            }
            catch (e) { }
            startMtimePoll(dicPath, onChange);
        });
    }
    catch (e) {
        // 词典监视失败不影响基础翻译功能，降级为轮询
        startMtimePoll(dicPath, onChange);
    }
}
/**
 * 为窗口附加网页 UI 翻译：每次 did-finish-load 后注入词典翻译脚本。
 * 词典热更新：修改 cockpit-zh.json 后自动推送到已打开窗口（无需手动刷新）。
 */
function attachWebTranslator(win) {
    registeredWindows.add(win);
    if (typeof win.once === 'function') {
        win.once('closed', () => { registeredWindows.delete(win); });
    }
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
        startDictionaryWatch();
    }
}
