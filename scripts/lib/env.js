const fs = require('fs');
const path = require('path');

/**
 * 校验运行环境并返回 resources 目录路径。
 * 保持 patch.js 原始的错误提示和 process.exit(1) 退出行为。
 * @param {string} [customLocalAppData]
 * @returns {string} resourcesDir
 */
function checkEnvironment(customLocalAppData) {
  const localAppData = customLocalAppData !== undefined ? customLocalAppData : process.env.LOCALAPPDATA;
  if (!localAppData) {
    console.error('❌ 找不到 LOCALAPPDATA 环境变量，当前只支持 Windows。');
    process.exit(1);
  }
  const dir = path.join(localAppData, 'Programs', 'antigravity', 'resources');
  if (!fs.existsSync(dir)) {
    console.error(`❌ 未找到 Antigravity 资源目录: ${dir}`);
    process.exit(1);
  }
  return dir;
}

/**
 * 根据 LOCALAPPDATA 解析所有安装与部署相关路径。
 * @param {string} [customLocalAppData]
 * @param {{ mustExist?: boolean }} [options]
 * @returns {object}
 */
function getInstallationPaths(customLocalAppData, options = {}) {
  const localAppData = customLocalAppData !== undefined ? customLocalAppData : process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error('找不到 LOCALAPPDATA 环境变量');
  }
  const resourcesDir = path.join(localAppData, 'Programs', 'antigravity', 'resources');
  if (options.mustExist && !fs.existsSync(resourcesDir)) {
    throw new Error(`未找到 Antigravity 资源目录: ${resourcesDir}`);
  }

  return {
    resourcesDir,
    asarPath: path.join(resourcesDir, 'app.asar'),
    origPath: path.join(resourcesDir, 'app.asar.orig'),
    appDir: path.join(resourcesDir, 'app'),
    kitDir: path.join(resourcesDir, 'zh-patch'),
    backupMetaPath: path.join(resourcesDir, 'app.asar.orig.meta.json'),
    appNewDir: path.join(resourcesDir, 'app.new'),
    appOldDir: path.join(resourcesDir, 'app.old'),
    kitNewDir: path.join(resourcesDir, 'zh-patch.new'),
    kitOldDir: path.join(resourcesDir, 'zh-patch.old'),
    backupTmpPath: path.join(resourcesDir, 'app.asar.orig.tmp'),
    backupOldPath: path.join(resourcesDir, 'app.asar.orig.old'),
    unpackedDir: path.join(resourcesDir, 'app.asar.unpacked'),
    origUnpackedDir: path.join(resourcesDir, 'app.asar.orig.unpacked'),
    exePath: path.join(path.dirname(resourcesDir), 'Antigravity.exe'),
  };
}

/**
 * 解析翻译组件、词典与原生替换表的源文件路径。
 * 支持 exe 同级目录与外置 src 目录优先覆盖。
 * @param {string} [projectRoot]
 * @param {string} [exeDir]
 * @returns {object}
 */
function resolveSourceAssets(projectRoot, exeDir) {
  const root = projectRoot || path.resolve(__dirname, '../..');
  const dir = exeDir || path.dirname(process.execPath);

  const externalSrcDir = path.join(dir, 'src');
  const hasExternalSrc = fs.existsSync(externalSrcDir);

  const nativePatchesDir = hasExternalSrc
    ? path.join(externalSrcDir, 'native')
    : path.join(root, 'src', 'native');

  const sourceI18n = hasExternalSrc && fs.existsSync(path.join(externalSrcDir, 'zh-i18n.js'))
    ? path.join(externalSrcDir, 'zh-i18n.js')
    : path.join(root, 'src', 'zh-i18n.js');

  let sourceDict = path.join(root, 'src', 'cockpit-zh.json');
  if (fs.existsSync(path.join(dir, 'cockpit-zh.json'))) {
    sourceDict = path.join(dir, 'cockpit-zh.json');
  } else if (hasExternalSrc && fs.existsSync(path.join(externalSrcDir, 'cockpit-zh.json'))) {
    sourceDict = path.join(externalSrcDir, 'cockpit-zh.json');
  }

  return {
    sourceI18n,
    sourceDict,
    nativePatchesDir,
    hasExternalSrc,
    exeDir: dir,
  };
}

/**
 * 获取 DevToolsActivePort 端口文件路径。
 * @param {string} [customAppData]
 * @returns {string}
 */
function getDevToolsPortPath(customAppData) {
  const appData = customAppData !== undefined ? customAppData : (process.env.APPDATA || '');
  return path.join(appData, 'Antigravity', 'DevToolsActivePort');
}

module.exports = {
  checkEnvironment,
  getInstallationPaths,
  resolveSourceAssets,
  getDevToolsPortPath,
};
