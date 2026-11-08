#!/usr/bin/env node
'use strict';

/**
 * 汉化词典审计：漏译、死条目、译文质量。
 *
 * 设计边界（务必保留）：
 * - 只读：**绝不写** src/cockpit-zh.json，也不调用 add-terms。输出只到 stdout 或 --out 指定的文件。
 * - 结论必须带证据：每条判定都附证明它存在/不存在的依据（字面量上下文或模板）。
 *
 * 核心教训（本脚本存在的理由）：
 *   `bundle.includes("Project deleted")` 返回 false，**不等于**界面不会出现这句。
 *   渲染层大量文案是模板拼出来的：`` `${w.capitalized} deleted` ``，源码里没有整串。
 *   曾据此把 "Project deleted" 误判为死条目。因此死条目判定必须同时看两条路：
 *     ① 字面量出现    ② 能被某个 `${...}` 模板生成
 *
 * 用法：
 *   node scripts/audit-i18n.js                      # 全量报告（需要 bundle 才能查漏译/死条目）
 *   node scripts/audit-i18n.js --quality            # 只做词典自身质量检查（不需要 bundle）
 *   node scripts/audit-i18n.js --bundle <dir>       # 指定渲染层 bundle 目录（含 ui*.js）
 *   node scripts/audit-i18n.js --out <file>         # 导出结构化 JSON
 *   node scripts/audit-i18n.js --strict             # 有问题时退出码 1（默认恒为 0）
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DICT_PATH = path.join(REPO_ROOT, 'src', 'cockpit-zh.json');

/**
 * 模板里每个占位符的候选取值（按表达式特征匹配，顺序即优先级）。
 * 只收录「取值可枚举」的表达式：项目/工作区变量、以及计数型变量。
 * 其余一律视为不可枚举（见 sampleFromTemplate），因为乱填会造出
 * 根本不会出现在界面上的假字符串（实测会产生 "Failed to open workspace: 3" 这类噪声）。
 */
const PLACEHOLDER_VALUES = [
    { test: /capitalized/, values: ['Project', 'Workspace'] },
    { test: /lowercasePlural/, values: ['projects', 'workspaces'] },
    { test: /lowercase/, values: ['project', 'workspace'] },
    {
        test: /(^|\.)(length|count|num\w*|size|total\w*|index|step|n|i|m)$/,
        values: ['3'],
    },
];

