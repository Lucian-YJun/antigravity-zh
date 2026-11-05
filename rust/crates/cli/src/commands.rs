use std::path::{Path, PathBuf};
use clap::{Parser, Subcommand};
use colored::*;

use antigravity_asar::{extract_all, pack_dir, AsarReader, PackOptions};
use antigravity_installer::{
    env, BackupManager, CdpClient, Deployer, ProcessManager,
};
use antigravity_replacer::{BatchReplacer, ReplacementSummary, SkipReason, StringReplacer};

use crate::error::CliError;

#[derive(Parser, Debug)]
#[command(
    name = "antigravity-tool",
    about = "Antigravity Native Rust Localization Toolchain",
    // 裸 version 让 clap 取 CARGO_PKG_VERSION（即 workspace.package.version）。
    // 此前这里写死了 "1.3.1"，于是发到 1.4.0 时 --version 仍报 1.3.1。
    version
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Installs Chinese localization patch into Antigravity installation
    Install {
        /// Preview replacements and actions without modifying disk
        #[arg(long)]
        dry_run: bool,

        /// Automatically request graceful close of running IDE instances
        #[arg(long)]
        close: bool,

        /// Automatically relaunch Antigravity IDE after successful installation
        #[arg(long)]
        relaunch: bool,

        /// Override path to Antigravity resources directory
        #[arg(long)]
        resources_dir: Option<PathBuf>,

        /// Override path to localization source assets directory or project root
        #[arg(long, visible_alias = "assets-dir")]
        project_root: Option<PathBuf>,
    },

    /// Reverts patched installation back to original unmodified state
    Revert {
        /// Override path to Antigravity resources directory
        #[arg(long)]
        resources_dir: Option<PathBuf>,
    },

    /// Pushes updated dictionary into running Antigravity instances via CDP
    Sync {
        /// DevTools active port override
        #[arg(long)]
        port: Option<u16>,

        /// Path to dictionary JSON file
        #[arg(long)]
        dict: Option<PathBuf>,

        /// Override path to localization source assets directory or project root
        #[arg(long, visible_alias = "assets-dir")]
        project_root: Option<PathBuf>,
    },

    /// Electron ASAR archive operations
    Asar {
        #[command(subcommand)]
        sub: AsarCommands,
    },

    /// Win32 process inspection and sidecar management
    Process {
        #[command(subcommand)]
        sub: ProcessCommands,
    },

    /// High-performance multi-pattern string replacer
    Replacer {
        #[command(subcommand)]
        sub: ReplacerCommands,
    },

    /// Inspects installation health, backup status, and environment paths
    Check {
        /// Override path to Antigravity resources directory
        #[arg(long)]
        resources_dir: Option<PathBuf>,
    },
}

#[derive(Subcommand, Debug)]
pub enum AsarCommands {
    /// Extracts an ASAR archive to a destination directory
    Extract {
        /// Path to input .asar archive file
        input: PathBuf,
        /// Destination directory for extracted contents
        output: PathBuf,
    },
    /// Packs a directory into an ASAR archive
    Pack {
        /// Source directory to pack
        input: PathBuf,
        /// Path to output .asar archive file
        output: PathBuf,
        /// Globs of files to leave unpacked
        #[arg(long)]
        unpack: Vec<String>,
    },
    /// Lists all entries contained within an ASAR archive
    List {
        /// Path to .asar archive file
        input: PathBuf,
    },
}

#[derive(Subcommand, Debug)]
pub enum ProcessCommands {
    /// Lists all active Antigravity processes
    List,
    /// Kills residual headless sidecar processes
    KillSidecars,
    /// Requests graceful close of running IDE instances
    Close {
        /// Timeout in seconds before giving up
        #[arg(long, default_value = "12")]
        timeout: u64,
    },
}

