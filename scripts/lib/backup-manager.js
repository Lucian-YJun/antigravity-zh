const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fpCache = new Map();

/**
 * 分块（1MB）计算文件的 SHA256 哈希。
 * @param {string} file
 * @returns {string}
 */
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const buf = Buffer.allocUnsafe(1 << 20);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function statMatches(a, b) {
  return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * 计算或获取文件指纹 { size, mtimeMs, sha256 }。
 * @param {string} file
 * @param {Map<string, object>} [cache=fpCache]
 * @returns {{ size: number, mtimeMs: number, sha256: string }}
 */
function fingerprint(file, cache = fpCache) {
  const st = fs.statSync(file);
  const stat = { size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
  const cached = cache ? cache.get(file) : null;
  if (cached && statMatches(cached, stat)) return cached;
  const fp = { ...stat, sha256: sha256File(file) };
  if (cache) cache.set(file, fp);
  return fp;
}

function fingerprintOrNull(file, cache = fpCache) {
  try {
    return fs.existsSync(file) ? fingerprint(file, cache) : null;
  } catch {
    return null;
  }
}

/**
 * 信任已知指纹：若 size 与 mtimeMs 吻合则复用 sha256，省去重新计算百 MB 大文件哈希。
 * @param {string} file
 * @param {object} known
 * @param {Map<string, object>} [cache=fpCache]
 * @returns {{ size: number, mtimeMs: number, sha256: string }}
 */
function fingerprintTrusting(file, known, cache = fpCache) {
  const st = fs.statSync(file);
  const fp = { size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
  return statMatches(fp, known) && known && known.sha256
    ? { ...fp, sha256: known.sha256 }
    : fingerprint(file, cache);
}

function fingerprintTrustingOrNull(file, known, cache = fpCache) {
  try {
    return fs.existsSync(file) ? fingerprintTrusting(file, known, cache) : null;
  } catch {
    return null;
  }
}

function sameFingerprint(a, b) {
  return !!a && !!b && a.size === b.size && a.sha256 === b.sha256;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 原子写入备份源文件溯源元数据。
 * @param {string} metaPath
 * @param {string} origPath
 * @param {object} [sourceFp]
 */
function writeBackupMeta(metaPath, origPath, sourceFp) {
  if (!fs.existsSync(origPath)) return;
  const source = sourceFp || fingerprintOrNull(origPath);
  if (!source) return;
  writeJsonFile(metaPath, { source, recordedAt: new Date().toISOString() });
}

/**
 * 判断现有备份是否已过期（与当前 asar 文件不同源）。
 * @param {string} metaPath
 * @param {string} asarFile
 * @returns {boolean}
 */
function isBackupStaleFor(metaPath, asarFile) {
  const meta = readJsonFile(metaPath);
  const current = fingerprintOrNull(asarFile);
  return !(meta && current && sameFingerprint(meta.source, current));
}

/**
 * 从中断的部署中恢复文件与目录。
 * @param {object} paths
 */
function recoverInterruptedDeploy(paths) {
  const {
    asarPath,
    origPath,
    appDir,
    kitDir,
    backupMetaPath,
    appNewDir,
    appOldDir,
    kitNewDir,
    kitOldDir,
    backupTmpPath,
    backupOldPath,
  } = paths;

  if (!fs.existsSync(asarPath) && !fs.existsSync(origPath)) {
    // 两份备份都在临时名下时，backupTmp 是当前版本，优先用它
    for (const leftover of [backupTmpPath, backupOldPath]) {
      if (!fs.existsSync(leftover)) continue;
      fs.renameSync(leftover, origPath);
      console.log(`⚠️ 已从上次中断的部署中恢复 ${path.basename(origPath)}`);
      break;
    }
  }

  for (const [live, candidates] of [
    [appDir, [appOldDir, appNewDir]],
    [kitDir, [kitOldDir, kitNewDir]],
  ]) {
    if (fs.existsSync(live)) continue;
    for (const leftover of candidates) {
      if (!fs.existsSync(leftover)) continue;
      fs.renameSync(leftover, live);
      console.log(`⚠️ 已从上次中断的部署中恢复 ${path.basename(live)}/`);
      break;
    }
  }

  // 归位之后还留在中间名上的都是残骸；仍被占用的留到下次（至少不影响运行）
  for (const dir of [appNewDir, kitNewDir]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  if (fs.existsSync(appDir) && fs.existsSync(appOldDir)) {
    fs.rmSync(appOldDir, { recursive: true, force: true });
  }
  if (fs.existsSync(kitDir) && fs.existsSync(kitOldDir)) {
    fs.rmSync(kitOldDir, { recursive: true, force: true });
  }
  if (fs.existsSync(origPath)) {
    fs.rmSync(backupTmpPath, { force: true });
    fs.rmSync(backupOldPath, { force: true });
  }

  // 备份与当前包不同源时，meta 一并作废，避免下次误信过期溯源
  if (!fs.existsSync(origPath)) fs.rmSync(backupMetaPath, { force: true });
  fs.rmSync(`${backupMetaPath}.tmp`, { force: true });
}

module.exports = {
  fpCache,
  sha256File,
  statMatches,
  fingerprint,
  fingerprintOrNull,
  fingerprintTrusting,
  fingerprintTrustingOrNull,
  sameFingerprint,
  readJsonFile,
  writeJsonFile,
  writeBackupMeta,
  isBackupStaleFor,
  recoverInterruptedDeploy,
};
