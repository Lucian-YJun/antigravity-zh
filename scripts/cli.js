#!/usr/bin/env node

const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function runScript(scriptName, args = []) {
    return new Promise((resolve) => {
        // 在 pkg 打包后，__dirname 会指向 /snapshot/项目名/scripts
        const scriptPath = path.join(__dirname, scriptName);
        
        const child = spawn(process.execPath, [scriptPath, ...args], {
            stdio: 'inherit',
            env: {
                ...process.env,
                PKG_EXECPATH: 'true' // 标记当前由 pkg 运行，如果需要的话
            }
        });

        child.on('close', (code) => {
            console.log('\n---');
            resolve(code);
        });
    });
}

async function showMenu() {
    console.clear();
    console.log('================================================');
    console.log('       🚀 Antigravity 中文汉化补丁 (Next-Gen)');
    console.log('================================================');
    console.log('  1. ⚡ 一键安装/更新汉化补丁 (需要先退出软件)');
    console.log('  2. 🔄 热更新词典 (修改 cockpit-zh.json 后刷新生效)');
    console.log('  3. 🗑️  一键还原英文原版 (需要先退出软件)');
    console.log('  0. 退出');
    console.log('================================================');

    rl.question('请输入选项编号 (0-3) 并回车: ', async (answer) => {
        const choice = answer.trim();
        switch (choice) {
            case '1':
                await runScript('patch.js');
                break;
            case '2':
                await runScript('sync-dict.js');
                break;
            case '3':
                await runScript('patch.js', ['--revert']);
                break;
            case '0':
                console.log('再见！');
                process.exit(0);
                break;
            default:
                console.log('❌ 无效的选项，请重新输入。');
                setTimeout(() => showMenu(), 1500);
                return; // 阻止直接结束
        }
        
        rl.question('按回车键返回主菜单...', () => {
            showMenu();
        });
    });
}

// 如果带了参数（可能被用作命令行工具调用），直接透传给 patch.js
if (process.argv.length > 2) {
    const args = process.argv.slice(2);
    if (args.includes('--sync')) {
        runScript('sync-dict.js').then(code => process.exit(code));
    } else {
        runScript('patch.js', args).then(code => process.exit(code));
    }
} else {
    // 否则显示交互式菜单
    showMenu();
}