#[derive(Subcommand, Debug)]
pub enum ReplacerCommands {
    /// Applies rules from a single JSON file to a target file
    Apply {
        /// Path to replacements JSON file
        #[arg(long)]
        rules: PathBuf,
        /// Path to target file
        #[arg(long)]
        target: PathBuf,
        /// Preview without writing changes
        #[arg(long)]
        dry_run: bool,
    },
    /// Executes batch replacement across an entire staging directory
    Batch {
        /// Directory containing *.replacements.json rule files
        #[arg(long)]
        rules_dir: PathBuf,
        /// Target staging directory containing unpacked app
        #[arg(long)]
        staging_dir: PathBuf,
        /// Preview without writing changes
        #[arg(long)]
        dry_run: bool,
    },
}

impl Cli {
    pub fn execute(self) -> Result<(), CliError> {
        match self.command {
            Commands::Install {
                dry_run,
                close,
                relaunch,
                resources_dir,
                project_root,
            } => run_install(
                dry_run,
                close,
                relaunch,
                resources_dir.as_deref(),
                project_root.as_deref(),
            ),

            Commands::Revert { resources_dir } => run_revert(resources_dir.as_deref()),

            Commands::Sync {
                port,
                dict,
                project_root,
            } => run_sync(port, dict.as_deref(), project_root.as_deref()),

            Commands::Asar { sub } => run_asar(sub),

            Commands::Process { sub } => run_process(sub),

            Commands::Replacer { sub } => run_replacer(sub),

            Commands::Check { resources_dir } => run_check(resources_dir.as_deref()),
        }
    }
}

/// Prints one line per scope, mirroring the per-scope logging of
/// `patchAllTargets` in `scripts/lib/replacement-engine.js`: a skipped scope gets
/// its own warning line instead of disappearing, so a renamed or missing staged
/// file can no longer pass for a clean install.
///
/// Returns `(patched, skipped)`.
fn report_batch_summaries(summaries: &[ReplacementSummary]) -> (usize, usize) {
    let mut patched = 0usize;
    let mut skipped = 0usize;

    for summary in summaries {
        match &summary.skipped {
            Some(reason) => {
                skipped += 1;
                let missing_path = match reason {
                    SkipReason::RulesMissing(path) => format!("规则文件 {}", path.display()),
                    SkipReason::TargetMissing(path) => format!("目标文件 {}", path.display()),
                };
                println!(
                    "{}",
                    format!("  ⚠️ [{}] 文件缺失，跳过（{}）", summary.scope, missing_path).yellow()
                );
            }
            None => {
                patched += 1;
                // rules_hit / total_rules 才是可比的两个数；旧版把「替换处数」
                // 除以「规则总数」，多命中时会打出 "2/1 matches" 这种自相矛盾的行。
                println!(
                    "  ✅ [{}] {}: {}/{} 条规则命中（{} 处替换）",
                    summary.scope,
                    summary.target_file.display(),
                    summary.rules_hit,
                    summary.total_rules,
                    summary.matched_rules
                );
                if !summary.multi_match.is_empty() {
                    println!(
                        "{}",
                        format!(
                            "     ⚠️ {} 条规则命中多于一次（下标 {:?}），已按全量替换处理；请确认规则不是过宽。",
                            summary.multi_match.len(),
                            summary.multi_match
                        )
                        .yellow()
                    );
                }
            }
        }
    }

    (patched, skipped)
}

