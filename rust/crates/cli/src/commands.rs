use std::path::{Path, PathBuf};
use clap::{Parser, Subcommand};
use colored::*;

use antigravity_asar::{extract_all, pack_dir, AsarReader, PackOptions};
use antigravity_installer::{
    env, BackupManager, CdpClient, Deployer, ProcessManager,
};
use antigravity_replacer::{BatchReplacer, StringReplacer};

use crate::error::CliError;

#[derive(Parser, Debug)]
#[command(
    name = "antigravity-tool",
    about = "Antigravity Native Rust Localization Toolchain",
    version = "1.3.1"
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
            } => run_install(dry_run, close, relaunch, resources_dir.as_deref()),

            Commands::Revert { resources_dir } => run_revert(resources_dir.as_deref()),

            Commands::Sync { port, dict } => run_sync(port, dict.as_deref()),

            Commands::Asar { sub } => run_asar(sub),

            Commands::Process { sub } => run_process(sub),

            Commands::Replacer { sub } => run_replacer(sub),

            Commands::Check { resources_dir } => run_check(resources_dir.as_deref()),
        }
    }
}

fn run_install(
    dry_run: bool,
    close: bool,
    relaunch: bool,
    resources_dir: Option<&Path>,
) -> Result<(), CliError> {
    println!("{}", "==> Antigravity Chinese Localization Installer".bold().cyan());

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
        let _ = deployer.recover_interrupted_deploy();
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

    let temp_staging = std::env::temp_dir().join(format!("antigravity-staging-{}", std::process::id()));
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

    let assets = env::resolve_source_assets(None)?;
    println!("Applying native replacement rules from: {}", assets.native_patches_dir.display());

    let batch = BatchReplacer::new(&assets.native_patches_dir);
    let summaries = batch.execute_batch(&temp_staging, dry_run)?;
    let total_matched: usize = summaries.iter().map(|s| s.matched_rules).sum();
    println!(
        "Native rules applied: {} matches across {} scopes",
        total_matched,
        summaries.len()
    );
    for s in &summaries {
        println!(
            "  [{}] {}: {}/{} matches",
            s.scope,
            s.target_file.display(),
            s.matched_rules,
            s.total_rules
        );
    }

    if dry_run {
        println!("{}", "Dry run complete - no changes committed.".yellow());
        return Ok(());
    }

    let deployer = Deployer::new(&res_dir);
    deployer.deploy_atomically(&temp_staging, |zh_kit_dir| {
        if assets.source_i18n.exists() {
            std::fs::copy(&assets.source_i18n, zh_kit_dir.join("zh-i18n.js"))?;
        }
        if assets.source_dict.exists() {
            std::fs::copy(&assets.source_dict, zh_kit_dir.join("cockpit-zh.json"))?;
        }
        println!("Localized assets deployed to {}", zh_kit_dir.display());
        Ok(())
    })?;

    println!("{}", "Installation completed successfully!".green().bold());

    if relaunch {
        println!("Relaunching Antigravity IDE...");
        let _ = ProcessManager::relaunch_antigravity(&res_dir);
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

fn run_sync(port: Option<u16>, dict_path: Option<&Path>) -> Result<(), CliError> {
    let active_port = match port {
        Some(p) => p,
        None => CdpClient::detect_port().ok_or_else(|| {
            CliError::Execution("Could not detect active DevTools port. Is Antigravity running?".into())
        })?,
    };

    println!("Connecting to CDP on port {}", active_port);

    let default_dict = PathBuf::from("cockpit-zh.json");
    let target_dict = dict_path.unwrap_or(&default_dict);

    let count = CdpClient::sync_dictionary(target_dict, active_port)?;
    println!("Synchronized dictionary to {} renderer target(s)", count);
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
                "Applied rules: {}/{} matches (modified: {})",
                summary.matched_rules, summary.total_rules, summary.modified
            );
        }
        ReplacerCommands::Batch {
            rules_dir,
            staging_dir,
            dry_run,
        } => {
            let batch = BatchReplacer::new(&rules_dir);
            let summaries = batch.execute_batch(&staging_dir, dry_run)?;
            println!("Batch replacement completed ({} scopes):", summaries.len());
            for s in summaries {
                println!(
                    "  [{}] {}: {}/{} matches",
                    s.scope,
                    s.target_file.display(),
                    s.matched_rules,
                    s.total_rules
                );
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
    if meta_file.exists() {
        let is_stale = BackupManager::is_backup_stale(&meta_file, &asar_file);
        println!(
            "  Backup status: {}",
            if is_stale { "Stale (upstream updated)".yellow() } else { "Valid".green() }
        );
    }

    let ide_running = ProcessManager::is_ide_running()?;
    println!(
        "  IDE running status: {}",
        if ide_running { "Active".yellow() } else { "Inactive".green() }
    );

    Ok(())
}
