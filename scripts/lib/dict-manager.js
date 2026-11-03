const fs = require('fs');
const path = require('path');

/**
 * 解析单行词条。支持 "=", "=>", "：" 三种分隔符，取最靠前的一个。
 * 首尾空格在原始行上判定为非法。
 * @param {string} line
 * @returns {{ src: string, dst: string | null } | { invalid: true } | null}
 */
function parseTermLine(line) {
  if (typeof line !== 'string') return null;
  if (!line.trim() || line.trim().startsWith('#')) return null;
  // 首尾空格在原始行上就拦下：词典对首尾空格零容忍
  if (line !== line.trim()) return { invalid: true };

  const seps = ['=>', '=', '：'];
  let idx = -1;
  let sepLen = 0;
  for (const s of seps) {
    const i = line.indexOf(s);
    // 分隔符出现在第 0 位说明这一行没有原文（如 "= 只有译文"），视为非法
    if (i === 0) return { invalid: true };
    if (i > 0 && (idx < 0 || i < idx)) {
      idx = i;
      sepLen = s.length;
    }
  }

  if (idx < 0) return { src: line, dst: null };

  const src = line.slice(0, idx).trim();
  const dst = line.slice(idx + sepLen).trim();
  if (!src || !dst) return { invalid: true };
  return { src, dst };
}

/**
 * 根据引擎归一化函数为词典构建归一化索引：normalizedKey -> [originalKey, ...]。
 * @param {Record<string, string>} dict
 * @param {(s: string) => string} [normKeyFn]
 * @returns {Map<string, string[]>}
 */
function buildNormalizationIndex(dict, normKeyFn) {
  const idx = new Map();
  if (typeof normKeyFn !== 'function') return idx;
  for (const k of Object.keys(dict || {})) {
    const n = normKeyFn(k);
    if (!idx.has(n)) idx.set(n, []);
    idx.get(n).push(k);
  }
  return idx;
}

const buildNormIndex = buildNormalizationIndex;

/**
 * 校验候选词条是否已被归一化规则覆盖。
 * @param {string} src
 * @param {string | null} dst
 * @param {Record<string, string>} dict
 * @param {Map<string, string[]>} normIndex
 * @param {(s: string) => string} [normKeyFn]
 * @returns {{ isRedundant: boolean, existingKey?: string }}
 */
function checkRedundancy(src, dst, dict, normIndex, normKeyFn) {
  if (typeof normKeyFn !== 'function' || !normIndex) return { isRedundant: false };
  const n = normKeyFn(src);
  const hits = (normIndex.get(n) || []).filter(k => k !== src);
  if (hits.length) {
    // 只给原文时更危险：占位符会成为精确匹配，反过来遮蔽归一化命中的正确译文，
    // 所以只要归一化后已经有条目，就不该再写入。
    if (dst === null || hits.some(k => dict[k] === dst)) {
      return { isRedundant: true, existingKey: hits[0] };
    }
  }
  return { isRedundant: false };
}

/**
 * 词典格式静态校验（空 key、空值、首尾空格）。
 * @param {Record<string, string>} dict
 * @returns {string[]} 异常列表，无异常返回空数组
 */
function validateDictionary(dict) {
  const problems = [];
  for (const [k, v] of Object.entries(dict || {})) {
    if (k === '' || v === '') problems.push(`空 key 或空值: ${JSON.stringify(k)}`);
    if (k !== k.trim()) problems.push(`key 首尾空格: ${JSON.stringify(k)}`);
    if (typeof v === 'string' && v !== v.trim()) problems.push(`值首尾空格: ${JSON.stringify(k)}`);
  }
  return problems;
}

/**
 * 查找并清理「归一化后同键、且译文完全相同」的冗余变体。
 * @param {Record<string, string>} dict
 * @param {(s: string) => string} normKeyFn
 * @returns {{ removed: [string, string][], remainingCount: number }}
 */
function findRedundantVariants(dict, normKeyFn) {
  const groups = new Map();
  for (const k of Object.keys(dict || {})) {
    const n = normKeyFn(k);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(k);
  }

  const removed = [];
  for (const [n, keys] of groups) {
    if (keys.length < 2) continue;
    const values = new Set(keys.map(k => dict[k]));
    // 同组存在多种译文 → 属于有意义的变体，整组保留
    if (values.size !== 1) continue;
    // 优先保留规范形态（归一化是恒等变换），没有则留第一条
    const keep = keys.find(k => normKeyFn(k) === k) || keys[0];
    for (const k of keys) {
      if (k === keep) continue;
      delete dict[k];
      removed.push([k, keep]);
    }
  }
  return { removed, remainingCount: Object.keys(dict || {}).length };
}

/**
 * 批量处理词条行。
 * @param {string[]} lines
 * @param {Record<string, string>} dict
 * @param {{ isForce?: boolean, normKeyFn?: (s: string) => string, normIndex?: Map<string, string[]>, placeholder?: string }} [options]
 * @returns {{ added: [string, string][], skipped: string[], invalid: string[], redundant: [string, string][], normIndex: Map<string, string[]> }}
 */
function processTerms(lines, dict, options = {}) {
  const isForce = Boolean(options.isForce);
  const normKeyFn = options.normKeyFn || null;
  const normIndex = options.normIndex || (normKeyFn ? buildNormalizationIndex(dict, normKeyFn) : null);
  const placeholder = options.placeholder || '⟪待翻译⟫';

  const added = [];
  const skipped = [];
  const invalid = [];
  const redundant = [];

  for (const line of lines) {
    const item = parseTermLine(line);
    if (!item) continue;
    if (item.invalid) {
      invalid.push(line);
      continue;
    }

    const exists = Object.prototype.hasOwnProperty.call(dict, item.src);
    if (exists && !isForce) {
      skipped.push(item.src);
      continue;
    }

    if (normKeyFn && !isForce) {
      const red = checkRedundancy(item.src, item.dst, dict, normIndex, normKeyFn);
      if (red.isRedundant) {
        redundant.push([item.src, red.existingKey]);
        continue;
      }
    }

    const finalDst = item.dst === null ? placeholder : item.dst;
    dict[item.src] = finalDst;
    added.push([item.src, finalDst]);

    if (normKeyFn && normIndex) {
      const n2 = normKeyFn(item.src);
      if (!normIndex.has(n2)) normIndex.set(n2, []);
      normIndex.get(n2).push(item.src);
    }
  }

  return { added, skipped, invalid, redundant, normIndex };
}

function readDictionary(dictPath) {
  return JSON.parse(fs.readFileSync(dictPath, 'utf8'));
}

function writeDictionary(dictPath, data) {
  fs.writeFileSync(dictPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = {
  parseTermLine,
  buildNormalizationIndex,
  buildNormIndex,
  checkRedundancy,
  validateDictionary,
  findRedundantVariants,
  processTerms,
  readDictionary,
  writeDictionary,
};
