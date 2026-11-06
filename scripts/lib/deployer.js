const fs = require('fs');
const path = require('path');
const os = require('os');
const backupManager = require('./backup-manager');

/**
 * 在系统临时目录下创建隔离的 staging 目录。
 * @param {string} [prefix='agy-zh-stage']
 * @returns {string} stagingDir
 */
function createStagingDirectory(prefix = 'agy-zh-stage') {
  const staging = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  return staging;
}

/**
 * 为 app.asar.orig.unpacked 创建 NTFS 目录联接指向 app.asar.unpacked。
 * 返回 cleanup 函数以便清理。
 * @param {string} resourcesDir
 * @param {string} sourceAsar
 * @param {string} asarPath
 * @returns {() => void}
 */
function setupUnpackedJunction(resourcesDir, sourceAsar, asarPath) {
  let junctionPath = null;
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
  if (sourceAsar !== asarPath && fs.existsSync(unpackedDir)) {
    junctionPath = path.join(resourcesDir, 'app.asar.orig.unpacked');
    if (!fs.existsSync(junctionPath)) {
      try {
        fs.symlinkSync(unpackedDir, junctionPath, 'junction');
      } catch { /* 忽略已存在或无权限 */ }
    }
  }
  return function cleanupJunction() {
    if (junctionPath) {
      try {
        fs.rmdirSync(junctionPath);
      } catch { /* 联接可能已被清理 */ }
      junctionPath = null;
    }
  };
}

/**
 * 测试专用故障注入的 rename。
 * @param {string} from
 * @param {string} to
 */
function deployRename(from, to) {
  // 故障注入只在源码运行时生效：package.json 的 pkg.assets 把 scripts/lib/**/*
  // 打进了发布 exe，一个恰好同名的环境变量不该让生产安装凭空失败。
  const probe = process.pkg ? null : process.env.AGY_ZH_TEST_FAIL_RENAME;
  if (probe && `${path.basename(from)}>${path.basename(to)}` === probe) {
    const err = new Error(`注入的部署失败（测试用）: ${path.basename(from)} → ${path.basename(to)}`);
    err.code = 'EIO';
    throw err;
  }
  fs.renameSync(from, to);
}

/**
 * 将目录移动至目标路径，跨卷 (EXDEV) 时自动退回递归复制。
 * @param {string} from
 * @param {string} to
 */
function moveIntoPlace(from, to) {
  try {
    deployRename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

/**
 * 两阶段原子部署与自动逆序回滚。
 * @param {object} paths
 * @param {string|((kitNewDir: string) => void)} arg2
 * @param {string|((kitNewDir: string) => void)} arg3
 */
function deployAtomically(paths, arg2, arg3) {
  let stagingDir;
  let prepareKit;
  if (typeof arg2 === 'function') {
    prepareKit = arg2;
    stagingDir = arg3;
  } else {
    stagingDir = arg2;
    prepareKit = arg3;
  }

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

  const hadAsar = fs.existsSync(asarPath);
  const hadOrig = fs.existsSync(origPath);
  const hadAppDir = fs.existsSync(appDir);
  const hadKitDir = fs.existsSync(kitDir);

  const previousMeta = backupManager.readJsonFile(backupMetaPath);
  const originalFp = hadAsar
    ? backupManager.fingerprintOrNull(asarPath)
    : backupManager.fingerprintTrustingOrNull(origPath, previousMeta && previousMeta.source);

  let backupMoved = false;
  let backupArchived = false;
  let backupCommitted = false;

  try {
    // 1. 新代码落到 app.new（正式目录尚未触碰）
    fs.rmSync(appNewDir, { recursive: true, force: true });
    moveIntoPlace(stagingDir, appNewDir);

    // 2. 新的翻译组件也在中间名准备好
    if (typeof prepareKit === 'function') {
      prepareKit(kitNewDir);
    }

    // 3. 备份当前原包：先进临时名，旧 .orig 退到 .old（不立刻销毁）
    if (hadAsar) {
      deployRename(asarPath, backupTmpPath);
      backupMoved = true;
      if (hadOrig) {
        deployRename(origPath, backupOldPath);
        backupArchived = true;
      }
    }

    // 4. 切换 app/：旧 → app.old，新 → app
    if (fs.existsSync(appDir)) deployRename(appDir, appOldDir);
    deployRename(appNewDir, appDir);

    // 5. 切换 zh-patch/
    if (fs.existsSync(kitDir)) deployRename(kitDir, kitOldDir);
    deployRename(kitNewDir, kitDir);

    // 6. 备份落位，再单独刷新溯源
    if (hadAsar) {
      deployRename(backupTmpPath, origPath);
      backupCommitted = true;
    }
    backupManager.writeBackupMeta(backupMetaPath, origPath, originalFp);
  } catch (err) {
    // 逆序回滚。回滚路径一律用原生 rename：注入的失败点不该拖累恢复。
    const safe = (label, fn) => {
      try { fn(); } catch (e) { console.error(`⚠️ 回滚「${label}」失败: ${e.message}`); }
    };
    safe('zh-patch', () => {
      if (fs.existsSync(kitOldDir)) {
        if (fs.existsSync(kitDir)) fs.rmSync(kitDir, { recursive: true, force: true });
        fs.renameSync(kitOldDir, kitDir);
      } else if (!hadKitDir && fs.existsSync(kitDir)) {
        fs.rmSync(kitDir, { recursive: true, force: true });
      }
      if (fs.existsSync(kitNewDir)) fs.rmSync(kitNewDir, { recursive: true, force: true });
    });
    safe('app', () => {
      if (fs.existsSync(appOldDir)) {
        if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
        fs.renameSync(appOldDir, appDir);
      } else if (!hadAppDir && fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
      if (fs.existsSync(appNewDir)) fs.rmSync(appNewDir, { recursive: true, force: true });
    });
    safe('app.asar', () => {
      if (!hadAsar) return;
      if (backupCommitted) {
        fs.renameSync(origPath, asarPath);
      } else if (backupMoved && fs.existsSync(backupTmpPath)) {
        fs.renameSync(backupTmpPath, asarPath);
      }
      if (backupArchived && !fs.existsSync(origPath) && fs.existsSync(backupOldPath)) {
        fs.renameSync(backupOldPath, origPath);
      }
    });
    console.warn('↩️ 已按逆序回滚，安装目录停留在部署前的可用状态。');
    throw err;
  }

  // 全部成功后才删旧物
  for (const leftover of [appOldDir, kitOldDir, backupOldPath]) {
    try {
      fs.rmSync(leftover, { recursive: true, force: true });
    } catch (e) {
      console.warn(`⚠️ ${path.basename(leftover)} 暂未清理（下次运行会自动清理）: ${e.message}`);
    }
  }
  if (hadAsar) console.log('✅ 原包已备份为 app.asar.orig');
}

module.exports = {
  createStagingDirectory,
  setupUnpackedJunction,
  deployRename,
  moveIntoPlace,
  deployAtomically,
};
