#!/usr/bin/env node

/**
 * Antigravity 中文汉化补丁 - 一键安装与还原脚本
 * 纯净版、跨平台、无硬编码依赖
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("🚀 开始执行 Antigravity 中文汉化补丁 (Next-Gen)...\n");

const args = process.argv.slice(2);
const isRevert = args.includes('--revert');

// 1. 定位 Antigravity resources 目录
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
    console.error("❌ 找不到 LOCALAPPDATA 环境变量，当前只支持 Windows。");
    process.exit(1);
}
const resourcesDir = path.join(localAppData, 'Programs', 'antigravity', 'resources');
if (!fs.existsSync(resourcesDir)) {
    console.error(`❌ 未找到 Antigravity 安装目录: ${resourcesDir}`);
    process.exit(1);
}
console.log(`📂 已定位资源目录: ${resourcesDir}`);

const asarPath = path.join(resourcesDir, 'app.asar');
const origPath = path.join(resourcesDir, 'app.asar.orig');
const appDir = path.join(resourcesDir, 'app');
const kitDir = path.join(resourcesDir, 'zh-patch');

// ---- 还原逻辑 ----
if (isRevert) {
    console.log("🔄 开始执行还原操作...");
    if (fs.existsSync(origPath)) {
        if (fs.existsSync(asarPath)) fs.unlinkSync(asarPath);
        fs.renameSync(origPath, asarPath);
        console.log("✅ 恢复了 app.asar");
    } else {
        console.log("⚠️ 找不到 app.asar.orig，可能已经是原版。");
    }
    if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
        console.log("✅ 删除了 app/ 解包目录");
    }
    if (fs.existsSync(kitDir)) {
        fs.rmSync(kitDir, { recursive: true, force: true });
        console.log("✅ 删除了 zh-patch/ 组件目录");
    }
    console.log("🎉 还原完成，Antigravity 已恢复全英文原版！");
    process.exit(0);
}

// ---- 安装逻辑 ----

// 2. 解包 app.asar
if (!fs.existsSync(origPath)) {
    if (!fs.existsSync(asarPath)) {
        console.error("❌ 找不到 app.asar 也找不到 app.asar.orig，请确认软件是否已正确安装。");
        process.exit(1);
    }
    console.log("📦 备份 app.asar 为 app.asar.orig...");
    fs.renameSync(asarPath, origPath);
}

if (fs.existsSync(appDir)) {
    console.log("🧹 清理旧的 app/ 目录...");
    fs.rmSync(appDir, { recursive: true, force: true });
}

console.log("📦 正在使用 asar 解包，请稍候...");
try {
    execSync(`npx asar extract "${origPath}" "${appDir}"`, { stdio: 'pipe' });
    console.log("✅ 解包成功！");
} catch (e) {
    console.error("❌ 解包失败，请检查是否已正确安装依赖。");
    process.exit(1);
}

// 3. 应用原生菜单等替换补丁
const nativePatchesDir = path.join(__dirname, '../src/native');
const targets = {
    'utils': 'dist/utils.js',
    'menu': 'dist/menu.js',
    'main': 'dist/main.js',
    'tray': 'dist/tray.js',
    'updater': 'dist/updater.js',
    'ipchandlers': 'dist/ipcHandlers.js',
    'wizard': 'dist/ideInstall/wizardHtml.js'
};

console.log("\n🛠 开始注入原生替换规则...");
for (const [scope, relPath] of Object.entries(targets)) {
    const targetFile = path.join(appDir, relPath);
    const rulesFile = path.join(nativePatchesDir, `${scope}.replacements.json`);
    
    if (!fs.existsSync(targetFile) || !fs.existsSync(rulesFile)) continue;
    
    const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    let content = fs.readFileSync(targetFile, 'utf8');
    let applied = 0;
    
    for (const [oldStr, newStr] of rules) {
        if (content.includes(oldStr)) {
            // 简单的文本替换
            content = content.replace(oldStr, newStr);
            applied++;
        }
    }
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`✅ [${scope}] 成功打入 ${applied}/${rules.length} 条补丁规则`);
}

// 4. 安装网页 UI 注入组件
console.log("\n🔥 安装同帧无闪烁渲染组件与中文词典...");
if (!fs.existsSync(kitDir)) {
    fs.mkdirSync(kitDir, { recursive: true });
}
fs.copyFileSync(path.join(__dirname, '../src/zh-i18n.js'), path.join(kitDir, 'zh-i18n.js'));
fs.copyFileSync(path.join(__dirname, '../src/cockpit-zh.json'), path.join(kitDir, 'cockpit-zh.json'));
console.log(`✅ 组件已部署至 ${kitDir}`);

console.log("\n🎉 安装完成！请重启 Antigravity 客户端以生效（修改词典无需重启，保存即热载）。");
