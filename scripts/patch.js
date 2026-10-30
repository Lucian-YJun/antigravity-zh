#!/usr/bin/env node

/**
 * Antigravity 中文汉化补丁 - 一键安装与还原脚本
 * 纯 Node.js，使用 asar API 解包
 *
 * 安全设计（相对初版的改进）：
 * 1. 运行前检查 Antigravity 进程，运行中拒绝执行；
 * 2. 先解包打补丁到临时目录，全部成功后才替换正式文件——任何一步失败，原安装毫发无损；
 * 3. 支持 --dry-run 预览匹配情况，不改动任何文件；
 * 4. --close：运行中时可先尝试"优雅关闭"（发关闭请求，绝不强制结束），关闭成功才继续；
 * 5. --relaunch：补丁完成后自动重新启动应用（配合 --close 即 npm run repatch 全自动恢复）；
 * 6. 进程检测区分 IDE 主进程与后台 sidecar（两者进程名都是 Antigravity.exe），
 *    IDE 已退出但 sidecar 残留时不再误报"正在运行"，并自动清理残留 sidecar；
 * 7. sidecar 判定必须同时满足「无主窗口 + 命令行不含 --type= + 命令行命中运行时特征」，
 *    非 sidecar 一律视为 IDE（fail-safe 方向：宁可拒绝执行，也不误杀 IDE 丢数据）；
 *    清理时只单杀 sidecar 本体，并跳过当前脚本的祖先进程链。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 解析 PowerShell 枚举结果（纯函数，供测试直接调用）。
// 每行格式 "PID|ParentPID|MainWindowHandle|isSidecar(0/1)"，非法行一律丢弃。
function parseProcessList(stdout) {
    if (typeof stdout !== 'string' || stdout === '') return [];
    return stdout.split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|');
            if (parts.length !== 4) return null;
            const pid = parseInt(parts[0].trim(), 10);
            const parentPid = parseInt(parts[1].trim(), 10);
            const win = parseInt(parts[2].trim(), 10);
            const side = parts[3].trim();
            if (!Number.isFinite(pid) || !Number.isFinite(parentPid) || !Number.isFinite(win)) return null;
            if (side !== '0' && side !== '1') return null;
            return { pid, parentPid, hasWindow: win !== 0, isSidecar: side === '1' };
        })
        .filter(Boolean);
}

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

// Antigravity 的 agent sidecar 与 IDE 主进程同名（都由 Antigravity.exe 承载）。
// sidecar 由 agent 运行时以 ELECTRON_RUN_AS_NODE 启动，命令行里带 register_loader.js /
// sidecar_sdk / --import=；IDE 退出时它会被孤儿化并继续驻留，因此不能只按进程名判断。
//
// 判定 sidecar 必须同时满足三个条件（与关系，缺一不可）：
//   a) 没有主窗口（MainWindowHandle 为 0）；
//   b) 命令行不含 --type=（排除 Electron 的 renderer / gpu / utility 子进程）；
//   c) 命令行以不区分大小写的方式匹配 register_loader.js|sidecar_sdk|--import=。
// 只靠命令行字符串判定是不安全的：用户打开的文件夹路径或 --file-uri 参数里完全可能
// 出现 sidecar_sdk / register_loader.js，那样会把真正的 IDE 主进程误判成 sidecar 强杀，
// 丢失未保存的编辑内容。三个条件都满足才成立，任何一条不满足都按 IDE 处理。
// 「非 sidecar 一律视为 IDE」是故意的 fail-safe 方向：宁可误判为正在运行、拒绝打补丁，
// 也不可误杀 IDE。

// 用 PowerShell 枚举进程并区分 IDE / sidecar，每行输出 "pid|parentPid|mainWindowHandle|isSidecar"。
// 返回 null 表示枚举失败，交由调用方保守处理。
function listAntigravityProcesses() {
    const ps = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; " +
        "Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" | ForEach-Object { " +
        "$c=$_.CommandLine; " +
        // 取不到主窗口句柄时按有窗口处理（保守，避免把 IDE 误判成 sidecar）
        "$win=1; " +
        "try { $gp=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($gp) { $win=[int]$gp.MainWindowHandle } } catch { $win=1 }; " +
        "$side=0; " +
        "if ($c -and $win -eq 0 -and ($c -notmatch '--type=') -and ($c -match 'register_loader\\.js|sidecar_sdk|--import=')) { $side=1 }; " +
        "Write-Output ($_.ProcessId.ToString() + '|' + $_.ParentProcessId.ToString() + '|' + $win.ToString() + '|' + $side.ToString()) }";
    try {
        // -EncodedCommand 避免 cmd.exe 的引号转义问题
        const encoded = Buffer.from(ps, 'utf16le').toString('base64');
        const out = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
            windowsHide: true,
        });
        return parseProcessList(out);
    } catch {
        return null;
    }
}

// IDE 是否在运行（忽略后台残留的 sidecar）
function isAntigravityRunning() {
    const procs = listAntigravityProcesses();
    if (procs === null) {
        // 兜底：无法枚举时退回进程名判断
        try {
            const out = execSync('tasklist /FI "IMAGENAME eq Antigravity.exe"', {
                stdio: ['ignore', 'pipe', 'pipe'],
            }).toString();
            return /antigravity\.exe/i.test(out);
        } catch {
            // 连 tasklist 都失败时不能把「判断不了」当成「没运行」：
            // 保守视为正在运行，避免在 IDE 开着时照常打补丁。
            console.error('⚠️ 无法确认 Antigravity 进程状态，请手动确认后重试。');
            return true;
        }
    }
    return procs.some(p => !p.isSidecar);
}

// 沿 ParentProcessId 向上取当前脚本的祖先进程链（含自身），最多 64 层。
// 只有在确实有 sidecar 要清理时才调用，避免无谓的 PowerShell 开销。
function getAncestorPids() {
    const ps = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; " +
        "$cur=" + process.pid + "; $n=0; $map=@{}; " +
        "Get-CimInstance Win32_Process | ForEach-Object { $map[[int]$_.ProcessId]=[int]$_.ParentProcessId }; " +
        "while ($cur -gt 0 -and $n -lt 64) { Write-Output $cur; " +
        "$next=$map[$cur]; if ($null -eq $next -or $next -eq $cur) { break }; $cur=$next; $n++ }";
    try {
        const encoded = Buffer.from(ps, 'utf16le').toString('base64');
        const out = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
            windowsHide: true,
        });
        return out.split(/\r?\n/).map(l => parseInt(l.trim(), 10)).filter(n => Number.isFinite(n));
    } catch {
        console.error('⚠️ 无法获取当前脚本的祖先进程链。');
        return [];
    }
}

// 清理残留的 sidecar：它们无窗口、不持有未保存工作，IDE 已退出后属于纯残留。
// 只单杀 sidecar 本体（不带 /T），否则会连带杀掉目标的所有子孙进程——如果本脚本
// 就运行在 sidecar 派生的 shell 里，/T 会把脚本自己和用户其他 agent 任务一起杀掉。
function killResidualSidecars() {
    const procs = listAntigravityProcesses();
    if (procs === null) return 0;
    const sidecars = procs.filter(p => p.isSidecar);
    if (sidecars.length === 0) return 0;

    const protectedPids = new Set(getAncestorPids());
    let killed = 0;
    for (const p of sidecars) {
        if (protectedPids.has(p.pid)) {
            console.log(`⚠️ 跳过 sidecar 进程 (PID ${p.pid})：它是当前脚本的祖先进程。`);
            console.log('   请在 Antigravity 之外的 cmd / PowerShell 窗口中运行本脚本。');
            continue;
        }
        try {
            execSync(`taskkill /PID ${p.pid} /F`, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
            console.log(`🧹 已结束残留的 Antigravity sidecar 进程 (PID ${p.pid})`);
            killed++;
        } catch { /* 进程可能已自行退出 */ }
    }
    return killed;
}