fn run_install(
    dry_run: bool,
    close: bool,
    relaunch: bool,
    resources_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<(), CliError> {
    println!("{}", "==> Antigravity Chinese Localization Installer".bold().cyan());

    if let Some(root) = project_root {
        if !root.exists() {
            return Err(CliError::Execution(format!(
                "Specified project root does not exist: {}",
                root.display()
            )));
        }
    }

    // 1. Resolve source assets FIRST. Fail early before touching disk if assets are missing.
    let assets = env::resolve_source_assets(project_root)?;
    if !assets.native_patches_dir.is_dir()
        || !assets.source_i18n.is_file()
        || !assets.source_dict.is_file()
    {
        return Err(CliError::Execution(format!(
            "Localization source assets not found or incomplete: native_patches={:?}, i18n={:?}, dict={:?}",
            assets.native_patches_dir, assets.source_i18n, assets.source_dict
        )));
    }

    let res_dir = env::get_resources_dir(resources_dir)?;
    println!("Target resources: {}", res_dir.display());

    if !dry_run {
        if ProcessManager::is_ide_running()? {
            if close {
                println!("Requesting graceful IDE shutdown...");
                let closed = ProcessManager::graceful_close(12)?;
                if !closed {
                    return Err(CliError::Execution(
                        "Antigravity IDE is still running. Please close it manually.".into(),
                    ));
                }
            } else {
                return Err(CliError::Execution(
                    "Antigravity IDE is currently active. Close it or pass --close.".into(),
                ));
            }
        }

        let killed = ProcessManager::kill_residual_sidecars()?;
        if killed > 0 {
            println!("Cleaned up {} residual sidecar process(es)", killed);
        }

        let deployer = Deployer::new(&res_dir);
        // 不静默丢弃 Result：恢复失败意味着安装目录可能仍处在上次中断的半交换状态
        // （app.asar 已改名、新目录未落位），在这种状态上继续安装风险很高。
        if let Err(err) = deployer.recover_interrupted_deploy() {
            return Err(CliError::Execution(format!(
                "无法归位上次中断的部署（{}）；请先手动检查 {} 下的 app.new / app.old / app.asar.orig.* 残留后重试。",
                err,
                res_dir.display()
            )));
        }
    } else {
        println!("{}", "[Preview Mode] IDE checks and process terminations skipped.".yellow());
    }

    let asar_file = env::get_app_asar_path(&res_dir);
    let asar_orig = env::get_app_asar_orig_path(&res_dir);
    let meta_file = env::get_meta_path(&res_dir);

    let source_asar = if asar_orig.exists() {
        if !asar_file.exists() {
            asar_orig
        } else if BackupManager::is_backup_stale(&meta_file, &asar_file) {
            println!("Detected upstream update; previous backup is stale. Re-patching latest version...");
            asar_file
        } else {
            asar_orig
        }
    } else {
        asar_file
    };

    if !source_asar.exists() {
        return Err(CliError::Execution(format!(
            "Missing source archive: neither app.asar nor app.asar.orig found at {}",
            res_dir.display()
        )));
    }

    // PID alone is not unique enough: a crashed run leaves the directory behind and
    // PIDs get recycled, so the next run would reuse a stale tree. Node's deployer
    // uses a timestamp for the same reason.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_staging = std::env::temp_dir().join(format!(
        "antigravity-staging-{}-{}",
        std::process::id(),
        stamp
    ));
    if temp_staging.exists() {
        std::fs::remove_dir_all(&temp_staging)?;
    }

    struct StagingGuard(PathBuf);
    impl Drop for StagingGuard {
        fn drop(&mut self) {
            if self.0.exists() {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }
    let _staging_guard = StagingGuard(temp_staging.clone());

    println!("Unpacking archive: {}", source_asar.display());
    let stats = extract_all(&source_asar, &temp_staging)?;
    println!(
        "Extracted {} files ({} bytes)",
        stats.total_files, stats.total_bytes
    );

    println!("Applying native replacement rules from: {}", assets.native_patches_dir.display());
    // The asset search walks the exe dir, the CWD and up to four CWD ancestors.
    // Print the winner so a stale or foreign checkout cannot silently supply the
    // dictionary and rules with no visible trace.
    println!("  (assets resolved from: {})", assets.resolved_from.display());
    println!("  i18n: {}", assets.source_i18n.display());
    println!("  dict: {}", assets.source_dict.display());

    let batch = BatchReplacer::new(&assets.native_patches_dir);
    let summaries = batch.execute_batch(&temp_staging, dry_run)?;
    let total_matched: usize = summaries.iter().map(|s| s.matched_rules).sum();
    let (patched, skipped) = report_batch_summaries(&summaries);
    println!(
        "Native rules applied: {} matches across {} scopes ({} skipped)",
        total_matched, patched, skipped
    );
    if skipped > 0 {
        println!(
            "{}",
            format!(
                "⚠️ {} 个 scope 未打补丁，界面可能残留英文；请核对 src/native 规则表与解包后的文件名。",
                skipped
            )
            .yellow()
        );
    }

    if dry_run {
        println!("{}", "Dry run complete - no changes committed.".yellow());
        return Ok(());
    }

    let deployer = Deployer::new(&res_dir);
    deployer.deploy_atomically(&temp_staging, |zh_kit_dir| {
        std::fs::copy(&assets.source_i18n, zh_kit_dir.join("zh-i18n.js"))?;
        std::fs::copy(&assets.source_dict, zh_kit_dir.join("cockpit-zh.json"))?;
        println!("Localized assets deployed to {}", zh_kit_dir.display());
        Ok(())
    })?;

    println!("{}", "Installation completed successfully!".green().bold());

    if relaunch {
        println!("Relaunching Antigravity IDE...");
        match ProcessManager::relaunch_antigravity(&res_dir) {
            Ok(true) => println!("{}", "Antigravity IDE successfully relaunched.".green()),
            Ok(false) => eprintln!("{}", "Warning: Antigravity.exe not found to relaunch.".yellow()),
            Err(err) => eprintln!("{}", format!("Warning: Failed to relaunch Antigravity IDE: {}", err).yellow()),
        }
    }

    Ok(())
}

fn run_revert(resources_dir: Option<&Path>) -> Result<(), CliError> {
    println!("{}", "==> Antigravity Localization Revert".bold().yellow());
    let res_dir = env::get_resources_dir(resources_dir)?;

    if ProcessManager::is_ide_running()? {
        return Err(CliError::Execution(
            "Antigravity IDE is currently active. Close it before reverting.".into(),
        ));
    }

    let killed = ProcessManager::kill_residual_sidecars()?;
    if killed > 0 {
        println!("Cleaned up {} residual sidecar process(es)", killed);
    }

    let deployer = Deployer::new(&res_dir);
    deployer.revert()?;
    println!("{}", "Reverted to original state successfully.".green().bold());
    Ok(())
}

fn run_sync(
    port: Option<u16>,
    dict_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<(), CliError> {
    if let Some(root) = project_root {
        if !root.exists() {
            return Err(CliError::Execution(format!(
                "Specified project root does not exist: {}",
                root.display()
            )));
        }
    }

    // 与 Node 侧 scripts/sync-dict.js 对齐：先定位已安装的 zh-patch，再校验词典，
    // 校验通过才写入安装目录；CDP 推送只是尽力而为，失败不影响「文件已同步」。
    // 旧实现只做 CDP 推送、从不复制文件 —— 用 Rust 版跑「快速同步词典」等于什么都没同步，
    // 且没有 DevTools 端口时直接报错退出，与 Node 的降级行为相反。
    let res_dir = env::get_resources_dir(None)?;
    let kit_dir = env::get_zh_patch_dir(&res_dir);
    if !kit_dir.is_dir() {
        return Err(CliError::Execution(format!(
            "未找到已安装的 zh-patch 组件（{}），请先运行 install 子命令。",
            kit_dir.display()
        )));
    }

    let assets = env::resolve_source_assets(project_root).ok();
    let target_dict = if let Some(dict) = dict_path {
        dict.to_path_buf()
    } else if let Some(a) = &assets {
        a.source_dict.clone()
    } else {
        PathBuf::from("src/cockpit-zh.json")
    };

    if !target_dict.exists() {
        return Err(CliError::Execution(format!(
            "Dictionary file not found at {}. Use --dict <file> to specify dictionary location.",
            target_dict.display()
        )));
    }

    // 先校验再动安装目录：手工改词典写坏一个逗号时，不能覆盖掉安装目录里可用的那份。
    let raw = std::fs::read_to_string(&target_dict)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        CliError::Execution(format!(
            "词典不是合法 JSON，已中止同步（安装目录未被改动）: {}\n  {}",
            target_dict.display(),
            e
        ))
    })?;
    if parsed.get("dict").and_then(|v| v.as_object()).is_none() {
        return Err(CliError::Execution(format!(
            "词典缺少 dict 字段，已中止同步（安装目录未被改动）: {}",
            target_dict.display()
        )));
    }

    let deployed_dict = kit_dir.join("cockpit-zh.json");
    std::fs::copy(&target_dict, &deployed_dict)?;
    println!("✅ 词典已同步到 {}", deployed_dict.display());
    if let Some(a) = &assets {
        if a.source_i18n.is_file() {
            let deployed_i18n = kit_dir.join("zh-i18n.js");
            std::fs::copy(&a.source_i18n, &deployed_i18n)?;
            println!("✅ 翻译引擎已同步到 {}", deployed_i18n.display());
        }
    }

    // CDP 推送：没有端口或连接失败都降级，不当作同步失败。
    let active_port = match port.or_else(CdpClient::detect_port) {
        Some(p) => p,
        None => {
            println!("💡 未检测到运行中的 Antigravity（或未开启 DevTools 端口），词典将在下次切换视图或重启时生效。");
            return Ok(());
        }
    };

    println!("Connecting to CDP on port {}", active_port);
    match CdpClient::sync_dictionary(&deployed_dict, active_port) {
        Ok(n) if n > 0 => println!("⚡ 已向 {} 个活动窗口推送最新词典并完成全量重译！", n),
        Ok(_) => println!("💡 词典文件已就绪，将在下次切换视图或重启时使用。"),
        Err(e) => eprintln!(
            "⚠️ 实时推送失败（{}）；词典文件已就绪，将在下次切换视图或重启时生效。",
            e
        ),
    }
    Ok(())
}

