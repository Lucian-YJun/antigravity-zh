const fs = require('fs');
const path = require('path');

const DEFAULT_TARGETS = {
  'utils': 'dist/utils.js',
  'menu': 'dist/menu.js',
  'main': 'dist/main.js',
  'tray': 'dist/tray.js',
  'updater': 'dist/updater.js',
  'ipchandlers': 'dist/ipcHandlers.js',
  'wizard': 'dist/ideInstall/wizardHtml.js',
};

/**
 * 转义正则元字符，使任意字符串都能作为字面量参与交替匹配。
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把一条规则归一化成 [oldStr, newStr]。
 * 同时兼容两种写法（与 rust/crates/replacer/src/rules.rs 的 untagged 枚举一致）：
 *   - 元组：  ["原文", "译文"]
 *   - 结构体：{ "search": "原文", "replace": "译文" }
 *
 * 严格程度对齐 Rust：
 *   - 结构上根本不是规则（null / 数字 / 裸字符串）→ 抛 TypeError。
 *     Rust 侧 serde 反序列化会直接失败，Node 不能悄悄当成「无此规则」。
 *   - search 为空串 → 抛 TypeError。aho-corasick 拒绝空 pattern，
 *     而 JS 侧空串会在每个字符间隙匹配，把整篇文本切碎。
 *   - search / replace 类型不对（数字、对象等）→ 返回 null 由调用方跳过，
 *     与既有测试「non-string oldStr ignored safely」的约定保持一致。
 * @param {any} rule
 * @param {number} [index]
 * @returns {[string, string] | null}
 */
function normalizeRule(rule, index) {
  const where = index === undefined ? '' : `（第 ${index} 条）`;
  if (rule === null || rule === undefined) {
    throw new TypeError(`替换规则${where}是 ${rule}，既不是 [原文, 译文] 数组也不是 {search, replace} 对象`);
  }
  let oldStr;
  let newStr;
  if (Array.isArray(rule)) {
    [oldStr, newStr] = rule;
  } else if (typeof rule === 'object') {
    oldStr = rule.search;
    newStr = rule.replace;
  } else {
    throw new TypeError(`替换规则${where}类型非法: ${typeof rule}（${JSON.stringify(rule)}）`);
  }
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') return null;
  if (oldStr === '') {
    throw new TypeError(`替换规则${where}的原文是空字符串：空 pattern 会在每个字符间隙匹配并把文本切碎（Rust 侧 aho-corasick 同样拒绝空 pattern）`);
  }
  return [oldStr, newStr];
}

/**
 * 纯字符串替换引擎：将规则批量应用于文本内容。
 *
 * 语义与 Rust 侧的 Aho-Corasick(LeftmostFirst) 严格一致（本项目以 Rust 为准）：
 *   1. 单遍扫描：替换产物不会被重新扫描。逐条 String.replace 会让第 N 条规则
 *      匹配到第 N-1 条刚写进去的文本，单遍不会。
 *   2. 全量替换：同一规则命中多处时全部替换。`String.replace(str, ..)` 只换第一处。
 *   3. 字面量替换：用函数形式回传译文，避免 `$&` / `$$` / `` $` `` / `$'`
 *      被 String.replace 当成替换模式展开（曾导致 `X$&Y` 被写成 `XHelloY`）。
 *   4. 最左优先，同一位置按规则声明顺序取舍 —— JS 正则交替与 LeftmostFirst 同语义
 *      （例如规则 ["test","A"] 与 ["testing","B"] 对 "testing" 都产出 "Aing"）。
 *
 * @param {string} content
 * @param {Array<[string, string] | {search: string, replace: string}>} rules
 * @returns {{ content: string, appliedCount: number, matchedRules: number, replacements: number, multiMatch: number[] }}
 *   appliedCount / matchedRules 为「命中过的规则条数」，replacements 为「实际替换处数」，
 *   multiMatch 列出命中多于一次的规则下标（违反 PROJECT.md 的「唯一匹配」契约，需要人工确认）。
 */
function applyReplacements(content, rules) {
  const untouched = { content, appliedCount: 0, matchedRules: 0, replacements: 0, multiMatch: [] };
  if (!Array.isArray(rules) || rules.length === 0) return untouched;

  const normalized = [];
  rules.forEach((rule, i) => {
    const pair = normalizeRule(rule, i);
    if (pair) normalized.push(pair);
  });
  if (normalized.length === 0) return untouched;

  // 字面量 → 规则下标。重复的 search 只保留最先声明者，与 LeftmostFirst 一致。
  const indexByLiteral = new Map();
  normalized.forEach(([oldStr], i) => {
    if (!indexByLiteral.has(oldStr)) indexByLiteral.set(oldStr, i);
  });

  let pattern;
  try {
    pattern = new RegExp(normalized.map(([oldStr]) => escapeRegExp(oldStr)).join('|'), 'g');
  } catch {
    // 规则多到超出正则引擎上限时退回逐条替换：仍是字面量语义，只是失去单遍保证。
    let fallback = content;
    const hit = new Set();
    let total = 0;
    const multi = [];
    for (let i = 0; i < normalized.length; i++) {
      const [oldStr, newStr] = normalized[i];
      let count = 0;
      while (fallback.includes(oldStr)) {
        fallback = fallback.replace(oldStr, () => newStr);
        count++;
        if (count > normalized.length * 4 + 64) break; // 防御性上限
      }
      if (count > 0) {
        hit.add(i);
        total += count;
        if (count > 1) multi.push(i);
      }
    }
    return {
      content: fallback,
      appliedCount: hit.size,
      matchedRules: hit.size,
      replacements: total,
      multiMatch: multi,
    };
  }

  const matchedRuleIdx = new Set();
  const hitCount = new Map();
  let replacements = 0;

  const result = content.replace(pattern, (match) => {
    const idx = indexByLiteral.get(match);
    if (idx === undefined) return match;
    replacements++;
    matchedRuleIdx.add(idx);
    hitCount.set(idx, (hitCount.get(idx) || 0) + 1);
    return normalized[idx][1];
  });

  const multiMatch = [];
  for (const [idx, n] of hitCount) if (n > 1) multiMatch.push(idx);
  multiMatch.sort((a, b) => a - b);

  return {
    content: result,
    appliedCount: matchedRuleIdx.size,
    matchedRules: matchedRuleIdx.size,
    replacements,
    multiMatch,
  };
}

