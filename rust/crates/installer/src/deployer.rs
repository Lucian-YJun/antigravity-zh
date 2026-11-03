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

        // Clean up partial staging directories
        if app_new.exists() {
            let _ = fs::remove_dir_all(&app_new);
        }
        if zh_new.exists() {
            let _ = fs::remove_dir_all(&zh_new);
        }

        // Recover interrupted asar moves
        if !asar_file.exists() && asar_orig_tmp.exists() {
            fs::rename(&asar_orig_tmp, &asar_file)?;
        }

        if !asar_orig.exists() && asar_orig_old.exists() {
            fs::rename(&asar_orig_old, &asar_orig)?;
        }

        // Recover app directory
        if !app_dir.exists() && app_old.exists() {
            fs::rename(&app_old, &app_dir)?;
        } else if app_old.exists() {
            let _ = fs::remove_dir_all(&app_old);
        }

        // Recover zh-patch directory
        if !zh_dir.exists() && zh_old.exists() {
            fs::rename(&zh_old, &zh_dir)?;
        } else if zh_old.exists() {
            let _ = fs::remove_dir_all(&zh_old);
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

        // Phase 1: Prepare staging in app.new
        if app_new.exists() {
            fs::remove_dir_all(&app_new)?;
        }
        fs::rename(staging_dir, &app_new)?;

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

        // Phase 2: Compute backup metadata from source asar before rename
        let backup_meta = if asar_file.exists() {
            Some(BackupManager::create_meta_from_source(&asar_file)?)
        } else {
            None
        };

        // Phase 3: Transactional atomic renames with reverse rollback stack
        let mut rollback_stack: Vec<Box<dyn FnOnce() -> std::io::Result<()>>> = Vec::new();

        let mut execute_transaction = || -> Result<(), InstallerError> {
            // Step 1: Backup existing orig if present
            if asar_orig.exists() {
                fs::rename(&asar_orig, &asar_orig_old)?;
                let orig = asar_orig.clone();
                let old = asar_orig_old.clone();
                rollback_stack.push(Box::new(move || fs::rename(old, orig)));
            }

            // Step 2: Move active app.asar -> app.asar.orig.tmp
            if asar_file.exists() {
                fs::rename(&asar_file, &asar_orig_tmp)?;
                let orig_tmp = asar_orig_tmp.clone();
                let asar = asar_file.clone();
                rollback_stack.push(Box::new(move || fs::rename(orig_tmp, asar)));
            }

            // Step 3: Swap app folder
            if app_dir.exists() {
                fs::rename(&app_dir, &app_old)?;
                let old = app_old.clone();
                let app = app_dir.clone();
                rollback_stack.push(Box::new(move || fs::rename(old, app)));
            }
            fs::rename(&app_new, &app_dir)?;
            {
                let app = app_dir.clone();
                let new = app_new.clone();
                rollback_stack.push(Box::new(move || fs::rename(app, new)));
            }

            // Step 4: Swap zh-patch folder
            if zh_dir.exists() {
                fs::rename(&zh_dir, &zh_old)?;
                let old = zh_old.clone();
                let zh = zh_dir.clone();
                rollback_stack.push(Box::new(move || fs::rename(old, zh)));
            }
            fs::rename(&zh_new, &zh_dir)?;
            {
                let zh = zh_dir.clone();
                let new = zh_new.clone();
                rollback_stack.push(Box::new(move || fs::rename(zh, new)));
            }

            // Step 5: Commit orig.tmp -> orig
            if asar_orig_tmp.exists() {
                fs::rename(&asar_orig_tmp, &asar_orig)?;
            }

            // Step 6: Write backup metadata
            if let Some(ref meta) = backup_meta {
                let _ = BackupManager::write_meta(&meta_file, meta);
            }

            Ok(())
        };

        if let Err(err) = execute_transaction() {
            // Rollback in exact reverse order (LIFO)
            while let Some(rollback_op) = rollback_stack.pop() {
                let _ = rollback_op();
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
        if asar_orig_old.exists() {
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

        if !asar_orig.exists() && !asar_file.exists() {
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
