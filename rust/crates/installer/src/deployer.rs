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

        // 1. Recover asar: if neither asar_file nor asar_orig exists, restore from leftovers
        if !asar_file.exists() && !asar_orig.exists() {
            if asar_orig_tmp.exists() {
                let _ = fs::rename(&asar_orig_tmp, &asar_orig);
            } else if asar_orig_old.exists() {
                let _ = fs::rename(&asar_orig_old, &asar_orig);
            }
        } else {
            if !asar_file.exists() && asar_orig_tmp.exists() {
                let _ = fs::rename(&asar_orig_tmp, &asar_file);
            }
            if !asar_orig.exists() && asar_orig_old.exists() {
                let _ = fs::rename(&asar_orig_old, &asar_orig);
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
                        let _ = fs::rename(candidate, live);
                        break;
                    }
                }
            }
        }

        // 3. Clean up residual intermediate directories and backup files
        if app_new.exists() {
            let _ = fs::remove_dir_all(&app_new);
        }
        if zh_new.exists() {
            let _ = fs::remove_dir_all(&zh_new);
        }
        if app_dir.exists() && app_old.exists() {
            let _ = fs::remove_dir_all(&app_old);
        }
        if zh_dir.exists() && zh_old.exists() {
            let _ = fs::remove_dir_all(&zh_old);
        }
        if asar_orig.exists() {
            if asar_orig_tmp.exists() {
                let _ = fs::remove_file(&asar_orig_tmp);
            }
            if asar_orig_old.exists() {
                let _ = fs::remove_file(&asar_orig_old);
            }
        }

        if !asar_orig.exists() && meta_file.exists() {
            let _ = fs::remove_file(&meta_file);
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

        let mut execute_transaction = || -> Result<(), InstallerError> {
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

        if let Err(err) = execute_transaction() {
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
            return Err(InstallerError::DeploymentRolledBack(err.to_string()));
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

fn move_dir<P: AsRef<Path>, Q: AsRef<Path>>(from: P, to: Q) -> Result<(), InstallerError> {
    let from_p = from.as_ref();
    let to_p = to.as_ref();
    if fs::rename(from_p, to_p).is_ok() {
        return Ok(());
    }
    copy_dir_all(from_p, to_p)?;
    let _ = fs::remove_dir_all(from_p);
    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), InstallerError> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}
