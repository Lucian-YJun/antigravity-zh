use std::env;
use std::path::{Path, PathBuf};

use crate::error::InstallerError;

/// Returns the path to the `%LOCALAPPDATA%` directory.
pub fn get_local_app_data() -> Option<PathBuf> {
    env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

/// Returns the path to the `%APPDATA%` directory.
pub fn get_app_data() -> Option<PathBuf> {
    env::var_os("APPDATA").map(PathBuf::from)
}

/// Resolves the default Antigravity installation root directory.
/// Default: `%LOCALAPPDATA%\Programs\antigravity`
pub fn get_default_antigravity_dir() -> Result<PathBuf, InstallerError> {
    let local = get_local_app_data().ok_or_else(|| {
        InstallerError::Env("%LOCALAPPDATA% environment variable is not defined".into())
    })?;

    Ok(local.join("Programs").join("antigravity"))
}

/// Resolves the Antigravity `resources` directory, respecting overrides.
pub fn get_resources_dir(override_dir: Option<&Path>) -> Result<PathBuf, InstallerError> {
    if let Some(custom) = override_dir {
        Ok(custom.to_path_buf())
    } else {
        let base = get_default_antigravity_dir()?;
        Ok(base.join("resources"))
    }
}

/// Path to `app.asar` inside the resources directory.
pub fn get_app_asar_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join("app.asar")
}

/// Path to the original backup `app.asar.orig`.
pub fn get_app_asar_orig_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join("app.asar.orig")
}

/// Path to backup metadata `app.asar.orig.meta.json`.
pub fn get_meta_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join("app.asar.orig.meta.json")
}

/// Path to the unpacked `app` folder.
pub fn get_app_dir(resources_dir: &Path) -> PathBuf {
    resources_dir.join("app")
}

/// Path to the localized asset folder `zh-patch`.
pub fn get_zh_patch_dir(resources_dir: &Path) -> PathBuf {
    resources_dir.join("zh-patch")
}

/// Path to the active Chrome DevTools port descriptor file.
pub fn get_devtools_active_port_path() -> Option<PathBuf> {
    get_app_data().map(|roaming| roaming.join("Antigravity").join("DevToolsActivePort"))
}

/// Resolved source assets for localization installation.
#[derive(Debug, Clone)]
pub struct SourceAssets {
    pub source_i18n: PathBuf,
    pub source_dict: PathBuf,
    pub native_patches_dir: PathBuf,
}

/// Resolves source assets (scripts, dictionary, native rule files) across project and runtime locations.
pub fn resolve_source_assets(custom_root: Option<&Path>) -> Result<SourceAssets, InstallerError> {
    let mut candidates = Vec::new();
    if let Some(r) = custom_root {
        candidates.push(r.to_path_buf());
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.clone());
        let mut cur = cwd;
        for _ in 0..4 {
            if let Some(parent) = cur.parent() {
                candidates.push(parent.to_path_buf());
                cur = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    for dir in &candidates {
        let external_src = dir.join("src");
        if external_src.join("native").exists() || external_src.join("zh-i18n.js").exists() {
            let native = external_src.join("native");
            let i18n = external_src.join("zh-i18n.js");
            let dict = if dir.join("cockpit-zh.json").exists() {
                dir.join("cockpit-zh.json")
            } else {
                external_src.join("cockpit-zh.json")
            };
            return Ok(SourceAssets {
                source_i18n: i18n,
                source_dict: dict,
                native_patches_dir: native,
            });
        }

        if dir.join("native").exists() {
            return Ok(SourceAssets {
                source_i18n: dir.join("zh-i18n.js"),
                source_dict: dir.join("cockpit-zh.json"),
                native_patches_dir: dir.join("native"),
            });
        }
    }

    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    Ok(SourceAssets {
        source_i18n: base.join("src").join("zh-i18n.js"),
        source_dict: base.join("src").join("cockpit-zh.json"),
        native_patches_dir: base.join("src").join("native"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_subpaths() {
        let res = Path::new("C:\\Test\\resources");
        assert_eq!(get_app_asar_path(res), res.join("app.asar"));
        assert_eq!(get_app_asar_orig_path(res), res.join("app.asar.orig"));
        assert_eq!(get_meta_path(res), res.join("app.asar.orig.meta.json"));
        assert_eq!(get_app_dir(res), res.join("app"));
        assert_eq!(get_zh_patch_dir(res), res.join("zh-patch"));
    }
}