fn run_asar(cmd: AsarCommands) -> Result<(), CliError> {
    match cmd {
        AsarCommands::Extract { input, output } => {
            println!("Extracting {} -> {}", input.display(), output.display());
            let stats = extract_all(&input, &output)?;
            println!("Extracted {} files ({})", stats.total_files, stats.total_bytes);
        }
        AsarCommands::Pack {
            input,
            output,
            unpack,
        } => {
            println!("Packing {} -> {}", input.display(), output.display());
            let opts = PackOptions {
                unpack_globs: unpack,
            };
            let stats = pack_dir(&input, &output, Some(&opts))?;
            println!(
                "Packed {} files into {} ({} bytes)",
                stats.file_count,
                output.display(),
                stats.total_archive_size
            );
        }
        AsarCommands::List { input } => {
            let reader = AsarReader::open(&input)?;
            let entries = reader.list_files();
            println!("Archive contains {} entries:", entries.len());
            for entry in entries {
                println!(
                    "  {} ({} bytes, offset {})",
                    entry.path.display(),
                    entry.size,
                    entry.offset
                );
            }
        }
    }
    Ok(())
}

fn run_process(cmd: ProcessCommands) -> Result<(), CliError> {
    match cmd {
        ProcessCommands::List => {
            let procs = ProcessManager::list_antigravity_processes()?;
            println!("Active Antigravity processes ({}):", procs.len());
            for p in procs {
                println!(
                    "  PID {} (PPID {}) [window: {}, sidecar: {}]",
                    p.pid, p.parent_pid, p.has_window, p.is_sidecar
                );
            }
        }
        ProcessCommands::KillSidecars => {
            let killed = ProcessManager::kill_residual_sidecars()?;
            println!("Terminated {} sidecar process(es)", killed);
        }
        ProcessCommands::Close { timeout } => {
            println!("Requesting graceful close (timeout: {}s)...", timeout);
            let closed = ProcessManager::graceful_close(timeout)?;
            if closed {
                println!("{}", "Processes closed cleanly.".green());
            } else {
                println!("{}", "Timeout expired; some processes remain.".yellow());
            }
        }
    }
    Ok(())
}

