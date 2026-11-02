#!/usr/bin/env node

/**
 * Antigravity 中文汉化补丁 - 一键安装与还原脚本
 * 纯 Node.js，使用 asar API 解包
 * 
 * 模块化架构：
 * 核心逻辑委托至 scripts/lib/ 下的高内聚模块：
 * - env.js: 环境与路径解析
 * - process-manager.js: 进程生命周期与 sidecar 判定
 * - backup-manager.js: 指纹计算、溯源元数据与故障恢复
 * - replacement-engine.js: 原生字符串规则替换
 * - deployer.js: 临时解包、目录联接与两阶段原子部署
 */

const fs = require('fs');
const path = require('path');
const env = require('./lib/env');
const processManager = require('./lib/process-manager');
const backupManager = require('./lib/backup-manager');
const replacementEngine = require('./lib/replacement-engine');
const deployer = require('./lib/deployer');

// 导出进程解析纯函数，供自动化测试直接调用
const { parseProcessList } = processManager;

// 被测试 require 时只导出纯函数，不执行安装流程。
// pkg 打包后的 exe 里 process.pkg 有值，因此始终走下面的主流程。
const DETECT_ONLY = !process.pkg && require.main !== module;
if (DETECT_ONLY) {
    module.exports = { parseProcessList };
}

if (!DETECT_ONLY) {

const args = process.argv.slice(2);
const isRevert = args.includes('--revert');
const isDryRun = args.includes('--dry-run');
const isClose = args.includes('--close');
const isRelaunch = args.includes('--relaunch');

console.log(`🚀 Antigravity 中文汉化补丁 (Next-Gen)${isDryRun ? ' [预览模式]' : ''}${isRevert ? ' [还原]' : ''}\n`);

// ---- 环境检查 ----
function checkEnvironment() {
    return env.checkEnvironment();
}

const resourcesDir = checkEnvironment();
const paths = env.getInstallationPaths();
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
    unpackedDir,
} = paths;

const {
    fingerprint,
    fingerprintOrNull,
    fingerprintTrusting,
    fingerprintTrustingOrNull,
    sameFingerprint,
    readJsonFile,
    writeJsonFile,
    writeBackupMeta,
    sha256File,
    statMatches,
} = backupManager;

function isBackupStaleFor(asarFile) {
    return backupManager.isBackupStaleFor(backupMetaPath, asarFile);
}

function recoverInterruptedDeploy() {
    backupManager.recoverInterruptedDeploy(paths);
}

const {
    createStagingDirectory,
    setupUnpackedJunction,
    deployRename,
    moveIntoPlace,
    deployAtomically,
} = deployer;

const {
    DEFAULT_TARGETS,
    applyReplacements,
    loadRules,
    patchTargetFile,
    patchAllTargets,
} = replacementEngine;

// Antigravity 的 agent sidecar 与 IDE 主进程同名（都由 Antigravity.exe 承载）。
// sidecar 判定特征：无主窗口、不含 --type=、命中运行时特征。
const SIDECAR_POWERSHELL_FILTER = "$win=[int]$gp.MainWindowHandle; if ($c -and $win -eq 0 -and ($c -notmatch '--type='))";

function listAntigravityProcesses() {
    return processManager.listAntigravityProcesses();
}

function isAntigravityRunning() {
    try {
        return processManager.isAntigravityRunning();
    } catch {
        return true;
    }
}

function killResidualSidecars() {
    return processManager.killResidualSidecars();
}

function gracefulCloseAntigravity() {
    return processManager.gracefulCloseAntigravity();
}

function relaunchAntigravity(resourcesDir) {
    return processManager.relaunchAntigravity(resourcesDir);
}

// ---- 还原 ----
// 还原分支：确认 IDE 已退出 → 清理残留 sidecar → 归位中断部署 → 恢复原包并删除补丁产物。
function runRevert() {
    if (isAntigravityRunning()) {
        console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再还原。');
        process.exit(1);
    }
    console.log('🔄 开始还原...');
    killResidualSidecars();
    try {
        recoverInterruptedDeploy();
    } catch (err) {
        console.error(`⚠️ 清理上次中断的部署失败: ${err.message}`);
    }
    try {
        const backupIsStale = fs.existsSync(origPath) && fs.existsSync(asarPath) && isBackupStaleFor(asarPath);
        if (fs.existsSync(origPath) && !backupIsStale) {
            if (fs.existsSync(asarPath)) fs.unlinkSync(asarPath);
            fs.renameSync(origPath, asarPath);
            console.log('✅ 恢复了 app.asar');
        } else if (backupIsStale) {
            console.log('⚠️ 客户端已经更新过，app.asar.orig 是上一版留下的备份，不能用它覆盖新版本。');
            console.log('   当前安装的就是更新后的英文原版，汉化补丁已全部移除，不会降级也不会残留。');
            console.log('   无需任何额外操作，直接启动 Antigravity 即可。');
            fs.rmSync(origPath, { force: true });
        } else {
            console.log('💡 没找到 app.asar.orig：补丁本来就不在安装状态，无需还原。');
            console.log('   直接启动 Antigravity 即可（正常情况下它已经是英文原版）。');
        }
        fs.rmSync(backupMetaPath, { force: true });
        for (const dir of [appDir, kitDir]) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`✅ 删除了 ${path.basename(dir)}/`);
            }
        }
    } catch (err) {
        console.error(`\n❌ 还原失败: ${err.message}`);
        console.error('   可能有进程仍占用 Antigravity 安装目录（例如残留的后台进程）。');
        console.error('   请完全退出 Antigravity（含系统托盘图标）后重试；');
        console.error('   若已备份 app.asar.orig，重试可继续完成还原。');
        process.exit(1);
    }
    console.log('🎉 还原完成，Antigravity 已恢复英文原版！');
    process.exit(0);
}

