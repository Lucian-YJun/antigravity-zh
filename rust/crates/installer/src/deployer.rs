use std::fs;
use std::path::{Path, PathBuf};

use crate::backup::BackupManager;
use crate::env;
use crate::error::InstallerError;

/// Atomic two-phase deployment and rollback manager.
pub struct Deployer {
    resources_dir: PathBuf,
}

impl Deployer {
    /// Creates a new Deployer for the given resources directory.
    pub fn new<P: AsRef<Path>>(resources_dir: P) -> Self {
        Self {
            resources_dir: resources_dir.as_ref().to_path_buf(),
        }
    }

    /// Recovers from an interrupted or aborted deployment by inspecting residual temporary paths.
    pub fn recover_interrupted_deploy(&self) -> Result<(), InstallerError> {
        let app_dir = env::get_app_dir(&self.resources_dir);
        let app_new = self.resources_dir.join("app.new");
        let app_old = self.resources_dir.join("app.old");

        let zh_dir = env::get_zh_patch_dir(&self.resources_dir);
        let zh_new = self.resources_dir.join("zh-patch.new");
        let zh_old = self.resources_dir.join("zh-patch.old");

        let asar_file = env::get_app_asar_path(&self.resources_dir);
        let asar_orig = env::get_app_asar_orig_path(&self.resources_dir);
        let asar_orig_tmp = self.resources_dir.join("app.asar.orig.tmp");
        let asar_orig_old = self.resources_dir.join("app.asar.orig.old");
        let meta_file = env::get_meta_path(&self.resources_dir);

        // Recovery actions must not be silently swallowed: callers abort the
        // install when a half-swapped directory cannot be restored. Only
        // absent residual paths mean "nothing to recover"; an existing path
        // whose rename/remove fails is an error. Treat a concurrent removal
        // (NotFound) as success, but propagate every other I/O failure.
        fn rename_if_present(from: &Path, to: &Path) -> Result<(), InstallerError> {
            if !from.exists() {
                return Ok(());
            }
            match fs::rename(from, to) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !from.exists() => Ok(()),
                Err(e) => Err(InstallerError::Io(e)),
            }
        }

        fn remove_dir_if_present(path: &Path) -> Result<(), InstallerError> {
            if !path.exists() {
                return Ok(());
            }
            match fs::remove_dir_all(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !path.exists() => Ok(()),
                Err(e) => Err(InstallerError::Io(e)),
            }
        }

