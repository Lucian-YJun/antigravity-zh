// 发版前校验：确认已有 zip 的每个条目都与「当前源码」逐字节一致。
// 唯一映射真源是 package-release.js 的 collectEntries()，避免在这里再抄一份清单。
// 纯只读：不写文件、不联网、不调用 git；失败时抛出带诊断信息的 Error。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readZip } = require('./zip');
const { collectEntries } = require('./release-plan');

const sha8 = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

/**
 * 校验 zip 与当前源码是否一致。
 * @param {string} root 仓库根目录
 * @param {string} zipPath 待校验的 zip 路径
 * @returns {{ ok: true, count: number }} 通过
 * @throws {Error} 不一致时抛出，信息里列出每个差异条目并提示重新构建
 */
function verifyReleaseZip(root, zipPath) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`发布包不存在: ${zipPath}\n请先执行 npm run build（= build:rust + release:package）。`);
  }

  const expected = collectEntries(root, { requireExe: true });
  const buf = fs.readFileSync(zipPath);
  let actual;
  try {
    actual = readZip(buf, { withData: true });
  } catch (e) {
    throw new Error(`发布包无法解析: ${zipPath}\n${e.message}\n请先执行 npm run build。`);
  }

  const problems = [];
  const expNames = expected.map(e => e.name);
  const actNames = actual.map(e => e.name);

  // 1) 条目集合与顺序（缺 native 表、被换成旧包都会在这里暴露）
  if (expNames.join('\n') !== actNames.join('\n')) {
    const expSet = new Set(expNames);
    const actSet = new Set(actNames);
    const missing = expNames.filter(n => !actSet.has(n));
    const extra = actNames.filter(n => !expSet.has(n));
    if (missing.length) problems.push(`缺少条目: ${missing.join(', ')}`);
    if (extra.length) problems.push(`多余条目: ${extra.join(', ')}`);
    if (!missing.length && !extra.length) problems.push('条目顺序与清单不一致');
  }

  // 2) 逐条比字节（文本、CRLF bat、二进制 exe 一视同仁；不做任何编码/行尾归一化）
  const byName = new Map(actual.map(e => [e.name, e]));
  for (const item of expected) {
    const z = byName.get(item.name);
    if (!z) continue; // 缺失已在上面报告
    if (!z.data.equals(item.data)) {
      problems.push(
        `内容变更: ${item.name} ← ${item.source}`
        + `（zip ${z.size} B / sha ${sha8(z.data)}，磁盘 ${item.data.length} B / sha ${sha8(item.data)}）`
      );
    }
  }

  if (problems.length) {
    throw new Error(
      `发布包与当前源码不一致（${problems.length} 项）：\n  - ${problems.join('\n  - ')}`
      + '\n\n请先执行 npm run build（= build:rust + release:package）后重试。'
    );
  }
  return { ok: true, count: expected.length };
}

/** 打印一份「zip 条目 ← 磁盘源文件」映射，供人工核对 / --dry-run 之外的诊断。 */
function describeReleasePlan(root) {
  return collectEntries(root, { requireExe: false })
    .map(e => `${e.name} ← ${e.source} (${e.data.length} B)`);
}

module.exports = { verifyReleaseZip, describeReleasePlan, sha8 };