/** 全部可调参数集中在这里，改判定请改这个对象，不要散落到下方。 */
const RULES = {
    placeholderValues: PLACEHOLDER_VALUES,
    /** 模板字面量必须至少有一个「有特征」的片段，否则判定过宽，直接丢弃。 */
    minLiteralEnglishChars: 5,
    /** 模板字面量命中这些特征说明是代码/CSS/HTML，不是界面文案。 */
    codeSignals: [
        'class=', 'className', 'var(--', 'rgba(', 'url(', 'createElement',
        'data-testid', 'style=', 'px ', 'flex ', 'text-', 'border-', '${',
    ],
    /** 译文里允许原样保留的技术/品牌词（不算「未翻译」）。 */
    allowLatin: [
        'Google', 'Gemini', 'Antigravity', 'GitHub', 'GitLab', 'Gerrit', 'Markdown',
        'Claude', 'OpenAI', 'Anthropic', 'Chrome', 'Chromium', 'Node', 'npm', 'Windows',
        'macOS', 'Linux', 'WSL', 'Docker', 'Python', 'TypeScript', 'JavaScript', 'JSON',
        'YAML', 'TOML', 'MCP', 'LLM', 'GPU', 'CPU', 'HTTP', 'HTTPS', 'SSH', 'HTML', 'CSS',
        'SQL', 'CSV', 'PDF', 'PNG', 'JPG', 'SVG', 'ZIP', 'Slack', 'Notion', 'Linear',
        'Stripe', 'Figma', 'Cursor', 'JetBrains', 'Vim', 'Emacs', 'Bash', 'PowerShell',
        'Zsh', 'Fish', 'Token', 'Prompt', 'Agent', 'Skills', 'Hooks', 'Sandbox',
        'Workflow', 'Sidecar', 'Artifact', 'Subagent', 'Fork', 'REPL', 'IDE', 'SDK',
        'CLI', 'API', 'URL', 'URI', 'DevTools', 'WebView', 'Boost', 'Team', 'Pro', 'Free',
        'Plus', 'Enterprise', 'Beta', 'Alpha', 'LTS', 'Git', 'Commit', 'Merge', 'Rebase',
        'Pull', 'Push', 'Patch', 'Widget', 'Kanban', 'Sky', 'Sonnet', 'Opus', 'Haiku',
        'Flash', 'Ultra', 'Enter', 'Shift', 'Alt', 'Ctrl', 'Option', 'Cmd', 'Tab', 'Esc',
        'Best', 'Battle', 'Chief', 'Staff', 'Live', 'Turbo', 'Origin', 'Hub', 'Cloud',
        'Drive', 'Office', 'Word', 'Excel', 'PowerPoint', 'Android', 'Unicode', 'Issue',
        'refs', 'repo', 'org', 'shell', 'gcert', 'main', 'Data', 'Kit',
    ],
    /** 术语一致性：[说明, 英文源正则, 违规译文正则]。 */
    termChecks: [
        ['Marketplace 应为「扩展市场」', /marketplace/i, /(?<!扩展)市场(?!扩展)/],
        ['Artifact 应为「成果」', /artifact/i, /制品|工件|产物/],
        ['Sandbox 应为「沙盒」', /\bsandbox/i, /沙箱/],
        ['Subagent 应为「子智能体」', /sub-?agents?\b/i, /子代理/],
        ['agent 应为「智能体」而非「代理」', /\bagents?\b/i, /(?<!子)代理/],
        ['Fork 应为「派生」', /\bfork/i, /分叉|复刻/],
        ['Side question 应为「侧边提问」', /\bside questions?\b/i, /边问题|侧问题/],
        ['Sidecar 应为「侧边视图」', /\bsidecar/i, /边车|侧车/],
        ['Token 保留英文', /\btokens?\b/, /令牌/],
        ['Workspace 应为「工作区」', /\bworkspace/i, /工作空间/],
    ],
};

// ---------------------------------------------------------------------------
// 纯函数部分（可被测试单独调用，不依赖 11 MB bundle）
// ---------------------------------------------------------------------------