        fn remove_file_if_present(path: &Path) -> Result<(), InstallerError> {
            if !path.exists() {
                return Ok(());
            }
            match fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !path.exists() => Ok(()),
                Err(e) => Err(InstallerError::Io(e)),
            }
        }

        // 1. Recover asar: if neither asar_file nor asar_orig exists, restore from leftovers
        if !asar_file.exists() && !asar_orig.exists() {
            if asar_orig_tmp.exists() {
                rename_if_present(&asar_orig_tmp, &asar_orig)?;
            } else if asar_orig_old.exists() {
                rename_if_present(&asar_orig_old, &asar_orig)?;
            }
        } else {
            if !asar_file.exists() && asar_orig_tmp.exists() {
                rename_if_present(&asar_orig_tmp, &asar_file)?;
            }
            if !asar_orig.exists() && asar_orig_old.exists() {
                rename_if_present(&asar_orig_old, &asar_orig)?;
            }
        }

        // 2. Recover directories: app and zh-patch
        for (live, candidates) in [
            (&app_dir, [&app_old, &app_new]),
            (&zh_dir, [&zh_old, &zh_new]),
        ] {
            if !live.exists() {
                for candidate in candidates {
                    if candidate.exists() {
                        rename_if_present(candidate, live)?;
                        break;
                    }
                }
            }
        }

        // 3. Clean up residual intermediate directories and backup files
        remove_dir_if_present(&app_new)?;
        remove_dir_if_present(&zh_new)?;
        if app_dir.exists() {
            remove_dir_if_present(&app_old)?;
        }
        if zh_dir.exists() {
            remove_dir_if_present(&zh_old)?;
        }
        if asar_orig.exists() {
            remove_file_if_present(&asar_orig_tmp)?;
            remove_file_if_present(&asar_orig_old)?;
        }

        if !asar_orig.exists() {
            remove_file_if_present(&meta_file)?;
        }

        Ok(())
    }

    /// Performs an atomic two-phase directory swap.
    /// On any failure, previous states are restored in reverse order (LIFO).
    pub fn deploy_atomically<F>(&self, staging_dir: &Path, prepare_kit: F) -> Result<(), InstallerError>
    where
        F: FnOnce(&Path) -> Result<(), InstallerError>,
    {
        // Phase 0: Recover any previous incomplete deploy
        self.recover_interrupted_deploy()?;

        let app_dir = env::get_app_dir(&self.resources_dir);
        let app_new = self.resources_dir.join("app.new");
        let app_old = self.resources_dir.join("app.old");

        let zh_dir = env::get_zh_patch_dir(&self.resources_dir);
        let zh_new = self.resources_dir.join("zh-patch.new");
        let zh_old = self.resources_dir.join("zh-patch.old");

        let asar_file = env::get_app_asar_path(&self.resources_dir);
        let asar_orig = env::get_app_asar_orig_path(&self.resources_dir);
        let asar_orig_tmp = self.resources_dir.join("app.asar.orig.tmp");
        let asar_orig_old = self.resources_dir.join("app.asar.orig.old");
        let meta_file = env::get_meta_path(&self.resources_dir);

        let had_asar = asar_file.exists();
        let had_orig = asar_orig.exists();
        let had_app = app_dir.exists();
        let had_zh = zh_dir.exists();

        // Phase 1: Prepare staging in app.new (supporting cross-device moves)
        if app_new.exists() {
            fs::remove_dir_all(&app_new)?;
        }
        move_dir(staging_dir, &app_new)?;

        // Prepare localization kit in zh-patch.new
        if zh_new.exists() {
            fs::remove_dir_all(&zh_new)?;
        }
        fs::create_dir_all(&zh_new)?;
        if let Err(e) = prepare_kit(&zh_new) {
            let _ = fs::remove_dir_all(&app_new);
            let _ = fs::remove_dir_all(&zh_new);
            return Err(e);
        }

        // Phase 2: Compute backup metadata
        let backup_meta = if had_asar {
            Some(BackupManager::create_meta_from_source(&asar_file)?)
        } else if had_orig && !meta_file.exists() {
            Some(BackupManager::create_meta_from_source(&asar_orig)?)
        } else {
            None
        };

        // Phase 3: Transactional atomic renames with reverse rollback stack
        let mut rollback_stack: Vec<Box<dyn FnOnce() -> std::io::Result<()>>> = Vec::new();

        let execute_transaction = || -> Result<(), InstallerError> {
            // Step 1: Backup existing orig if present AND we have a new active asar to commit
            if had_asar {
                if had_orig {
                    fs::rename(&asar_orig, &asar_orig_old)?;
                    let orig = asar_orig.clone();
                    let old = asar_orig_old.clone();
                    rollback_stack.push(Box::new(move || { let _ = fs::rename(old, orig); Ok(()) }));
                }

                // Step 2: Move active app.asar -> app.asar.orig.tmp
                fs::rename(&asar_file, &asar_orig_tmp)?;
                let orig_tmp = asar_orig_tmp.clone();
                let asar = asar_file.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(orig_tmp, asar); Ok(()) }));
            }

            // Step 3: Swap app folder
            if had_app {
                fs::rename(&app_dir, &app_old)?;
                let old = app_old.clone();
                let app = app_dir.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(old, app); Ok(()) }));
            }
            fs::rename(&app_new, &app_dir)?;
            {
                let app = app_dir.clone();
                let new = app_new.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(app, new); Ok(()) }));
            }

            // Step 4: Swap zh-patch folder
            if had_zh {
                fs::rename(&zh_dir, &zh_old)?;
                let old = zh_old.clone();
                let zh = zh_dir.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(old, zh); Ok(()) }));
            }
            fs::rename(&zh_new, &zh_dir)?;
            {
                let zh = zh_dir.clone();
                let new = zh_new.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(zh, new); Ok(()) }));
            }

            // Step 5: Commit orig.tmp -> orig only if we backed up active asar
            if had_asar && asar_orig_tmp.exists() {
                fs::rename(&asar_orig_tmp, &asar_orig)?;
                let orig = asar_orig.clone();
                let tmp = asar_orig_tmp.clone();
                rollback_stack.push(Box::new(move || { let _ = fs::rename(orig, tmp); Ok(()) }));
            }

            // Step 6: Write backup metadata
            if let Some(ref meta) = backup_meta {
                BackupManager::write_meta(&meta_file, meta)?;
                let meta_f = meta_file.clone();
                rollback_stack.push(Box::new(move || {
                    let _ = fs::remove_file(meta_f);
                    Ok(())
                }));
            }

            Ok(())
        };

        // Run the transaction inside catch_unwind: with the default unwind
        // panic strategy a panic here would otherwise skip the rollback stack
        // entirely and leave the install directory half-swapped (app.asar
        // already renamed away, new tree not yet in place).
        let tx_outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(execute_transaction));

        let tx_failure = match tx_outcome {
            Ok(Ok(())) => None,
            Ok(Err(err)) => Some(err.to_string()),
            Err(_) => Some("transaction panicked (see stderr for the panic message)".to_string()),
        };

        if let Some(reason) = tx_failure {
            // Rollback in exact reverse order (LIFO)
            while let Some(rollback_op) = rollback_stack.pop() {
                let _ = rollback_op();
            }
            if app_new.exists() {
                let _ = fs::remove_dir_all(&app_new);
            }
            if zh_new.exists() {
                let _ = fs::remove_dir_all(&zh_new);
            }
            return Err(InstallerError::DeploymentRolledBack(reason));
        }

        // Phase 4: Commit cleanup - remove .old and intermediate files
        if app_old.exists() {
            let _ = fs::remove_dir_all(&app_old);
        }
        if zh_old.exists() {
            let _ = fs::remove_dir_all(&zh_old);
        }
        if had_asar && asar_orig_old.exists() {
            let _ = fs::remove_file(&asar_orig_old);
        }

        Ok(())
    }

    /// Reverts patched installation back to the original backup.
    pub fn revert(&self) -> Result<(), InstallerError> {
        self.recover_interrupted_deploy()?;

        let app_dir = env::get_app_dir(&self.resources_dir);
        let zh_dir = env::get_zh_patch_dir(&self.resources_dir);
        let asar_file = env::get_app_asar_path(&self.resources_dir);
        let asar_orig = env::get_app_asar_orig_path(&self.resources_dir);
        let meta_file = env::get_meta_path(&self.resources_dir);

        if !asar_orig.exists() && !asar_file.exists() && !app_dir.exists() && !zh_dir.exists() {
            return Err(InstallerError::Env(
                "Neither app.asar nor app.asar.orig exists; cannot revert".into(),
            ));
        }

        // Check if backup is stale compared to the current asar file (e.g. upstream updated)
        let backup_is_stale = asar_orig.exists()
            && asar_file.exists()
            && BackupManager::is_backup_stale(&meta_file, &asar_file);

        // Restore original asar archive if not stale
        if asar_orig.exists() && !backup_is_stale {
            if asar_file.exists() {
                fs::remove_file(&asar_file)?;
            }
            fs::rename(&asar_orig, &asar_file)?;
        } else if backup_is_stale {
            // Do not downgrade an updated client with stale backup
            let _ = fs::remove_file(&asar_orig);
        }

        // Remove patched directory trees
        if app_dir.exists() {
            fs::remove_dir_all(&app_dir)?;
        }
        if zh_dir.exists() {
            fs::remove_dir_all(&zh_dir)?;
        }

        // Remove stale metadata
        if meta_file.exists() {
            let _ = fs::remove_file(&meta_file);
        }

        Ok(())
    }
}

