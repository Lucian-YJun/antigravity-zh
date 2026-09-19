#!/usr/bin/env node

/**
 * Antigravity 中文汉化补丁 - 一键安装与还原脚本
 * 纯 Node.js，使用 asar API 解包
 *
 * 安全设计（相对初版的改进）：
 * 1. 运行前检查 Antigravity 进程，运行中拒绝执行；
 * 2. 先解包打补丁到临时目录，全部成功后才替换正式文件——任何一步失败，原安装毫发无损；
 * 3. 支持 --dry-run 预览匹配情况，不改动任何文件。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const isRevert = args.includes('--revert');
const isDryRun = args.includes('--dry-run');

console.log(`🚀 Antigravity 中文汉化补丁 (Next-Gen)${isDryRun ? ' [预览模式]' : ''}${isRevert ? ' [还原]' : ''}\n`);

// ---- 环境检查 ----
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
    console.error('❌ 找不到 LOCALAPPDATA 环境变量，当前只支持 Windows。');
    process.exit(1);
}
const resourcesDir = path.join(localAppData, 'Programs', 'antigravity', 'resources');
if (!fs.existsSync(resourcesDir)) {
    console.error(`❌ 未找到 Antigravity 资源目录: ${resourcesDir}`);
    process.exit(1);
}

const asarPath = path.join(resourcesDir, 'app.asar');
const origPath = path.join(resourcesDir, 'app.asar.orig');
const appDir = path.join(resourcesDir, 'app');
const kitDir = path.join(resourcesDir, 'zh-patch');

function isAntigravityRunning() {
    try {
        const out = execSync('tasklist /FI "IMAGENAME eq Antigravity.exe"', {
            stdio: ['ignore', 'pipe', 'pipe'],
        }).toString();
        return out.toLowerCase().includes('antigravity.exe');
    } catch {
        return false;
    }
}

// ---- 还原 ----
if (isRevert) {
    if (isAntigravityRunning()) {
        console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再还原。');
        process.exit(1);
    }
    console.log('🔄 开始还原...');
    if (fs.existsSync(origPath)) {
        if (fs.existsSync(asarPath)) fs.unlinkSync(asarPath);
        fs.renameSync(origPath, asarPath);
        console.log('✅ 恢复了 app.asar');
    } else {
        console.log('⚠️ 找不到 app.asar.orig，可能已经是原版。');
    }
    for (const dir of [appDir, kitDir]) {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`✅ 删除了 ${path.basename(dir)}/`);
        }
    }
    console.log('🎉 还原完成，Antigravity 已恢复英文原版！');
    process.exit(0);
}

// ---- 安装 ----
if (isAntigravityRunning() && !isDryRun) {
    console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再打补丁。');
    console.error('   （可用 --dry-run 在不退出的情况下预览匹配情况）');
    process.exit(1);
}

// 确定解包来源：已打过补丁则从备份还原包解包（保证从干净英文状态开始）
const sourceAsar = fs.existsSync(origPath) ? origPath : asarPath;
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

// 所有改动先在系统临时目录进行，全部成功后才落盘 —— 任一步失败，正式安装不受影响
const staging = path.join(os.tmpdir(), `agy-zh-stage-${Date.now()}`);
fs.rmSync(staging, { recursive: true, force: true });

// asar 库的解包规则：伴随的 unpacked 目录名必须与 asar 文件名一致（app.asar ↔ app.asar.unpacked）。
// 重打补丁时解包来源是 app.asar.orig，需要临时建一个目录联接指向真正的 unpacked 目录。
let junctionPath = null;
const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
if (sourceAsar !== asarPath && fs.existsSync(unpackedDir)) {
    junctionPath = path.join(resourcesDir, 'app.asar.orig.unpacked');
    if (!fs.existsSync(junctionPath)) {
        fs.symlinkSync(unpackedDir, junctionPath, 'junction');
    }
}
function cleanupJunction() {
    if (junctionPath) {
        try { fs.rmdirSync(junctionPath); } catch { /* 联接可能已被清理 */ }
        junctionPath = null;
    }
}

