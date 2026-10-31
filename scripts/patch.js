#!/usr/bin/env node

/**
 * Antigravity 中文汉化补丁 - 一键安装与还原脚本
 * 纯 Node.js，使用 asar API 解包
 *
 * 安全设计（相对初版的改进）：
 * 1. 运行前检查 Antigravity 进程，运行中拒绝执行；
 * 2. 先解包打补丁到临时目录，再用「app.new → app → app.old」两阶段切换，全部成功才清理旧物；
 *    任一步失败按逆序回滚——任何一步失败，原安装都保持可用；
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
const crypto = require('crypto');
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
// 只支持 Windows 默认的 LOCALAPPDATA 安装位置；拿不到资源目录就没法继续，
// 且后续所有路径都建立在 resourcesDir 之上，所以先检查再解析。
function checkEnvironment() {
    const localAppData = process.env.LOCALAPPDATA;
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

const resourcesDir = checkEnvironment();
const asarPath = path.join(resourcesDir, 'app.asar');
const origPath = path.join(resourcesDir, 'app.asar.orig');
const appDir = path.join(resourcesDir, 'app');
const kitDir = path.join(resourcesDir, 'zh-patch');
const backupMetaPath = path.join(resourcesDir, 'app.asar.orig.meta.json');

// 两阶段部署用到的中间名（都在同一目录，rename 才能保持原子）
const appNewDir = path.join(resourcesDir, 'app.new');
const appOldDir = path.join(resourcesDir, 'app.old');
const kitNewDir = path.join(resourcesDir, 'zh-patch.new');
const kitOldDir = path.join(resourcesDir, 'zh-patch.old');
const backupTmpPath = path.join(resourcesDir, 'app.asar.orig.tmp');
const backupOldPath = path.join(resourcesDir, 'app.asar.orig.old');

// ---- 备份溯源 ----
// app.asar.orig 保存的是「干净英文原版代码」，但客户端自动更新会在它旁边写入新的
// app.asar，而重命名覆盖不会刷新旧的 .orig。不核对来源就一律从 .orig 解包，等于把
// 旧版本代码铺回去、静默回退客户端更新。这里用 meta 记录源包的 size/mtime/sha256，
// 每次运行先验证 .orig 与当前 app.asar 是否同源：同源才从 .orig 解包（保证从干净
// 英文态重建），不同源即视为过期，改用当前 app.asar，并在成功后刷新备份与 meta。
function sha256File(file) {
    const hash = crypto.createHash('sha256');
    const buf = Buffer.allocUnsafe(1 << 20);
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        let n;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
    return hash.digest('hex');
}

// mtime 不足以判定版本（复制、触摸、解压都会改它），版本身份以 size + sha256 为准。
// meta 里额外记一份源 asar 改名后的 stat 足迹：重打补丁时 app.asar 已被改名成 .orig，
// size + mtime 都没变，命中足迹就能省掉对整个原包重新算 sha256 的开销。
//
// 同一次运行内同一个文件也只算一次：原包动辄上百 MB，判定来源和记录备份各算一遍纯属浪费。
// 复用前重新确认 size + mtime，文件被换掉就不会拿旧哈希顶替。
const fpCache = new Map();
function fingerprint(file) {
    const st = fs.statSync(file);
    const stat = { size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
    const cached = fpCache.get(file);
    if (cached && statMatches(cached, stat)) return cached;
    const fp = { ...stat, sha256: sha256File(file) };
    fpCache.set(file, fp);
    return fp;
}

function fingerprintOrNull(file) {
    try { return fs.existsSync(file) ? fingerprint(file) : null; } catch { return null; }
}

function statMatches(a, b) {
    return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

// 只有 size + mtime 都相同才复用已知 sha，避免拿旧哈希给改过的文件背书
function fingerprintTrusting(file, known) {
    const st = fs.statSync(file);
    const fp = { size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
    return statMatches(fp, known) && known.sha256 ? { ...fp, sha256: known.sha256 } : fingerprint(file);
}

function fingerprintTrustingOrNull(file, known) {
    try { return fs.existsSync(file) ? fingerprintTrusting(file, known) : null; } catch { return null; }
}

function sameFingerprint(a, b) {
    return !!a && !!b && a.size === b.size && a.sha256 === b.sha256;
}

// 记录备份溯源。sourceFp 应描述「这份备份对应的原包」：原包还在 app.asar 名下时是它的
// 指纹，重打补丁时是 .orig 的指纹（upfront 算好，避免这里再扫一遍整包）。
function writeBackupMeta(sourceFp) {
    if (!fs.existsSync(origPath)) return;
    const source = sourceFp || fingerprintOrNull(origPath);
    if (!source) return;
    writeJsonFile(backupMetaPath, { source, recordedAt: new Date().toISOString() });
}

// 备份是否与给定 asar 同源（缺少 meta 或指纹不符都算过期）
function isBackupStaleFor(asarFile) {
    const meta = readJsonFile(backupMetaPath);
    const current = fingerprintOrNull(asarFile);
    return !(meta && current && sameFingerprint(meta.source, current));
}

function readJsonFile(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJsonFile(file, data) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
}

// 上次部署在两步之间被打断（断电 / 强杀）时，把还在临时名下的东西挪回原位。
// 不先归位就直接清残骸，会把唯一可用的 app/ 或原版包删掉。
function recoverInterruptedDeploy() {
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
    for (const dir of [appNewDir, kitNewDir]) fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(appDir)) fs.rmSync(appOldDir, { recursive: true, force: true });
    if (fs.existsSync(kitDir)) fs.rmSync(kitOldDir, { recursive: true, force: true });
    if (fs.existsSync(origPath)) {
        fs.rmSync(backupTmpPath, { force: true });
        fs.rmSync(backupOldPath, { force: true });
    }
    // 备份与当前包不同源时，meta 一并作废，避免下次误信过期溯源
    if (!fs.existsSync(origPath)) fs.rmSync(backupMetaPath, { force: true });
    fs.rmSync(`${backupMetaPath}.tmp`, { force: true });
}

// 测试专用故障注入：命中 "from>to" 的 rename 直接抛错，用来验证部署回滚。
// 只在显式设置环境变量时生效，正常安装不会走到。
function deployRename(from, to) {
    const probe = process.env.AGY_ZH_TEST_FAIL_RENAME;
    if (probe && `${path.basename(from)}>${path.basename(to)}` === probe) {
        const err = new Error(`注入的部署失败（测试用）: ${path.basename(from)} → ${path.basename(to)}`);
        err.code = 'EIO';
        throw err;
    }
    fs.renameSync(from, to);
}

// 临时目录与安装目录可能不在同一个卷上，此时 rename 会抛 EXDEV：
// 先完整复制到目标名（目标名本身是中间名），再删掉临时目录，仍保持原子切换。
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

// 两阶段部署：新内容先落在中间名，切换完成之前正式目录一直可用，最后才清理旧物。
// 任一步失败按逆序回滚——安装目录始终停在一个能启动的完整状态上。
function deployAtomically(prepareKit, stagingDir) {
    const hadAsar = fs.existsSync(asarPath);
    const hadOrig = fs.existsSync(origPath);
    const hadAppDir = fs.existsSync(appDir);
    const hadKitDir = fs.existsSync(kitDir);
    // 未刷新备份时（app.asar 已被改名成 .orig）要沿用旧 meta 的 stat 足迹
    const previousMeta = readJsonFile(backupMetaPath);
    // 溯源必须在原包被改名之前算，否则拿到的是备份包的指纹。
    // 源包就是 .orig 时账已经记在 meta 上，stat 足迹吻合即可沿用，不必整包重算。
    const originalFp = hadAsar
        ? fingerprintOrNull(asarPath)
        : fingerprintTrustingOrNull(origPath, previousMeta && previousMeta.source);
    let backupMoved = false;      // app.asar → 临时名 已完成
    let backupArchived = false;   // 旧 .orig → .old 已完成
    let backupCommitted = false;  // 临时名 → .orig 已完成

    try {
        // 1. 新代码落到 app.new（正式目录尚未触碰）
        fs.rmSync(appNewDir, { recursive: true, force: true });
        moveIntoPlace(stagingDir, appNewDir);

        // 2. 新的翻译组件也在中间名准备好
        prepareKit();

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
        writeBackupMeta(originalFp);
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
                // 全新安装时本没有 zh-patch/，回滚后也不该留下半套组件
                fs.rmSync(kitDir, { recursive: true, force: true });
            }
            if (fs.existsSync(kitNewDir)) fs.rmSync(kitNewDir, { recursive: true, force: true });
        });
        safe('app', () => {
            // 旧的 app.old 必须归位；全新安装时本没有 app/，本次产物要整个撤掉
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

    // 全部成功后才删旧物。逐个清理：某个被占用不该连累其它，残留的都留给下次运行
    for (const leftover of [appOldDir, kitOldDir, backupOldPath]) {
        try {
            fs.rmSync(leftover, { recursive: true, force: true });
        } catch (e) {
            console.warn(`⚠️ ${path.basename(leftover)} 暂未清理（下次运行会自动清理）: ${e.message}`);
        }
    }
    if (hadAsar) console.log('✅ 原包已备份为 app.asar.orig');
}

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
// 还原分支：确认 IDE 已退出 → 清理残留 sidecar → 归位中断部署 → 恢复原包并删除补丁产物。
function runRevert() {
    if (isAntigravityRunning()) {
        console.error('❌ 检测到 Antigravity 正在运行，请先完全退出（含系统托盘图标）再还原。');
        process.exit(1);
    }
    console.log('🔄 开始还原...');
    // IDE 已退出，但 sidecar 可能作为孤儿残留并占用安装目录里的文件句柄；
    // 这里复用与安装分支相同的加固清理逻辑。一个都没有时不会产生额外开销。
    killResidualSidecars();
    // 上次部署若中断，先把备份/目录归位，否则还原会漏掉唯一可用的原版包
    try {
        recoverInterruptedDeploy();
    } catch (err) {
        console.error(`⚠️ 清理上次中断的部署失败: ${err.message}`);
    }
    try {
        // 备份过期意味着客户端更新后还没重打补丁：当前 app.asar 本身就是新版本的干净原版，
        // 用旧 .orig 覆盖它等于把客户端更新降级，所以只清理补丁产物、保留 app.asar。
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
        // IDE 已退出，但 sidecar 可能作为孤儿残留；它不持有界面状态，清掉以免占用安装目录
        killResidualSidecars();
    }

    // 上一次部署若中途被打断（断电 / 强杀），先归位再干活；--dry-run 承诺不改文件，跳过。
    if (!isDryRun) recoverInterruptedDeploy();

    // 确定解包来源：备份仍对应当前 app.asar 时从备份解包（保证从干净英文状态开始）；
    // 客户端已更新时旧备份是过期代码，必须改用当前 app.asar，否则会把版本回退。
    let sourceAsar = asarPath;
    if (fs.existsSync(origPath)) {
        if (!fs.existsSync(asarPath)) {
            // 打补丁后的常态：app.asar 已改名成 .orig，它就是当前已装版本的原版
            sourceAsar = origPath;
        } else if (isBackupStaleFor(asarPath)) {
            // 用户视角：说清为什么不用旧备份、有没有风险、要不要额外操作
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
        deployAtomically(() => {
            fs.mkdirSync(kitNewDir, { recursive: true });

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

            fs.copyFileSync(sourceI18n, path.join(kitNewDir, 'zh-i18n.js'));
            fs.copyFileSync(sourceDict, path.join(kitNewDir, 'cockpit-zh.json'));
        }, staging);
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
}

if (isRevert) {
    runRevert();
} else {
    runInstall();
}

} // if (!DETECT_ONLY)
