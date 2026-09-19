#!/usr/bin/env node

/**
 * 词典快速同步：把 src/cockpit-zh.json 复制到已安装目录。
 * 利用翻译组件的热载机制，约 1-2 秒后自动生效，无需重打补丁或重启。
 * （仅适合词典改动；引擎/组件改动请用 npm run patch，且需先退出应用。）
 */

const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
    console.error('❌ 找不到 LOCALAPPDATA 环境变量。');
    process.exit(1);
}
const kitDir = path.join(localAppData, 'Programs', 'antigravity', 'resources', 'zh-patch');
if (!fs.existsSync(kitDir)) {
    console.error('❌ 未找到已安装的 zh-patch 组件，请先运行: npm run patch');
    process.exit(1);
}

const exeDir = path.dirname(process.execPath);
let sourceDict = path.join(__dirname, '../src/cockpit-zh.json');

if (fs.existsSync(path.join(exeDir, 'cockpit-zh.json'))) {
    sourceDict = path.join(exeDir, 'cockpit-zh.json');
    console.log('💡 检测到外置词典 (exe同级目录)，将使用外置词典同步。');
} else if (fs.existsSync(path.join(exeDir, 'src', 'cockpit-zh.json'))) {
    sourceDict = path.join(exeDir, 'src', 'cockpit-zh.json');
}

fs.copyFileSync(
    sourceDict,
    path.join(kitDir, 'cockpit-zh.json')
);
console.log('✅ 词典已同步，约 1-2 秒后自动生效。');