fn run_replacer(cmd: ReplacerCommands) -> Result<(), CliError> {
    match cmd {
        ReplacerCommands::Apply {
            rules,
            target,
            dry_run,
        } => {
            let replacer = StringReplacer::from_json_file(&rules)?;
            let summary = replacer.apply_to_file(&target, "single", dry_run)?;
            println!(
                "Applied rules: {}/{} 条规则命中（{} 处替换，modified: {}）",
                summary.rules_hit, summary.total_rules, summary.matched_rules, summary.modified
            );
            if !summary.multi_match.is_empty() {
                println!(
                    "{}",
                    format!(
                        "  ⚠️ {} 条规则命中多于一次（下标 {:?}），已按全量替换处理",
                        summary.multi_match.len(),
                        summary.multi_match
                    )
                    .yellow()
                );
            }
        }
        ReplacerCommands::Batch {
            rules_dir,
            staging_dir,
            dry_run,
        } => {
            let batch = BatchReplacer::new(&rules_dir);
            let summaries = batch.execute_batch(&staging_dir, dry_run)?;
            println!("Batch replacement completed ({} scopes):", summaries.len());
            let (patched, skipped) = report_batch_summaries(&summaries);
            if skipped > 0 {
                println!("  {} scopes patched, {} scopes skipped", patched, skipped);
            }
        }
    }
    Ok(())
}