/// True when a rename failed because source and destination live on different
/// volumes. EXDEV is 18 on Unix; ERROR_NOT_SAME_DEVICE is 17 on Windows.
fn is_cross_device(err: &std::io::Error) -> bool {
    #[cfg(windows)]
    {
        err.raw_os_error() == Some(17)
    }
    #[cfg(not(windows))]
    {
        err.raw_os_error() == Some(18)
    }
}

fn move_dir<P: AsRef<Path>, Q: AsRef<Path>>(from: P, to: Q) -> Result<(), InstallerError> {
    let from_p = from.as_ref();
    let to_p = to.as_ref();
    match fs::rename(from_p, to_p) {
        Ok(()) => return Ok(()),
        // Only a cross-volume error justifies the non-atomic copy fallback.
        // The previous code fell back for *any* failure, so an EPERM/EBUSY from
        // antivirus or a sharing violation silently turned an atomic move into a
        // partial copy layered on top of an existing destination.
        Err(e) if is_cross_device(&e) => {}
        Err(e) => return Err(InstallerError::Io(e)),
    }
    if to_p.exists() {
        fs::remove_dir_all(to_p)?;
    }
    copy_dir_all(from_p, to_p, 0)?;
    let _ = fs::remove_dir_all(from_p);
    Ok(())
}

/// Recursion ceiling for the cross-device copy fallback. A symlink loop or a
/// pathological tree would otherwise overflow the stack.
const MAX_COPY_DEPTH: usize = 64;

fn copy_dir_all(src: &Path, dst: &Path, depth: usize) -> Result<(), InstallerError> {
    if depth > MAX_COPY_DEPTH {
        return Err(InstallerError::Env(format!(
            "Directory nesting exceeds {} levels while copying {} — possible symlink loop",
            MAX_COPY_DEPTH,
            src.display()
        )));
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        // symlink_metadata, not file_type(): the latter follows the link and would
        // report a symlink-to-directory as a plain directory, making the copy
        // dereference every link (Node's cpSync keeps them) and follow cycles.
        let meta = fs::symlink_metadata(entry.path())?;
        let dest = dst.join(entry.file_name());
        if meta.file_type().is_symlink() {
            // Replicate the link when the platform allows it; otherwise fall back
            // to copying the target's contents so the tree stays usable.
            #[cfg(windows)]
            let linked = {
                let target = fs::read_link(entry.path())?;
                if meta.is_dir() {
                    std::os::windows::fs::symlink_dir(&target, &dest)
                } else {
                    std::os::windows::fs::symlink_file(&target, &dest)
                }
            };
            #[cfg(not(windows))]
            let linked = {
                let target = fs::read_link(entry.path())?;
                std::os::unix::fs::symlink(&target, &dest)
            };
            if linked.is_err() {
                if meta.is_dir() {
                    copy_dir_all(&entry.path(), &dest, depth + 1)?;
                } else {
                    fs::copy(entry.path(), &dest)?;
                }
            }
        } else if meta.is_dir() {
            copy_dir_all(&entry.path(), &dest, depth + 1)?;
        } else {
            fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}