/**
 * 读取并解析原生替换规则文件 <scope>.replacements.json。
 * @param {string} rulesDir
 * @param {string} scope
 * @returns {[string, string][] | null}
 */
function loadRules(rulesDir, scope) {
  const rulesFile = path.join(rulesDir, `${scope}.replacements.json`);
  if (!fs.existsSync(rulesFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 对单个目标文件执行规则替换。
 * @param {string} targetFile
 * @param {string} rulesFile
 * @param {{ isDryRun?: boolean }} [options]
 * @returns {{ applied: number, totalRules: number, fileMissing: boolean, rulesMissing: boolean, replacements: number, multiMatch: number[] }}
 */
function patchTargetFile(targetFile, rulesFile, options = {}) {
  if (!fs.existsSync(targetFile)) {
    return { applied: 0, totalRules: 0, fileMissing: true, rulesMissing: false, replacements: 0, multiMatch: [] };
  }
  if (!fs.existsSync(rulesFile)) {
    return { applied: 0, totalRules: 0, fileMissing: false, rulesMissing: true, replacements: 0, multiMatch: [] };
  }
  let rules;
  try {
    rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
  } catch {
    return { applied: 0, totalRules: 0, fileMissing: false, rulesMissing: true, replacements: 0, multiMatch: [] };
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  const { content: newContent, appliedCount, replacements, multiMatch } = applyReplacements(content, rules);

  if (!options.isDryRun && replacements > 0) {
    fs.writeFileSync(targetFile, newContent, 'utf8');
  }

  return {
    applied: appliedCount,
    totalRules: Array.isArray(rules) ? rules.length : 0,
    fileMissing: false,
    rulesMissing: false,
    replacements,
    multiMatch,
  };
}

/**
 * 应用所有原生替换规则到 staging 目录中的目标文件。
 * @param {string} stagingDir
 * @param {string} rulesDir
 * @param {Record<string, string>} [targets=DEFAULT_TARGETS]
 * @param {{ isDryRun?: boolean, logger?: ((msg: string) => void) | null, warn?: ((msg: string) => void) | null }} [options]
 * @returns {{ totalApplied: number, totalReplacements: number, fileStats: Record<string, { applied: number, totalRules: number, replacements?: number, multiMatch?: number[], skipped?: boolean, skipReason?: string }> }}
 */
function patchAllTargets(stagingDir, rulesDir, targets = DEFAULT_TARGETS, options = {}) {
  let totalApplied = 0;
  let totalReplacements = 0;
  const fileStats = {};
  const logger = options.logger === undefined ? console.log : options.logger;
  const warn = options.warn === undefined ? console.warn : options.warn;

  for (const [scope, relPath] of Object.entries(targets)) {
    const targetFile = path.join(stagingDir, relPath);
    const rulesFile = path.join(rulesDir, `${scope}.replacements.json`);
    const stat = patchTargetFile(targetFile, rulesFile, options);

    if (stat.fileMissing || stat.rulesMissing) {
      // 分别说明缺的是规则文件还是目标文件：旧版一律打印「文件缺失」，
      // 上游改名导致的漏补丁会被当成正常现象放过。
      const reason = stat.rulesMissing ? `规则文件缺失: ${rulesFile}` : `目标文件缺失: ${targetFile}`;
      if (logger) logger(`⚠️ [${scope}] ${reason}，跳过`);
      if (warn) warn(`⚠️ [${scope}] 未打补丁，界面可能残留英文（${reason}）`);
      fileStats[scope] = { applied: 0, totalRules: 0, skipped: true, skipReason: reason };
      continue;
    }

    totalApplied += stat.applied;
    totalReplacements += stat.replacements;
    fileStats[scope] = {
      applied: stat.applied,
      totalRules: stat.totalRules,
      replacements: stat.replacements,
      multiMatch: stat.multiMatch,
    };
    if (logger) {
      logger(`✅ [${scope}] ${stat.applied}/${stat.totalRules} 条规则匹配（${stat.replacements} 处替换）`);
    }
    // PROJECT.md 的契约要求 targetString 在目标文件中唯一匹配。命中多处不再是错误
    // （以 Rust 的全量替换语义为准），但必须显式告知：多处命中往往意味着规则写得太宽。
    if (stat.multiMatch.length > 0 && warn) {
      warn(`⚠️ [${scope}] ${stat.multiMatch.length} 条规则命中多于一次（下标 ${stat.multiMatch.join(', ')}），`
        + '已按全量替换处理；请确认这不是过宽的规则。');
    }
  }

  return { totalApplied, totalReplacements, fileStats };
}

const patchTargetFiles = patchAllTargets;

module.exports = {
  DEFAULT_TARGETS,
  escapeRegExp,
  normalizeRule,
  applyReplacements,
  loadRules,
  patchTargetFile,
  patchAllTargets,
  patchTargetFiles,
};