fn run_check(resources_dir: Option<&Path>) -> Result<(), CliError> {
    println!("{}", "==> Antigravity Installation Health Check".bold().cyan());

    let res_dir = match env::get_resources_dir(resources_dir) {
        Ok(d) => {
            println!("  Resources directory: {}", d.display().to_string().green());
            d
        }
        Err(e) => {
            println!("  Resources directory: {} ({})", "Not found".red(), e);
            return Ok(());
        }
    };

    let asar_file = env::get_app_asar_path(&res_dir);
    println!(
        "  app.asar: {}",
        if asar_file.exists() { "Present".green() } else { "Missing".yellow() }
    );

    let asar_orig = env::get_app_asar_orig_path(&res_dir);
    println!(
        "  app.asar.orig (backup): {}",
        if asar_orig.exists() { "Present".green() } else { "None".white() }
    );

    let meta_file = env::get_meta_path(&res_dir);
    if !asar_orig.exists() {
        println!(
            "  Backup status: {}",
            "no backup recorded (patch is not installed)".white()
        );
    } else if !meta_file.exists() {
        // 旧版在 meta 缺失时整行不打印 —— 对「健康检查」命令来说，
        // 最该报警的情形反而被静默省略了。
        println!(
            "  Backup status: {}",
            "UNKNOWN - app.asar.orig exists but app.asar.orig.meta.json does not; \
             the backup cannot be verified against the current client"
                .red()
        );
    } else if !asar_file.exists() {
        // app.asar 不在原位是「补丁已安装」的正常状态（Electron 优先加载 app/ 目录），
        // 此时没有可比对的对象，不能报 Stale 制造误解。
        println!(
            "  Backup status: {}",
            "present (patch installed; app.asar is renamed away so staleness is not comparable)"
                .green()
        );
    } else {
        let is_stale = BackupManager::is_backup_stale(&meta_file, &asar_file);
        println!(
            "  Backup status: {}",
            if is_stale {
                "Stale (upstream updated)".yellow()
            } else {
                "Valid".green()
            }
        );
    }

    let app_dir = env::get_app_dir(&res_dir);
    let zh_dir = env::get_zh_patch_dir(&res_dir);
    println!(
        "  Patched tree (app/): {}",
        if app_dir.exists() { "Present".green() } else { "Absent".white() }
    );
    println!(
        "  Localization kit (zh-patch/): {}",
        if zh_dir.exists() { "Present".green() } else { "Absent".white() }
    );
    for leftover in ["app.new", "app.old", "zh-patch.new", "zh-patch.old", "app.asar.orig.tmp", "app.asar.orig.old"] {
        let p = res_dir.join(leftover);
        if p.exists() {
            println!(
                "  {}: {}",
                leftover,
                "LEFTOVER from an interrupted deploy (next run will clean it up)".yellow()
            );
        }
    }

    let ide_running = ProcessManager::is_ide_running()?;
    println!(
        "  IDE running status: {}",
        if ide_running { "Active".yellow() } else { "Inactive".green() }
    );

    Ok(())
}