// ---- 安装 ----
function runInstall() {
    if (isAntigravityRunning() && !isDryRun) {
        if (isClose) {
            if (!gracefulCloseAntigravity()) process.exit(1);
        } else {
            console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再打补丁。');
            console.error('   应用更新后恢复推荐用: npm run repatch（自动关闭→打补丁→重新打开）');
            console.error('   （可用 --dry-run 在不退出的情况下预览匹配情况）');
            process.exit(1);
        }
    } else if (!isDryRun) {
        killResidualSidecars();
    }

    if (!isDryRun) recoverInterruptedDeploy();

    let sourceAsar = asarPath;
    if (fs.existsSync(origPath)) {
        if (!fs.existsSync(asarPath)) {
            sourceAsar = origPath;
        } else if (isBackupStaleFor(asarPath)) {
            console.log('💡 检测到 Antigravity 已更新，上次留下的英文备份属于旧版本，不会用它覆盖新版本。');
            console.log('   本次将基于当前安装的最新版本重新打补丁，完成后会刷新备份。');
        } else {
            sourceAsar = origPath;
        }
    }
    if (!fs.existsSync(sourceAsar)) {
        console.error('❌ 找不到 app.asar（或 app.asar.orig），请确认软件已正确安装。');
        process.exit(1);
    }

    let asar;
    try {
        asar = require('asar');
    } catch {
        console.error('❌ 缺少依赖，请先在本目录运行: npm install');
        process.exit(1);
    }

    const staging = createStagingDirectory();
    const cleanupJunction = setupUnpackedJunction(resourcesDir, sourceAsar, asarPath);

    try {
        console.log(`📦 解包 ${path.basename(sourceAsar)}（${isDryRun ? '预览' : '临时目录'}）...`);
        asar.extractAll(sourceAsar, staging);

        const exeDir = path.dirname(process.execPath);
        const {
            sourceI18n,
            sourceDict,
            nativePatchesDir,
            hasExternalSrc,
        } = env.resolveSourceAssets(path.resolve(__dirname, '..'), exeDir);

        if (fs.existsSync(path.join(exeDir, 'cockpit-zh.json'))) {
            console.log('💡 检测到外置词典 (exe同级目录)，将使用外置词典。');
        }

        console.log('\n🛠 注入原生替换规则...');
        const { totalApplied } = patchAllTargets(staging, nativePatchesDir, DEFAULT_TARGETS, {
            isDryRun,
            logger: console.log,
        });

        if (isDryRun) {
            console.log(`\n🔍 预览完成：原生规则共匹配 ${totalApplied} 条，未修改任何文件。`);
            console.log('   词条覆盖以词典为准；部分未匹配属正常（版本差异）。');
            fs.rmSync(staging, { recursive: true, force: true });
            cleanupJunction();
            process.exit(0);
        }

        console.log('\n📂 部署到安装目录...');
        deployAtomically(paths, (kitNewDir) => {
            fs.mkdirSync(kitNewDir, { recursive: true });
            fs.copyFileSync(sourceI18n, path.join(kitNewDir, 'zh-i18n.js'));
            fs.copyFileSync(sourceDict, path.join(kitNewDir, 'cockpit-zh.json'));
        }, staging);
        console.log(`✅ 翻译组件与词典已部署至 ${kitDir}`);

        cleanupJunction();
        console.log('\n🎉 安装完成！请启动 Antigravity 查看效果（修改词典保存即热载，无需重启）。');

        if (isRelaunch) {
            relaunchAntigravity(resourcesDir);
        }
    } catch (err) {
        fs.rmSync(staging, { recursive: true, force: true });
        cleanupJunction();
        console.error(`\n❌ 安装失败: ${err.message}`);
        console.error('   你的 Antigravity 安装未受影响，可排查后重试。');
        process.exit(1);
    }
}

if (isRevert) {
    runRevert();
} else {
    runInstall();
}

} // if (!DETECT_ONLY)
