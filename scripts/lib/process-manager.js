const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 解析 PowerShell 枚举结果（纯函数，供测试直接调用）。
 * 每行格式 "PID|ParentPID|MainWindowHandle|isSidecar(0/1)"，非法行一律丢弃。
 * @param {string} stdout
 * @returns {Array<{ pid: number, parentPid: number, hasWindow: boolean, isSidecar: boolean }>}
 */
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

/**
 * 用 PowerShell 枚举进程并区分 IDE / sidecar，每行输出 "pid|parentPid|mainWindowHandle|isSidecar"。
 * 返回 null 表示枚举失败，交由调用方保守处理。
 * @returns {Array<{ pid: number, parentPid: number, hasWindow: boolean, isSidecar: boolean }> | null}
 */
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

/**
 * 判定 Antigravity IDE 是否正在运行（忽略后台孤儿 sidecar）。
 * @returns {boolean}
 */
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

/**
 * 沿 ParentProcessId 向上取当前脚本的祖先进程链（含自身），最多 64 层。
 * @returns {number[]}
 */
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

/**
 * 清理残留的孤儿 sidecar 进程。
 * 严禁使用 /T 选项，避免误杀当前终端或祖先进程。
 * @returns {number} 结束的进程数
 */
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

/**
 * 找出「正在承载当前脚本」的 Antigravity IDE 进程 PID。
 * 判定：该进程不是 sidecar（即真正的 IDE），且出现在当前脚本的祖先进程链里。
 * @returns {number[] | null} PID 列表；返回 null 表示无法判定（枚举或祖先链取不到），
 *   调用方必须按 fail-safe 处理，不得贸然关闭。
 */
function findHostingIdePids() {
  const procs = listAntigravityProcesses();
  // 枚举失败就无法证明「待关闭的 IDE 不是我们的宿主」。按本仓库既定的 fail-safe
  // 原则（宁可拒绝执行也不误杀 IDE），返回 null 让调用方拒绝自动关闭。
  if (procs === null) return null;
  const ancestors = new Set(getAncestorPids());
  // getAncestorPids 成功时至少包含自身 PID，为空即代表取链失败。
  if (ancestors.size === 0) return null;
  return procs.filter(p => !p.isSidecar && ancestors.has(p.pid)).map(p => p.pid);
}

/**
 * 纯 JS 睡眠（不依赖外部系统命令）。
 * @param {number} ms
 */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 向应用发送关闭请求并等待其自行退出；超时则放弃。
 *
 * 若待关闭的 IDE 正是当前脚本的祖先进程（即脚本运行在 IDE 内置终端里），
 * 则拒绝执行：关掉它会连带杀掉当前控制台，安装会在中途断掉。
 * killResidualSidecars 已有同样的保护，这里补齐 --close 路径。
 * @param {number} [timeoutSec=12]
 * @returns {boolean}
 */
function gracefulCloseAntigravity(timeoutSec = 12) {
  const hosting = findHostingIdePids();
  if (hosting === null) {
    console.error('⚠️ 无法确认待关闭的 Antigravity 是否正是承载本脚本的宿主进程。');
    console.error('   为避免关掉当前终端导致安装中途中断，已拒绝自动关闭。');
    console.error('   请手动完全退出 Antigravity（含系统托盘图标）后重试。');
    return false;
  }
  if (hosting.length > 0) {
    console.error(`❌ Antigravity (PID ${hosting.join(', ')}) 是当前脚本的祖先进程：`);
    console.error('   本脚本正运行在它内部的终端里，关闭它会连带杀掉当前控制台，');
    console.error('   使安装中途中断。请在 Antigravity 之外的 cmd / PowerShell 窗口中重试。');
    return false;
  }
  console.log('🔄 检测到 Antigravity 正在运行，尝试优雅关闭（不强制结束进程）...');
  try {
    execSync('taskkill /IM Antigravity.exe', { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* 进程可能在命令执行间隙已退出，taskkill 返回非零属正常 */ }
  for (let i = 0; i < timeoutSec; i++) {
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

/**
 * 重新启动 Antigravity 应用程序。
 * @param {string} resourcesDir
 * @returns {boolean}
 */
function relaunchAntigravity(resourcesDir) {
  const exePath = path.join(path.dirname(resourcesDir), 'Antigravity.exe');
  if (fs.existsSync(exePath)) {
    console.log('🚀 正在重新启动 Antigravity...');
    const child = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } else {
    console.log(`⚠️ 未找到 ${exePath}，请手动启动。`);
    return false;
  }
}

module.exports = {
  parseProcessList,
  listAntigravityProcesses,
  isAntigravityRunning,
  getAncestorPids,
  findHostingIdePids,
  killResidualSidecars,
  sleep,
  gracefulCloseAntigravity,
  relaunchAntigravity,
};
