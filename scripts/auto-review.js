#!/usr/bin/env node
'use strict';

/**
 * 自动预筛：把“前端 bundle 扫出的未覆盖英文”分成 ACCEPT / REJECT / REVIEW 三态。
 *
 * 设计边界（务必保留）：
 * - 本脚本只读词典与 findings；绝不会写 src/cockpit-zh.json，也不会直接调用 add-terms。
 * - 默认 / --dry-run 不写任何文件；只有显式 --out <path> 才写结构化 JSON。
 * - 规则集中在顶部 RULES 常量里，便于以后按新版 UI 调整。
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
// 历史 findings 默认位置；可用 --findings <dir> 或环境变量覆盖，脚本本身不依赖工作目录。
const DEFAULT_FINDINGS = path.join(
    'C:', 'Users', '35332', '.gemini', 'antigravity', 'brain',
    '008f16c3-08fc-461a-afe6-25eb0b08548e', 'scratch', 'findings'
);

/** 全部可调判定参数集中在这里；改规则请改这个对象，不要在下方散落硬编码。 */
const RULES = {
    states: ['ACCEPT', 'REJECT', 'REVIEW'],

    // 置信来源
    strongUiKeys: [
        'title', 'label', 'message', 'tooltip', 'description', 'emptyText',
        'aria-label', 'ariaLabel', 'placeholder', 'subtitle', 'content',
        'text', 'linkLabel', 'displayName', 'writeInLabel', 'renameLabel',
        'promptText', 'errorMessage', 'errorMsg', 'error',
        'gatingMessage', 'settingsGatingMessage', 'historicalTooltip'
    ],
    // 这些键名只说明「是个属性」，不足以证明是固定文案
    weakUiKeys: ['zoom', 'name', 'fitMode', 'prompt'],
    liveGroup: '固定文案', // L 集合里动态相对时间等不计入「真出现即非 REJECT」硬保证

    // 噪声：品牌 / 产品 / 平台
    brandTerms: [
        'Antigravity', 'Gemini', 'GitHub', 'Google', 'GitLab', 'Gerrit',
        'Wikipedia', 'Chrome', 'Markdown', 'Linux', 'Windows', 'macOS',
        'Android', 'Office', 'Word', 'Excel', 'PowerPoint', 'PDF',
        'Drive', 'WSL', 'FlareMo', 'Origin', 'Hub', 'Best of N',
        'Chief of Staff', 'Turbo', 'MCP', 'Sidecar'
    ],
    // 整串等于这些（含大小写/空白归一）才算「纯品牌名」；句子里出现品牌词不算噪声
    brandStandalone: [
        'Antigravity', 'Gemini', 'GitHub', 'Google', 'GitLab', 'Gerrit',
        'Wikipedia', 'Chrome', 'Markdown', 'Linux', 'Windows', 'macOS',
        'Android', 'WSL', 'FlareMo', 'Origin', 'Hub', 'Sidecar',
        'Google Antigravity', 'Google Chrome', 'Google Cloud',
        'Google Drive', 'Google Docs', 'Google Search',
        'Gemini Enterprise', 'Antigravity IDE',
        'Antigravity Business', 'Antigravity Android'
    ],
    exampleData: [
        'United States', 'Gemini 3 Pro Image', 'Sample GDoc',
        'repo-a, repo-b', 'org-a, org-b', 'example.com'
    ],
    productNoisePatterns: [
        /^[A-Z][A-Z0-9]{2,}(?:\s+[A-Z][A-Z0-9]{2,})*$/ // 整串全大写缩写（API/URL/ID…）
    ],

    // 噪声：URL / 域名 / 文件路径 / 扩展名 / CSS / 标识符
    // 注意：域名必须命中白名单 TLD，否则 "e.g." 这类缩写会被误判成域名。
    urlLike: /^(?:https?:\/\/|www\.)\S+$/i,
    embeddedUrlLike: /(?:https?:\/\/|www\.)\S+/i,
    domainLike: /^(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|gov|edu)(?:\/\S*)?$/i,
    domainWordLike: /\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|gov|edu)\b/i,
    filePathLike: /(?:^|[\s"'`(])(?:[A-Za-z]:\\[^\s]+|\/[\w.-]+\/[\w./-]+|[\w.-]+\/[\w.-]+\/[\w.-]+)/,
    extensionLike: /\.(?:js|mjs|cjs|ts|tsx|jsx|json|css|scss|html|htm|md|txt|pdf|png|jpe?g|svg|zip|exe|dll|so|dylib|wasm|py|rs|sh|bat|ps1)\b/i,
    cssClassLike: /^(?:[a-z]+-){1,}[a-z0-9-]+$|^\.[a-z][\w-]*$|^\.[\w-]+\s*\{/i,
    camelCaseLike: /^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$|^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/,
    allCapsAbbrev: /^[A-Z][A-Z0-9_]{1,}$/,
    techIdentLike: /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$|^[a-z][a-z0-9]*[-_][a-z0-9]+$/i,
    base64Like: /^[A-Za-z0-9+/]{24,}={0,2}$/,
    cjkRegex: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/,
    singleLetter: /^[A-Za-z]$/,
    numberUnit: /^[\d\s.,:+\-/%×xX]+(?:[a-zA-Z]{1,3})?$/,

    // 噪声：形态异常
    minLen: 2,
    maxLen: 240,
    maxWordCount: 42,
    suspiciousChars: /[\u0000-\u001f<>{}[\]\\|`^~]/,
    trailingFragmentMarkers: ['via', 'e.g.,', 'for example:', 'see', 'to use', 'please verify your account, then sign in again to continue. learn more by visiting our'],
    interpolationLike: /\$\{|\{\{|\}\}|%\([^)]*\)[sd]|%[sd]\b/,
    dynamicLike: /\b(?:\d+\s*(?:m|h|d|s)\s+ago|showing \d+ of \d+|best-of-\d+)\b/i,
    shortcutLike: /\b(?:shift\+delete|ctrl\+[a-z]|cmd\+[a-z]|alt\+[a-z])\b/i,

    // ACCEPT：从已有 dict 反推出的「界面文案惯用前缀」（同形证据）
    // 例：dict 里已有 32 条 Configure ...、28 条 Search ...，则 "Search connectors" 同形。
    shapePrefix: {
        minDictExamples1Word: 5,
        minDictExamples2Words: 2,
        minCandidateWords: 2,
        stopFirstWords: [
            'a', 'an', 'the', 'this', 'that', 'these', 'those', 'there',
            'here', 'when', 'if', 'in', 'for', 'by', 'with', 'from',
            'it', 'we', 'you', 'your', 'my', 'our', 'their', 'and',
            'or', 'to', 'as', 'at', 'on', 'of', 'is', 'are', 'be',
            'can', 'will', 'would', 'many', 'some', 'all', 'any',
            'every', 'each', 'no', 'not', 'only', 'nothing',
            'something', 'anything', 'everything', 'everyone',
            'what', 'how', 'why', 'where', 'which', 'who', 'whom',
            'whose', 'i', 'he', 'she', 'they', 'them', 'his', 'her',
            'its', 'ours', 'yours', 'myself', 'yourself', 'itself'
        ]
    },
    // 这些前缀即使字典里有也不足以单独 ACCEPT（太像示例数据/动态模板）
    shapePrefixBlocklist: ['for example', 'what should'],

    // 灰区原因（REVIEW）
    reviewReasons: {
        noUiKey: '缺少 UI 键名上下文：bundle 只给出裸字符串，无法证明是固定界面文案还是拼接片段/示例数据',
        weakKey: '只有弱键名上下文（如 name/zoom/prompt），可能是内部状态名而非用户可见文案',
        longText: '长句且无键名上下文：可能是说明文字，也可能是截断/拼接的模板，需要人确认边界',
        brandInSentence: '句中含品牌/产品名：整句可能是 UI 文案，但品牌词必须原样保留，需人工看译文',
        fragment: '疑似句子片段（以介词/逗号/省略号结尾或含插值），可能不适合逐字入库',
        shortBare: '短裸串：可能是按钮/标签，也可能是枚举值或内部标识符',
        dynamicWords: '含相对时间/数量/ID 等动态词，可能需要正则规则而非固定词条',
        suspiciousChars: '含代码/控制字符，疑似模板或拼接产物',
        menuOnly: '仅出现在原生菜单层（menuOnly），DOM 词典不一定够得着，需人工确认落点',
        translationMissing: '缺少建议译文，入库前需人工补译'
    }
};

function words(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean);
}

function lowerTrim(s) {
    return String(s || '').trim().toLowerCase();
}

/** 从当前 dict 构造「惯用前缀」表：同一动词/名词反复用于界面文案即视为同形证据。 */
function buildShapePrefixes(dict) {
    const cfg = RULES.shapePrefix;
    const stop = new Set(cfg.stopFirstWords.map(lowerTrim));
    const block = new Set(RULES.shapePrefixBlocklist.map(lowerTrim));
    const map = new Map();
    for (const key of Object.keys(dict || {})) {
        const w = words(key);
        if (w.length < 2) continue;
        for (const n of [1, 2]) {
            if (w.length <= n) continue;
            const pw = w.slice(0, n);
            if (pw.some(x => x.length < 2 || /\d/.test(x))) continue;
            const first = lowerTrim(pw[0]);
            if (stop.has(first)) continue;
            const text = pw.join(' ');
            const lower = lowerTrim(text);
            if (block.has(lower) || pw.some(x => block.has(lowerTrim(x)))) continue;
            const entry = map.get(lower) || { prefix: text, lower, count: 0, wordCount: n };
            entry.count++;
            map.set(lower, entry);
        }
    }
    return [...map.values()].filter(e => e.count >= (
        e.wordCount === 1 ? cfg.minDictExamples1Word : cfg.minDictExamples2Words
    )).sort((a, b) => b.wordCount - a.wordCount || b.count - a.count);
}

/** 返回 { live, fixed }：L 集合的精确键与「固定文案」精确键。 */
function buildLiveIndex(crosscheck) {
    const live = new Set();
    const fixed = new Set();
    const members = crosscheck && crosscheck.sets && crosscheck.sets.L && crosscheck.sets.L.members;
    for (const m of (Array.isArray(members) ? members : [])) {
        if (!m || typeof m.src !== 'string') continue;
        live.add(m.src);
        if (m.group === RULES.liveGroup) fixed.add(m.src);
    }
    return { live, fixed };
}

function buildDictIndex(dict, normKey) {
    const exact = new Set(Object.keys(dict || {}));
    const norm = new Set();
    if (typeof normKey === 'function') {
        for (const k of exact) norm.add(normKey(k));
    }
    return { exact, norm };
}

/**
 * 构造 classify 所需的只读上下文。
 * findingsDir / repoRoot 都可注入，方便单测与以后换会话目录。
 */
function buildContext(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const findingsDir = options.findingsDir || process.env.AUTO_REVIEW_FINDINGS || DEFAULT_FINDINGS;
    const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

    const bundle = options.bundle || readJson(path.join(findingsDir, 'frontend-bundle.json'));
    const crosscheck = options.crosscheck || readJson(path.join(findingsDir, 'crosscheck-sets.json'));
    const cockpit = options.cockpit || readJson(path.join(repoRoot, 'src', 'cockpit-zh.json'));
    let normKey = options.normKey;
    if (!normKey) {
        try {
            normKey = require(path.join(repoRoot, 'src', 'zh-i18n.js')).normEngine().normKey;
        } catch (_) {
            normKey = null; // 归一化不可用时降级为精确匹配，分类仍可跑
        }
    }

    const dict = cockpit.dict || {};
    return {
        repoRoot,
        findingsDir,
        bundle,
        crosscheck,
        dict,
        normKey,
        dictIndex: buildDictIndex(dict, normKey),
        liveIndex: buildLiveIndex(crosscheck),
        shapePrefixes: buildShapePrefixes(dict)
    };
}

/** 三态判定：返回 {state, reasons[], evidence}。纯函数，不写文件。 */
function classify(item, ctx) {
    const src = String((item && item.src) != null ? item.src : '');
    const trimmed = src.trim();
    const lower = lowerTrim(src);
    const reasons = [];
    const evidence = {
        keys: Array.isArray(item && item.keys) ? item.keys.slice() : [],
        file: (item && item.file) || '',
        loc: (item && item.loc) || null,
        category: (item && item.category) || '未分类',
        menuOnly: !!(item && item.menuOnly),
        inDistPool: !!(item && item.inDistPool),
        note: (item && item.note) || '',
        inLiveL: false,
        inLiveFixed: false,
        strongUiKey: null,
        weakUiKey: null,
        shapePrefix: null,
        normCovered: false,
        exactDict: false,
        brandStandalone: false,
        exampleData: false
    };

    // ---- 1) 硬噪声 REJECT ----
    if (!trimmed || trimmed.length < RULES.minLen) {
        return { state: 'REJECT', reasons: ['空串或长度不足，不是可翻译文案'], evidence };
    }
    if (RULES.cjkRegex.test(trimmed)) {
        return { state: 'REJECT', reasons: ['含中日韩字符，不是待译英文原文'], evidence };
    }
    if (RULES.singleLetter.test(trimmed)) {
        return { state: 'REJECT', reasons: ['单字母，通常是快捷键/枚举值而非文案'], evidence };
    }
    if (RULES.numberUnit.test(trimmed)) {
        return { state: 'REJECT', reasons: ['纯数字/单位串，属动态数据'], evidence };
    }
    if (RULES.base64Like.test(trimmed)) {
        return { state: 'REJECT', reasons: ['base64 形态，属编码数据而非 UI 文案'], evidence };
    }
    if (RULES.urlLike.test(trimmed) || RULES.embeddedUrlLike.test(trimmed) ||
        RULES.domainLike.test(trimmed) || RULES.domainWordLike.test(trimmed)) {
        return { state: 'REJECT', reasons: ['URL / 域名，不应整串翻译'], evidence };
    }
    if (RULES.filePathLike.test(trimmed) || RULES.extensionLike.test(trimmed)) {
        return { state: 'REJECT', reasons: ['文件路径 / 扩展名 / 代码资源名，不应整串翻译'], evidence };
    }
    if (RULES.cssClassLike.test(trimmed)) {
        return { state: 'REJECT', reasons: ['CSS 类名或选择器，不是用户可见文案'], evidence };
    }
    if (RULES.camelCaseLike.test(trimmed) || RULES.allCapsAbbrev.test(trimmed) || RULES.techIdentLike.test(trimmed)) {
        return { state: 'REJECT', reasons: ['camelCase / 全大写缩写 / 点号技术标识符，不是自然语文案'], evidence };
    }
    const standalone = new Set(RULES.brandStandalone.map(lowerTrim));
    if (standalone.has(lower.replace(/[.!?:;,]+$/, ''))) {
        evidence.brandStandalone = true;
        return { state: 'REJECT', reasons: ['纯品牌 / 产品 / 平台名，按 AGENTS.md 需原样保留'], evidence };
    }
    const examples = new Set(RULES.exampleData.map(lowerTrim));
    if (examples.has(lower) || RULES.exampleData.some(x => lower === lowerTrim(x))) {
        evidence.exampleData = true;
        return { state: 'REJECT', reasons: ['示例数据（国家名 / 模型名 / 示例仓库名），不是固定 UI 文案'], evidence };
    }
    if (RULES.productNoisePatterns.some(re => re.test(trimmed))) {
        return { state: 'REJECT', reasons: ['纯技术缩写串，不是自然语文案'], evidence };
    }

    // ---- 2) 上下文证据 ----
    const keys = evidence.keys;
    const strongKey = keys.find(k => RULES.strongUiKeys.includes(k)) || null;
    const weakKey = keys.find(k => RULES.weakUiKeys.includes(k)) || null;
    evidence.strongUiKey = strongKey;
    evidence.weakUiKey = weakKey;

    evidence.inLiveL = ctx.liveIndex.live.has(src);
    evidence.inLiveFixed = ctx.liveIndex.fixed.has(src);
    evidence.exactDict = ctx.dictIndex.exact.has(src);
    evidence.normCovered = !!(ctx.normKey && ctx.dictIndex.norm.has(ctx.normKey(src)));

    const brandHit = RULES.brandTerms.find(b => new RegExp('\\b' + escapeRegExp(b) + '\\b', 'i').test(trimmed));
    if (brandHit) reasons.push(RULES.reviewReasons.brandInSentence + '（命中：' + brandHit + '）');

    // ---- 3) ACCEPT：活体 L / 强 UI 键 / 与 dict 同形 ----
    if (evidence.inLiveL) {
        return {
            state: 'ACCEPT',
            reasons: ['活体界面 L 集合真出现：已由 CDP 扫描证实是用户可见文案'],
            evidence
        };
    }
    if (evidence.normCovered || evidence.exactDict) {
        return {
            state: 'ACCEPT',
            reasons: ['当前 dict 已按 exact / normKey 覆盖同形文案，属既有界面文案形态'],
            evidence
        };
    }
    if (strongKey && !RULES.suspiciousChars.test(trimmed)) {
        return {
            state: 'ACCEPT',
            reasons: ['bundle 中带强 UI 键名 `' + strongKey + '`：确定是 label/title/description 一类固定文案'],
            evidence
        };
    }

    const w = words(trimmed);
    let shape = null;
    if (w.length >= RULES.shapePrefix.minCandidateWords && !RULES.shapePrefixBlocklist.some(b => lower.startsWith(lowerTrim(b)))) {
        for (const p of ctx.shapePrefixes) {
            if (w.length > p.wordCount && lower.startsWith(p.lower + ' ')) {
                shape = p;
                break;
            }
        }
    }
    evidence.shapePrefix = shape ? { prefix: shape.prefix, dictExamples: shape.count } : null;
    if (shape && !RULES.suspiciousChars.test(trimmed) && !RULES.interpolationLike.test(trimmed)) {
        return {
            state: 'ACCEPT',
            reasons: [
                '与已有 dict 同形：前缀 `' + shape.prefix + '` 在词典中有 ' + shape.count + ' 条界面文案，' +
                '且本条无插值/代码字符，可判为固定 UI 文案'
            ],
            evidence
        };
    }

    // ---- 4) REVIEW：灰区，给出「为什么拿不准」 ----
    if (!trimmed || !String(item && item.suggest || '').trim()) reasons.push(RULES.reviewReasons.translationMissing);
    if (!strongKey && weakKey) reasons.push(RULES.reviewReasons.weakKey);
    if (!strongKey && !weakKey && !shape) reasons.push(RULES.reviewReasons.noUiKey);
    if (w.length > RULES.maxWordCount || trimmed.length > RULES.maxLen) {
        return { state: 'REJECT', reasons: ['长度/词数异常，疑似模板段落或拼接产物'], evidence };
    }
    if (RULES.suspiciousChars.test(trimmed) || RULES.interpolationLike.test(trimmed)) {
        reasons.push(RULES.reviewReasons.suspiciousChars);
        reasons.push(RULES.reviewReasons.fragment);
    } else if (RULES.trailingFragmentMarkers.some(m => lower.endsWith(m)) || /[,:;]$|\.\.\.$|\s(?:via|for|to|and|or|with|from|by)$/i.test(trimmed)) {
        reasons.push(RULES.reviewReasons.fragment);
    }
    if (RULES.dynamicLike.test(trimmed) || RULES.shortcutLike.test(trimmed)) {
        reasons.push(RULES.reviewReasons.dynamicWords);
    }
    if (w.length >= 14) reasons.push(RULES.reviewReasons.longText);
    if (w.length <= 2 && !strongKey) reasons.push(RULES.reviewReasons.shortBare);
    if (evidence.menuOnly) reasons.push(RULES.reviewReasons.menuOnly);
    if (shape) reasons.push('有同形前缀 `' + shape.prefix + '`，但本条含插值/代码字符或落在屏蔽前缀，不能自动放行');
    if (!reasons.length) reasons.push(RULES.reviewReasons.noUiKey);
    return { state: 'REVIEW', reasons, evidence };
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把一条候选补齐成交付字段；保留源数据全部字段，checked 恒为 false，供人工渐进勾选。 */
function makeItem(raw, ctx) {
    const verdict = classify(raw, ctx);
    const r = raw || {};
    return {
        // 原始 findings 字段（src/suggest/category/file/loc/keys/menuOnly/inDistPool/note 等）逐项保留
        src: String(r.src != null ? r.src : ''),
        suggest: String(r.suggest != null ? r.suggest : ''),
        category: String(r.category != null ? r.category : '未分类'),
        file: String(r.file != null ? r.file : ''),
        loc: r.loc != null ? r.loc : null,
        keys: Array.isArray(r.keys) ? r.keys.slice() : [],
        menuOnly: !!r.menuOnly,
        inDistPool: !!r.inDistPool,
        note: String(r.note != null ? r.note : ''),
        // 预筛结果
        evidence: verdict.evidence,
        state: verdict.state,
        reasons: verdict.reasons.slice(),
        checked: false
    };
}

/** 优先用 F−L（651 条）作为渐进基准；缺失时回退到 uncovered 减去 L。 */
function selectBacklogItems(ctx) {
    const fMinusL = ctx.crosscheck &&
        ctx.crosscheck.exact &&
        ctx.crosscheck.exact.F_minus_L &&
        ctx.crosscheck.exact.F_minus_L.members;
    if (Array.isArray(fMinusL) && fMinusL.length) return fMinusL.slice();
    const uncovered = (ctx.bundle && ctx.bundle.uncovered) || [];
    return uncovered.filter(x => !ctx.liveIndex.live.has(String(x.src)));
}

function buildReport(ctx) {
    const rawItems = selectBacklogItems(ctx);
    const items = rawItems.map(raw => makeItem(raw, ctx));
    const byState = { ACCEPT: [], REJECT: [], REVIEW: [] };
    for (const it of items) byState[it.state].push(it);
    const byCategory = {};
    for (const it of items) (byCategory[it.category] = byCategory[it.category] || []).push(it);
    const counts = {
        total: items.length,
        ACCEPT: byState.ACCEPT.length,
        REJECT: byState.REJECT.length,
        REVIEW: byState.REVIEW.length,
        categories: Object.keys(byCategory).length,
        manualBaseline: rawItems.length, // 旧流程：全部逐条人工判断
        manualAfter: byState.REVIEW.length, // 新流程：只裁决灰区；ACCEPT 仍需过一眼
        reduction: rawItems.length - byState.REVIEW.length
    };
    return {
        generatedAt: new Date().toISOString(),
        source: {
            bundle: path.join(ctx.findingsDir, 'frontend-bundle.json'),
            crosscheck: path.join(ctx.findingsDir, 'crosscheck-sets.json'),
            dictionary: path.join(ctx.repoRoot, 'src', 'cockpit-zh.json'),
            set: 'exact.F_minus_L'
        },
        counts,
        items
    };
}

function groupByCategory(items) {
    const groups = new Map();
    for (const it of items) {
        if (!groups.has(it.category)) groups.set(it.category, []);
        groups.get(it.category).push(it);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh'));
}

function mdCell(s) {
    return String(s == null ? '' : s)
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ')
        .trim();
}

function renderMarkdown(report) {
    const c = report.counts;
    const lines = [];
    lines.push('# i18n 渐进补录清单（自动预筛）');
    lines.push('');
    lines.push('> 由 `node scripts/auto-review.js --write-docs` 生成；`--out <path>` 可导出任意结构化 JSON，同源数据见 `docs/dev/i18n-backlog.json`。');
    lines.push('> 数据源：`frontend-bundle.json` 的 `uncovered[]` 减去活体 L 集合（`crosscheck-sets.json` 的 `exact.F_minus_L`）。');
    lines.push('> 生成时间：' + report.generatedAt + '；共 ' + c.total + ' 条，分 ' + c.categories + ' 类。');
    lines.push('');
    lines.push('## 三态含义 / 怎么勾');
    lines.push('');
    lines.push('| 状态 | 含义 | 人工动作 |');
    lines.push('|---|---|---|');
    lines.push('| `ACCEPT` | 自动判定为确定 UI 固定文案（强 UI 键名 / 活体 L / 与 dict 同形） | **也要人工过一眼**：确认 `suggest` 译文贴切、品牌词原样保留；把 `checked` 改为 `true` |');
    lines.push('| `REJECT` | 自动判定为噪声（品牌名、URL、文件路径、CSS、技术标识符、示例数据、含中文等） | 原则上跳过；若确属误判，改 `state` 为 `REVIEW` 并在 `reasons` 里写明 |');
    lines.push('| `REVIEW` | 灰区：缺少键名、长句、含品牌词、疑似片段/动态文案 | **重点看这里**：逐条裁决 `ACCEPT` / `REJECT`，改完把 `checked` 改为 `true` |');
    lines.push('');
    lines.push('每条的 `checked` 初始均为 `false`，并保留源数据的 `src` / `suggest` / `category` / `file` / `loc` / `keys` / `menuOnly` / `inDistPool` / `note` 全部字段。`evidence` 记录判定依据（键名、文件位置、L 集合、同形前缀等），`reasons[]` 是可解释理由，裁决时可直接改 `state` / `suggest` / `reasons`。');
    lines.push('');
    lines.push('## 统计与工作量');
    lines.push('');
    lines.push('| 指标 | 数量 |');
    lines.push('|---|---:|');
    lines.push('| 总条数（旧流程需逐条人工判断） | ' + c.manualBaseline + ' |');
    lines.push('| `ACCEPT`（自动放行，人工过一眼） | ' + c.ACCEPT + ' |');
    lines.push('| `REJECT`（自动排除） | ' + c.REJECT + ' |');
    lines.push('| `REVIEW`（需人工裁决，重点） | ' + c.manualAfter + ' |');
    lines.push('| 自动消化量 | ' + c.reduction + ' |');
    lines.push('');
    lines.push('> 人工**深度裁决**从 ' + c.manualBaseline + ' 条降到 ' + c.manualAfter + ' 条；`ACCEPT` 不是零成本，仍需抽检译文，但不再需要判断「该不该翻」。');
    lines.push('');
    lines.push('## 勾完怎么走 add-terms');
    lines.push('');
    lines.push('1. 只把 `state` 为 `ACCEPT`（含从 `REVIEW` 改过来的）且 `checked: true` 的条目整理成 `draft.txt`，一行一条 `英文原文 = 译文`。');
    lines.push('2. `npm run add-terms draft.txt -- --dry-run` 预览；确认没有 redundant / skipped 异常后 `npm run add-terms draft.txt` 正式写入。');
    lines.push('3. `npm test`（以 `package.json` 的 `test` 脚本为准）→ `npm run sync` 推送到已安装客户端，1~2 秒热载生效。');
    lines.push('4. 回写本清单：把已入库条目的 `checked` 保持 `true`，在 `reasons` 末尾追加「已入库 vX.Y」；下一轮重跑 `auto-review.js` 时以新 findings 为基准重建。');
    lines.push('');
    lines.push('**硬边界**：`auto-review.js` 绝不自动写 `src/cockpit-zh.json`；哪些该翻最终由人决定，脚本只减少逐条判断量。');
    lines.push('');
    lines.push('## 分类明细');
    lines.push('');
    for (const [category, group] of groupByCategory(report.items)) {
        const s = { ACCEPT: 0, REJECT: 0, REVIEW: 0 };
        for (const it of group) s[it.state]++;
        lines.push('### ' + category + '（' + group.length + ' 条：ACCEPT ' + s.ACCEPT + ' / REJECT ' + s.REJECT + ' / REVIEW ' + s.REVIEW + '）');
        lines.push('');
        lines.push('| ✔ | 状态 | 原文 | 建议译文 | 依据 | 理由 |');
        lines.push('|---|---|---|---|---|---|');
        for (const it of group) {
            const ev = [];
            if (it.evidence.strongUiKey) ev.push('key:' + it.evidence.strongUiKey);
            if (it.evidence.weakUiKey) ev.push('weak:' + it.evidence.weakUiKey);
            if (it.evidence.shapePrefix) ev.push('shape:' + it.evidence.shapePrefix.prefix + '(' + it.evidence.shapePrefix.dictExamples + ')');
            if (it.evidence.inLiveL) ev.push('live:L');
            if (it.evidence.normCovered) ev.push('norm-covered');
            if (it.evidence.menuOnly) ev.push('menuOnly');
            if (it.evidence.file) ev.push(it.evidence.file + ':' + it.evidence.loc);
            lines.push('| ' + (it.checked ? 'x' : ' ') + ' | `' + it.state + '` | ' + mdCell(it.src) + ' | ' + mdCell(it.suggest) + ' | ' + mdCell(ev.join(' · ') || '—') + ' | ' + mdCell(it.reasons.join('；')) + ' |');
        }
        lines.push('');
    }
    return lines.join('\n') + '\n';
}

function parseArgs(argv) {
    const out = { dryRun: true, out: null, findings: null, writeDocs: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--out' && argv[i + 1]) { out.out = argv[++i]; out.dryRun = false; }
        else if (a.startsWith('--out=')) { out.out = a.slice('--out='.length); out.dryRun = false; }
        else if (a === '--findings' && argv[i + 1]) out.findings = argv[++i];
        else if (a.startsWith('--findings=')) out.findings = a.slice('--findings='.length);
        else if (a === '--write-docs') out.writeDocs = true; // 仅维护者显式生成 docs/ 基准时使用
        else throw new Error('未知参数：' + a);
    }
    return out;
}

function printDryRun(report) {
    const c = report.counts;
    console.log('=== auto-review 预筛（dry-run，不写任何文件）===');
    console.log('数据源: ' + report.source.set + ' | 词典: ' + report.source.dictionary);
    console.log('总条数: ' + c.total + ' | 分类: ' + c.categories);
    console.log('ACCEPT: ' + c.ACCEPT + ' | REJECT: ' + c.REJECT + ' | REVIEW: ' + c.REVIEW);
    console.log('人工深度裁决: ' + c.manualBaseline + ' → ' + c.manualAfter + '（减少 ' + c.reduction + ' 条，' +
        (c.manualBaseline ? (100 * c.reduction / c.manualBaseline).toFixed(1) : '0') + '%）');
    console.log('ACCEPT 仍需人工过一眼译文；REVIEW 才是重点。最终入库必须走 add-terms。');
    for (const state of RULES.states) {
        const sample = report.items.filter(x => x.state === state).slice(0, 5);
        console.log('\n--- ' + state + ' 样例（' + sample.length + '/' +
            report.items.filter(x => x.state === state).length + '）---');
        for (const it of sample) {
            console.log('  ' + JSON.stringify(it.src) + ' → ' + JSON.stringify(it.suggest));
            console.log('    ' + it.reasons.join('；'));
        }
    }
}

function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const ctx = buildContext({ findingsDir: args.findings });
    const report = buildReport(ctx);
    if (args.out) {
        const target = path.resolve(args.out);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log('已写入 ' + target + '（ACCEPT ' + report.counts.ACCEPT + ' / REJECT ' + report.counts.REJECT + ' / REVIEW ' + report.counts.REVIEW + '）');
    }
    if (args.writeDocs) {
        fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'dev', 'i18n-backlog.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
        fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'dev', 'i18n-backlog.md'), renderMarkdown(report), 'utf8');
        console.log('已重建 docs/dev/i18n-backlog.json 与 docs/dev/i18n-backlog.md');
    }
    if (args.dryRun) printDryRun(report);
    return report;
}

module.exports = {
    RULES,
    REPO_ROOT,
    DEFAULT_FINDINGS,
    buildContext,
    buildShapePrefixes,
    buildLiveIndex,
    buildDictIndex,
    classify,
    makeItem,
    selectBacklogItems,
    buildReport,
    groupByCategory,
    renderMarkdown,
    parseArgs,
    main
};

if (require.main === module) {
    try {
        main();
    } catch (e) {
        console.error('auto-review 失败：' + (e && e.stack || e));
        process.exit(1);
    }
}