// 纯 JS 睡眠（不依赖外部命令）
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 向应用发送关闭请求并等待其自行退出；12 秒内未退出则放弃（不强制结束，保护未保存的工作）
function gracefulCloseAntigravity() {
    console.log('🔄 检测到 Antigravity 正在运行，尝试优雅关闭（不强制结束进程）...');
    try {
        execSync('taskkill /IM Antigravity.exe', { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* 进程可能在命令执行间隙已退出，taskkill 返回非零属正常 */ }
    for (let i = 0; i < 12; i++) {
        sleep(1000);
        if (!isAntigravityRunning()) {
            console.log('✅ 应用已关闭');
            killResidualSidecars();
            return true;
        }
    }
    console.error('❌ 应用未响应关闭请求（可能最小化到了系统托盘）。');
    console.error('   请手动右键托盘图标退出后重试；脚本不会强制结束进程，以保护未保存的工作。');
    return false;
}

// ---- 还原 ----
if (isRevert) {
    if (isAntigravityRunning()) {
        console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再还原。');
        process.exit(1);
    }
    console.log('🔄 开始还原...');
    // IDE 已退出，但 sidecar 可能作为孤儿残留并占用安装目录里的文件句柄；
    // 这里复用与安装分支相同的加固清理逻辑。一个都没有时不会产生额外开销。
    killResidualSidecars();
    try {
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
    } catch (err) {
        // 典型原因是残留进程仍占用安装目录（Windows 上表现为 EPERM / EBUSY）
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
    // IDE 已退出，但 sidecar 可能作为孤儿残留；它不持有界面状态，清掉以免占用安装目录
    killResidualSidecars();
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

    if (isRelaunch) {
        const exePath = path.join(path.dirname(resourcesDir), 'Antigravity.exe');
        if (fs.existsSync(exePath)) {
            console.log('🚀 正在重新启动 Antigravity...');
            const { spawn } = require('child_process');
            const child = spawn(exePath, [], {
                cwd: path.dirname(exePath),
                detached: true,
                stdio: 'ignore',
            });
            child.unref();
        } else {
            console.log(`⚠️ 未找到 ${exePath}，请手动启动。`);
        }
    }
} catch (err) {
    // 失败兜底：清理临时目录与目录联接，正式安装保持原样
    fs.rmSync(staging, { recursive: true, force: true });
    cleanupJunction();
    console.error(`\n❌ 安装失败: ${err.message}`);
    console.error('   你的 Antigravity 安装未受影响，可排查后重试。');
    process.exit(1);
}

} // if (!DETECT_ONLY)
