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
 * 纯字符串替换引擎：将 [oldStr, newStr] 规则批量应用于文本内容。
 * @param {string} content
 * @param {[string, string][]} rules
 * @returns {{ content: string, appliedCount: number, matchedRules: number }}
 */
function applyReplacements(content, rules) {
  let appliedCount = 0;
  let matchedRules = 0;
  let result = content;
  if (!Array.isArray(rules)) {
    return { content: result, appliedCount: 0, matchedRules: 0 };
  }
  for (const [oldStr, newStr] of rules) {
    if (typeof oldStr === 'string' && result.includes(oldStr)) {
      result = result.replace(oldStr, newStr);
      appliedCount++;
      matchedRules++;
    }
  }
  return { content: result, appliedCount, matchedRules };
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
 * @returns {{ applied: number, totalRules: number, fileMissing: boolean, rulesMissing: boolean }}
 */
function patchTargetFile(targetFile, rulesFile, options = {}) {
  if (!fs.existsSync(targetFile)) {
    return { applied: 0, totalRules: 0, fileMissing: true, rulesMissing: false };
  }
  if (!fs.existsSync(rulesFile)) {
    return { applied: 0, totalRules: 0, fileMissing: false, rulesMissing: true };
  }
  let rules;
  try {
    rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
  } catch {
    return { applied: 0, totalRules: 0, fileMissing: false, rulesMissing: true };
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  const { content: newContent, appliedCount } = applyReplacements(content, rules);

  if (!options.isDryRun && appliedCount > 0) {
    fs.writeFileSync(targetFile, newContent, 'utf8');
  }

  return {
    applied: appliedCount,
    totalRules: Array.isArray(rules) ? rules.length : 0,
    fileMissing: false,
    rulesMissing: false,
  };
}

/**
 * 应用所有原生替换规则到 staging 目录中的目标文件。
 * @param {string} stagingDir
 * @param {string} rulesDir
 * @param {Record<string, string>} [targets=DEFAULT_TARGETS]
 * @param {{ isDryRun?: boolean, logger?: ((msg: string) => void) | null }} [options]
 * @returns {{ totalApplied: number, fileStats: Record<string, { applied: number, totalRules: number, skipped?: boolean }> }}
 */
function patchAllTargets(stagingDir, rulesDir, targets = DEFAULT_TARGETS, options = {}) {
  let totalApplied = 0;
  const fileStats = {};
  const logger = options.logger === undefined ? console.log : options.logger;

  for (const [scope, relPath] of Object.entries(targets)) {
    const targetFile = path.join(stagingDir, relPath);
    const rulesFile = path.join(rulesDir, `${scope}.replacements.json`);
    const stat = patchTargetFile(targetFile, rulesFile, options);

    if (stat.fileMissing || stat.rulesMissing) {
      if (logger) logger(`⚠️ [${scope}] 文件缺失，跳过`);
      fileStats[scope] = { applied: 0, totalRules: 0, skipped: true };
      continue;
    }

    totalApplied += stat.applied;
    fileStats[scope] = { applied: stat.applied, totalRules: stat.totalRules };
    if (logger) logger(`✅ [${scope}] ${stat.applied}/${stat.totalRules} 条规则匹配`);
  }

  return { totalApplied, fileStats };
}

const patchTargetFiles = patchAllTargets;

module.exports = {
  DEFAULT_TARGETS,
  applyReplacements,
  loadRules,
  patchTargetFile,
  patchAllTargets,
  patchTargetFiles,
};