/** 抽出源码里所有模板字面量的「内文」（不含反引号）。 */
function templateBodies(source) {
    const out = [];
    const re = /`((?:[^`\\]|\\[\s\S])*)`/g;
    let m;
    while ((m = re.exec(source))) out.push(m[1]);
    return out;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把模板字面量切成「字面段 + 占位符」交替的片段。 */
function splitTemplate(tpl) {
    return tpl.split(/\$\{[^}]*\}/);
}

/** 模板里是否含有占位符。 */
function hasPlaceholder(tpl) {
    return /\$\{[^}]*\}/.test(tpl);
}

/**
 * 模板 → 匹配「它可能生成的整串」的正则。
 * 判定刻意放宽（占位符用 [\s\S]*?），宁可漏判死条目，也不误杀真条目。
 * 返回 null 表示这个模板不适合用来做存在性判定。
 *
 * 两条放行条件都只针对「代码/日志/CSS」，不放宽到「任何带 ${} 的字面量」：
 * 否则 `${a}` 这类会匹配一切，死条目检查直接失效（实测 templates=0 时
 * dead 暴增到 490 条，全是误报）。
 */
function templateToRegex(tpl) {
    if (!hasPlaceholder(tpl)) return null;
    const parts = splitTemplate(tpl);
    // 像代码/CSS/HTML 的模板一律不参与判定。
    // 必须排除 '${' 这个信号：tpl 本身必然含 ${}，否则会把所有模板全毙掉
    // （实测导致 templates=0、dead 暴增到 490 条，全是误报）。
    if (RULES.codeSignals.some((sig) => sig !== '${' && tpl.includes(sig))) return null;

    // 至少要有一个「长的自然语言片段」：连续英文短语，允许空格与标点
    const natural = parts.some((p) => {
        const t = p.trim();
        return t.length >= RULES.minLiteralEnglishChars
            && /^[A-Za-z0-9 ,.'()\-\u2019\u2026]+$/.test(t)
            && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(t);
    });
    // 或者模板形如 `<English> ${x}` / `${x} <English>`，字面段本身是个完整短语
    const boundary = parts.some((p) => {
        const t = p.trim();
        return t.length >= RULES.minLiteralEnglishChars
            && /^[A-Za-z][A-Za-z0-9 ,.'()\-\u2019\u2026]*$/.test(t);
    });
    if (!natural && !boundary) return null;

    const startsWithPh = /^\$\{/.test(tpl);
    const endsWithPh = /\$\{[^}]*\}$/.test(tpl);
    let body = parts
        .map((p) => escapeRe(p.replace(/\\n|\\r|\\t/g, ' ').replace(/\s+/g, ' ').trim()))
        .join('[\\s\\S]*?');
    body = body.replace(/ /g, '\\s+');
    return new RegExp((startsWithPh ? '' : '^') + body + (endsWithPh ? '' : '$'));
}

/** 给占位符挑一个候选值；返回 null 表示「取值不可枚举」。 */
function sampleValueFor(expr) {
    for (const rule of RULES.placeholderValues) {
        if (rule.test.test(expr)) return rule.values[0];
    }
    return null;
}

/**
 * 枚举模板的一个具体取值（用于喂给 tr() 查漏译）。
 *
 * 只要有一个占位符的取值不可枚举，就返回 null 放弃这条模板——
 * 乱填会造出界面上根本不存在的字符串（例如把 `${g.message}` 填成 "3"，
 * 得到 "Failed to open workspace: 3"），进而把噪声当成漏译报出来。
 * 宁可少报，也不制造假阳性：假阳性会浪费人工逐条复核的时间。
 */
function sampleFromTemplate(tpl) {
    const re = /\$\{([^}]*)\}/g;
    let out = tpl;
    let m;
    let skipped = false;
    while ((m = re.exec(tpl))) {
        const v = sampleValueFor(m[1]);
        if (v === null) { skipped = true; break; }
        out = out.replace(m[0], v);
    }
    if (skipped) return null;
    return out
        .replace(/\\n|\\r|\\t/g, ' ')
        .replace(/\\+u2026/g, '\u2026')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 这条字符串像不像界面文案（而不是代码片段/CSS 类名）。
 *
 * 允许以数字开头：`3 browser steps`、`12 lines added, 3 lines removed` 都是真文案，
 * 而计数类文案正是本仓库最容易漏译的一类。
 * 反过来必须挡掉 CSS 工具类串（`w-full h-full relative`）：特征是「全小写 + 连字符词
 * 由空白分隔、无大写字母、无标点」。
 */
function looksLikeUiText(s) {
    if (!s || s.length < 4) return false;
    if (s.length > 160) return false;
    if (RULES.codeSignals.some((sig) => sig !== '${' && s.includes(sig))) return false;
    if (/[{};=<>]/.test(s)) return false;
    // 至少两个英文单词（允许数字开头的计数文案）
    if (!/^[0-9A-Za-z]/.test(s)) return false;
    if (!/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s)) return false;
    // CSS 工具类串：特征是「含连字符/冒号等工具类标记的小写词」由空白分隔，
    // 且整体无大写字母、无标点。必须要求至少一个 token 带连字符或冒号，
    // 否则 `3 browser steps` 这类全小写的计数文案会被误判成 CSS（实测踩过）。
    const tokens = s.trim().split(/\s+/);
    const hasUtilityMarker = tokens.some((t) => /[-:]/.test(t));
    const cssish = tokens.length >= 2
        && hasUtilityMarker
        && tokens.every((t) => /^[a-z0-9:/[\].%!-]+$/.test(t))
        && !/[A-Z]/.test(s)
        && !/[.,!?:'\u2019"]/.test(s);
    if (cssish) return false;
    return true;
}

/**
 * 这条字符串像不像「给人看的界面文案」。
 * 在 looksLikeUiText 之上再排除开发者才会看到的东西：控制台报错、断言、
 * 序列化警告、库内部提示。这些即使未翻译也不该进词典（会污染词表，
 * 且实测会让 missing 从 30 条涨到 259 条，几乎全是噪声）。
 */
function looksLikeUserFacing(s) {
    if (!looksLikeUiText(s)) return false;
    const noisy = [
        /\blocalStorage\b/i, /\bsessionStorage\b/i, /\bJSON\b/, /\bnull\b/, /\bundefined\b/,
        /\bNaN\b/, /\btypeof\b/, /\bstack\b/i, /\bstacktrace\b/i, /\bassert/i,
        /\bserializ/i, /\bdeserializ/i, /\bImmer\b/, /\bproduce\b/, /\breducer\b/i,
        /\blistener\b/i, /\bcallback\b/i, /[A-Za-z]+\(\)/, /\bexpected the\b/i,
        /\breceived:/i, /\bplugin for\b/i, /\bvariant declares\b/i, /\bconfig\b/i,
        /\bwebsocket\b/i, /\bgrpc\b/i, /\bprotobuf\b/i, /\bout of range\b/i,
        /\bstatus code\b/i, /\bContent-Type\b/i, /\bcodicon\b/i, /\bworker RPC\b/i,
        // 「小写动词开头 + 逗号 + instead received」是库的断言句式，
        // 与界面文案 "Failed to ..." / "3 browser steps" 有明显区别
        /^[a-z][a-z ]*,\s*(instead|but)\s/i,
        /\bexpected (an?|all|first)\b/i,
        // 「<动作> <对象>: <一个裸数字>」几乎都是把动态值拼进了日志/错误串，
        // 不是给人看的固定文案（"Failed to open workspace: 3"）。真界面文案
        // 如 "3 browser steps" 不会以「动词短语 + 冒号 + 裸数字」结尾。
        /^[A-Za-z][A-Za-z ]+:\s*\d+$/,
    ];
    return !noisy.some((re) => re.test(s));
}

/**
 * 从源码文本里抽出「可能生成界面文案的模板正则」。
 * 这是死条目判定的第二条路——少了它就会把 `Project deleted` 误判为死条目。
 */
function collectTemplateRegexes(source) {
    const out = [];
    const seen = new Set();
    for (const tpl of templateBodies(source)) {
        if (!hasPlaceholder(tpl)) continue;
        const sample = sampleFromTemplate(tpl);
        // 样本必须「像界面文案」才认为这个模板会产出 UI 文本；
        // 取样不可枚举（null）时，退化为只看字面段是否够长像英文短语。
        if (sample === null) {
            const lit = splitTemplate(tpl).join(' ').trim();
            if (!/[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(lit)) continue;
        } else if (!looksLikeUiText(sample)) {
            continue;
        }
        const re = templateToRegex(tpl);
        if (!re) continue;
        if (seen.has(re.source)) continue;
        seen.add(re.source);
        out.push({ tpl, re });
    }
    return out;
}

/**
 * 收集「字符串拼接」形态产生的完整文案。
 *
 * 除了反引号模板，bundle 里还大量使用 `+` 拼字符串，并配三元做可选后缀：
 *   "Ask anything, @ to mention" + (c ? ", / for actions" : "")
 * 这种写法整串在源码里根本不存在，只查字面量会误判成死条目。
 * 这里把三元两个分支都展开，得到真实会出现的完整串。
 *
 * 只处理「字面量 + (cond ? "a" : "b")」这一种形态：它是本项目里唯一出现的拼接方式，
 * 而通配更复杂的 `+` 表达式会让判定失去区分度。
 */
function concatCandidates(source) {
    const out = new Set();
    const re = /(["\u2018\u2019'`])([^"'`\\]{8,120})\1\s*\+\s*\(?\s*[^;{}()]{0,80}?\?\s*(["\u2018\u2019'`])([^"'`\\]{0,60})\3\s*:\s*(["\u2018\u2019'`])([^"'`\\]{0,60})\5/g;
    let m;
    while ((m = re.exec(source))) {
        const head = m[2];
        if (!/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(head)) continue;
        out.add(head + m[4]);
        out.add(head + m[6]);
    }
    return out;
}

/**
 * 判断某条词条是否「可能出现」。四条路都要走，缺一条就会误判：
 *   ① 源码里有这个子串（含被更大字符串包含的情形，故用 includes 而非精确相等）
 *   ② 大小写不同的同一串 —— 引擎归一化会命中，`Find in conversation` 与
 *      bundle 里的 `Find in Conversation` 是同一个词条
 *   ③ 能被某个 `${...}` 模板拼出来 —— 这一条是 `Project deleted` 得以免于误杀的原因
 *   ④ 能被 `+` 拼接出来 —— `Ask anything, @ to mention, / for actions` 属这一类
 *
 * 关于 ①：不能把源码切成「词」再精确比对。切分边界与真实字符串边界不对齐，
 * 会把大量真实存在的词条判成死条目（实测一次误报 500+ 条）。
 *
 * @returns {{ok:boolean, why:string}} ok=false 才是疑似死条目
 */
function checkReachable(key, ctx) {
    if (ctx.source.includes(key)) return { ok: true, why: '字面量出现' };

    // 不含中文的键才做大小写宽松匹配：中文键没有大小写概念，
    // 而小写化会破坏 `ID` / `URL` 这类缩写的区分度。
    if (!/[\u4e00-\u9fff]/.test(key)) {
        if (ctx.sourceLower.includes(key.toLowerCase())) {
            return { ok: true, why: '归一化命中（大小写变体）' };
        }
    }

    for (const { tpl, re } of ctx.templateRegexes) {
        if (re.test(key)) return { ok: true, why: '可由模板生成: ' + tpl };
    }
    if (ctx.concatCandidates.has(key)) {
        return { ok: true, why: '可由字符串拼接生成' };
    }
    // 尾部同类标点也会被归一化吸收
    const trimmed = key.replace(/[.。!！?？:：…\s]+$/g, '');
    if (trimmed !== key && ctx.source.includes(trimmed)) {
        return { ok: true, why: '归一化命中（尾部标点变体）' };
    }
    return { ok: false, why: '既非字面量，也无法由任何模板/拼接生成' };
}

// ---------------------------------------------------------------------------
// 语料读取
// ---------------------------------------------------------------------------

function readCorpus(dirs) {
    const chunks = [];
    const files = [];
    for (const dir of dirs) {
        if (!dir || !fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
            if (!/\.(js|mjs)$/.test(f)) continue;
            const p = path.join(dir, f);
            try {
                const st = fs.statSync(p);
                if (!st.isFile()) continue;
                chunks.push(fs.readFileSync(p, 'latin1'));
                files.push({ path: p, bytes: st.size });
            } catch (e) { /* 单个文件读失败不影响整体 */ }
        }
    }
    return { text: chunks.join('\n'), files };
}

/** 默认的渲染层 bundle 目录：沿用 auto-review.js 的 findings 约定。 */
function defaultBundleDir() {
    return process.env.AUDIT_BUNDLE
        || path.join('C:', 'Users', '35332', '.gemini', 'antigravity', 'brain',
            '008f16c3-08fc-461a-afe6-25eb0b08548e', 'scratch', 'findings');
}

/** 默认的主进程 asar 解包目录（右键菜单等原生文案在这里）。 */
function defaultAppDistDir() {
    const base = process.env.LOCALAPPDATA;
    return base ? path.join(base, 'Programs', 'antigravity', 'resources', 'app', 'dist') : null;
}

// ---------------------------------------------------------------------------
// 真实 tr()：必须走注入脚本，不能直接查 dict
// ---------------------------------------------------------------------------

/**
 * 用 JSDOM 加载 zh-i18n.js 的 attachWebTranslator，把内部 tr 暴露出来。
 * 直接查 dict[key] 会得出和界面不一致的结论（引擎还有归一化、歧义组作废、规则兜底三层）。
 */
function makeTr() {
    const { JSDOM } = require('jsdom');
    const SIM = path.join(REPO_ROOT, 'tests', '.audit-tr-sim');
    fs.rmSync(SIM, { recursive: true, force: true });
    fs.mkdirSync(SIM, { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'src', 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
    fs.copyFileSync(DICT_PATH, path.join(SIM, 'cockpit-zh.json'));

    const zh = require(path.join(SIM, 'zh-i18n.js'));
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
        runScripts: 'dangerously',
        url: 'http://localhost/',
    });
    const w = dom.window;
    const calls = [];
    const capWin = {
        isDestroyed: () => false,
        webContents: {
            on: (ev, fn) => { capWin._h = capWin._h || {}; capWin._h[ev] = fn; },
            executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
        },
    };
    zh.attachWebTranslator(capWin);
    capWin._h['did-finish-load']();
    const el = w.document.createElement('script');
    el.textContent = calls[0].replace(
        'window.__antigravityZh={', 'window.__test_tr=tr;window.__antigravityZh={');
    w.document.body.appendChild(el);
    const tr = w.__test_tr;
    const close = () => {
        try { w.close(); } catch (e) { /* ignore */ }
        fs.rmSync(SIM, { recursive: true, force: true });
    };
    if (typeof tr !== 'function') {
        close();
        throw new Error('注入脚本未暴露 tr()，无法做真实译文校验');
    }
    return { tr, close };
}

// ---------------------------------------------------------------------------
// 三类检查
// ---------------------------------------------------------------------------

/** ① 漏译：枚举模板取值，喂 tr()，返回没译出来的。 */
function findMissing(source, tr) {
    const seen = new Set();
    const out = [];
    for (const tpl of templateBodies(source)) {
        if (!hasPlaceholder(tpl)) continue;
        const sample = sampleFromTemplate(tpl);
        if (sample === null) continue;   // 取值不可枚举，无法构造可信样本
        if (!looksLikeUserFacing(sample)) continue;
        if (seen.has(sample)) continue;
        seen.add(sample);
        const zh = tr(sample);
        if (zh === null || zh === undefined || zh === sample) {
            out.push({ text: sample, template: tpl, zh: zh === undefined ? null : zh });
        }
    }
    return out;
}

/** ② 死条目：只读判定，绝不自动删除。 */
function findDead(dict, ctx) {
    const out = [];
    for (const key of Object.keys(dict)) {
        const r = checkReachable(key, ctx);
        if (!r.ok) out.push({ key, value: dict[key], why: r.why });
    }
    return out;
}

/** ③ 质量：未翻译的英文、术语冲突、标点变体不一致。 */
function findQuality(dict) {
    const allow = new Set(RULES.allowLatin);
    const untranslated = [];
    const termHits = [];
    const variantMismatch = [];

    for (const [k, v] of Object.entries(dict)) {
        // 未翻译：译文里还有成段英文，且不是白名单技术词
        const latin = (v.match(/[A-Za-z][A-Za-z0-9.'+-]{3,}/g) || []).filter((w) => !allow.has(w));
        const hasCjk = /[\u4e00-\u9fff]/.test(v);
        if (latin.length && !hasCjk) untranslated.push({ key: k, value: v, latin });
        for (const [label, enRe, badRe] of RULES.termChecks) {
            if (enRe.test(k) && badRe.test(v)) termHits.push({ rule: label, key: k, value: v });
        }
    }
    // 同一句子的标点变体之间，译文除标点外应一致
    const strip = (s) => s.replace(/[.。!！?？:：…\s]+$/g, '');
    const groups = new Map();
    for (const k of Object.keys(dict)) {
        const base = strip(k);
        if (!groups.has(base)) groups.set(base, []);
        groups.get(base).push(k);
    }
    for (const [base, keys] of groups) {
        if (keys.length < 2) continue;
        const bodies = new Set(keys.map((k) => strip(dict[k])));
        if (bodies.size > 1) {
            variantMismatch.push({ base, variants: keys.map((k) => [k, dict[k]]) });
        }
    }
    return { untranslated, termHits, variantMismatch };
}

/** 汇总分析（供测试直接调用，不碰命令行）。 */
function analyze({ dict, source, tr }) {
    const ctx = {
        source,
        sourceLower: source.toLowerCase(),
        templateRegexes: collectTemplateRegexes(source),
        concatCandidates: concatCandidates(source),
    };
    return {
        dead: findDead(dict, ctx),
        missing: tr ? findMissing(source, tr) : [],
        quality: findQuality(dict),
        templateCount: ctx.templateRegexes.length,
        concatCount: ctx.concatCandidates.size,
    };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2);
    const has = (f) => args.includes(f);
    const val = (f) => {
        const i = args.indexOf(f);
        return i >= 0 ? args[i + 1] : null;
    };

    const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')).dict || {};
    const qualityOnly = has('--quality');
    const outPath = val('--out');

    let report = { dictSize: Object.keys(dict).length };
    let trBundle = null;

    if (qualityOnly) {
        report.quality = findQuality(dict);
    } else {
        const bundleDir = val('--bundle') || defaultBundleDir();
        const appDist = has('--no-app-dist') ? null : defaultAppDistDir();
        const dirs = [bundleDir, appDist].filter(Boolean);
        const corpus = readCorpus(dirs);

        if (!corpus.files.length) {
            console.error('❌ 找不到 bundle 源码，无法判定漏译/死条目。\n');
            console.error('   已尝试：');
            for (const d of dirs) console.error('     ' + d + (fs.existsSync(d) ? '（存在但没有 .js）' : '（不存在）'));
            console.error('\n   请用 --bundle <dir> 指定渲染层 bundle 目录（里面要有 ui*.js），');
            console.error('   或先运行 node scripts/scan-ui.js 采集。');
            console.error('   只想检查词典自身质量、不需要 bundle 时：node scripts/audit-i18n.js --quality');
            process.exit(1);
        }

        console.log(`语料：${corpus.files.length} 个文件 / ${(corpus.text.length / 1024 / 1024).toFixed(1)} MB`);
        for (const f of corpus.files) {
            console.log(`  ${f.path}  (${(f.bytes / 1024 / 1024).toFixed(1)} MB)`);
        }

        try {
            trBundle = makeTr();
        } catch (e) {
            console.error('\n⚠️ 无法启动真实 tr()，跳过错译校验：' + e.message);
        }
        report = {
            ...report,
            ...analyze({ dict, source: corpus.text, tr: trBundle && trBundle.tr }),
        };
        if (trBundle) trBundle.close();
    }

    // ---- 输出 ----
    const q = report.quality;
    console.log(`\n词典 ${report.dictSize} 条`);
    if (report.templateCount !== undefined) {
        console.log(`参与存在性判定的模板：${report.templateCount} 个`);
    }
    if (report.concatCount !== undefined) {
        console.log(`参与存在性判定的字符串拼接：${report.concatCount} 组`);
    }

    if (report.missing) {
        console.log(`\n=== ① 疑似漏译（模板生成但 tr() 未命中）: ${report.missing.length} 条 ===`);
        for (const m of report.missing.slice(0, 60)) {
            console.log(`  ${JSON.stringify(m.text)}`);
            console.log(`      模板: ${JSON.stringify(m.template)}`);
        }
        if (report.missing.length > 60) console.log(`  … 另有 ${report.missing.length - 60} 条，见 --out 导出`);
    }

    if (report.dead) {
        console.log(`\n=== ② 疑似死条目（既非字面量也无法由模板生成）: ${report.dead.length} 条 ===`);
        console.log('  注意：判死前请先看模板列表——`Project deleted` 这类由 `${x} deleted` 生成，是真条目。');
        for (const d of report.dead.slice(0, 60)) {
            console.log(`  ${JSON.stringify(d.key)} = ${JSON.stringify(d.value)}`);
        }
        if (report.dead.length > 60) console.log(`  … 另有 ${report.dead.length - 60} 条，见 --out 导出`);
    }

    if (q) {
        console.log(`\n=== ③ 质量 ===`);
        console.log(`  未翻译（译文无中文）: ${q.untranslated.length} 条`);
        for (const u of q.untranslated.slice(0, 20)) {
            console.log(`    ${JSON.stringify(u.key)} = ${JSON.stringify(u.value)}  [${u.latin.slice(0, 3).join(', ')}]`);
        }
        console.log(`  术语冲突: ${q.termHits.length} 条`);
        for (const t of q.termHits.slice(0, 20)) {
            console.log(`    ${t.rule}: ${JSON.stringify(t.key)} = ${JSON.stringify(t.value)}`);
        }
        console.log(`  标点变体译文不一致: ${q.variantMismatch.length} 组`);
        for (const v of q.variantMismatch.slice(0, 10)) {
            console.log(`    ${JSON.stringify(v.base)}`);
            for (const [k, val2] of v.variants) console.log(`      ${JSON.stringify(k)} = ${JSON.stringify(val2)}`);
        }
    }

    if (outPath) {
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log(`\n已导出：${outPath}`);
    }

    const problems = (report.missing || []).length + (report.dead || []).length
        + (q ? q.untranslated.length + q.termHits.length + q.variantMismatch.length : 0);
    console.log(`\n合计待处理 ${problems} 项。本脚本只报告，不修改任何文件。`);
    if (has('--strict') && problems > 0) process.exit(1);
}

module.exports = {
    RULES, templateBodies, splitTemplate, templateToRegex, sampleFromTemplate,
    looksLikeUiText, looksLikeUserFacing, collectTemplateRegexes, concatCandidates,
    checkReachable, findQuality, findMissing, findDead, analyze,
};

if (require.main === module) main();