try {
    console.log(`📦 解包 ${path.basename(sourceAsar)}（${isDryRun ? '预览' : '临时目录'}）...`);
    asar.extractAll(sourceAsar, staging);

    // 应用原生替换规则
    const exeDir = path.dirname(process.execPath);
    // 判断是否有外置的 src 目录（方便高级用户自行修改全部逻辑）
    const externalSrcDir = path.join(exeDir, 'src');
    const hasExternalSrc = fs.existsSync(externalSrcDir);
    
    const nativePatchesDir = hasExternalSrc 
        ? path.join(externalSrcDir, 'native') 
        : path.join(__dirname, '../src/native');

    const targets = {
        'utils': 'dist/utils.js',
        'menu': 'dist/menu.js',
        'main': 'dist/main.js',
        'tray': 'dist/tray.js',
        'updater': 'dist/updater.js',
        'ipchandlers': 'dist/ipcHandlers.js',
        'wizard': 'dist/ideInstall/wizardHtml.js',
    };

    console.log('\n🛠 注入原生替换规则...');
    let totalApplied = 0;
    for (const [scope, relPath] of Object.entries(targets)) {
        const targetFile = path.join(staging, relPath);
        const rulesFile = path.join(nativePatchesDir, `${scope}.replacements.json`);
        if (!fs.existsSync(targetFile) || !fs.existsSync(rulesFile)) {
            console.log(`⚠️ [${scope}] 文件缺失，跳过`);
            continue;
        }
        const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
        let content = fs.readFileSync(targetFile, 'utf8');
        let applied = 0;
        for (const [oldStr, newStr] of rules) {
            if (content.includes(oldStr)) {
                content = content.replace(oldStr, newStr);
                applied++;
            }
        }
        if (!isDryRun) fs.writeFileSync(targetFile, content, 'utf8');
        totalApplied += applied;
        console.log(`✅ [${scope}] ${applied}/${rules.length} 条规则匹配`);
    }

    if (isDryRun) {
        console.log(`\n🔍 预览完成：原生规则共匹配 ${totalApplied} 条，未修改任何文件。`);
        console.log('   词条覆盖以词典为准；部分未匹配属正常（版本差异）。');
        fs.rmSync(staging, { recursive: true, force: true });
        cleanupJunction();
        process.exit(0);
    }

    // 全部成功，现在才替换正式文件
    console.log('\n📂 部署到安装目录...');
    if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
    fs.renameSync(staging, appDir);
    if (fs.existsSync(asarPath)) {
        fs.renameSync(asarPath, origPath);
        console.log('✅ 原包已备份为 app.asar.orig');
    }

    fs.mkdirSync(kitDir, { recursive: true });
    
    // 解析注入脚本和词典的路径（支持 exe 同级目录外置）
    const sourceI18n = hasExternalSrc 
        ? path.join(externalSrcDir, 'zh-i18n.js') 
        : path.join(__dirname, '../src/zh-i18n.js');
        
    // 词典支持直接放在 exe 同级目录，或者放在 exe/src 目录下
    let sourceDict = path.join(__dirname, '../src/cockpit-zh.json');
    if (fs.existsSync(path.join(exeDir, 'cockpit-zh.json'))) {
        sourceDict = path.join(exeDir, 'cockpit-zh.json');
        console.log('💡 检测到外置词典 (exe同级目录)，将使用外置词典。');
    } else if (hasExternalSrc && fs.existsSync(path.join(externalSrcDir, 'cockpit-zh.json'))) {
        sourceDict = path.join(externalSrcDir, 'cockpit-zh.json');
    }

    fs.copyFileSync(sourceI18n, path.join(kitDir, 'zh-i18n.js'));
    fs.copyFileSync(sourceDict, path.join(kitDir, 'cockpit-zh.json'));
    console.log(`✅ 翻译组件与词典已部署至 ${kitDir}`);

    cleanupJunction();
    console.log('\n🎉 安装完成！请启动 Antigravity 查看效果（修改词典保存即热载，无需重启）。');
} catch (err) {
    // 失败兜底：清理临时目录与目录联接，正式安装保持原样
    fs.rmSync(staging, { recursive: true, force: true });
    cleanupJunction();
    console.error(`\n❌ 安装失败: ${err.message}`);
    console.error('   你的 Antigravity 安装未受影响，可排查后重试。');
    process.exit(1);
}
