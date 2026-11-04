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
    /// Which candidate directory the three paths above were resolved from.
    ///
    /// The search walks the executable directory, the CWD, and up to four CWD
    /// ancestors, so more than one checkout can satisfy it. Recording the winner
    /// lets the caller print it — otherwise a stale or foreign checkout can
    /// silently supply the dictionary and rules with no visible trace.
    pub resolved_from: PathBuf,
}

/// Resolves source assets (scripts, dictionary, native rule files) across project and runtime locations.
pub fn resolve_source_assets(custom_root: Option<&Path>) -> Result<SourceAssets, InstallerError> {
    let candidates = if let Some(r) = custom_root {
        vec![r.to_path_buf()]
    } else {
        let mut list = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                list.push(parent.to_path_buf());
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            list.push(cwd.clone());
            let mut cur = cwd;
            for _ in 0..4 {
                if let Some(parent) = cur.parent() {
                    list.push(parent.to_path_buf());
                    cur = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
        list
    };

    for dir in &candidates {
        let external_src = dir.join("src");
        let has_external_src = external_src.is_dir();

        let native = if has_external_src && external_src.join("native").is_dir() {
            external_src.join("native")
        } else if dir.join("native").is_dir() {
            dir.join("native")
        } else {
            continue;
        };

        let i18n = if has_external_src && external_src.join("zh-i18n.js").is_file() {
            external_src.join("zh-i18n.js")
        } else if dir.join("zh-i18n.js").is_file() {
            dir.join("zh-i18n.js")
        } else {
            continue;
        };

        let dict = if dir.join("cockpit-zh.json").is_file() {
            dir.join("cockpit-zh.json")
        } else if has_external_src && external_src.join("cockpit-zh.json").is_file() {
            external_src.join("cockpit-zh.json")
        } else {
            continue;
        };

        return Ok(SourceAssets {
            source_i18n: i18n,
            source_dict: dict,
            native_patches_dir: native,
            resolved_from: dir.clone(),
        });
    }

    Err(InstallerError::Env(format!(
        "Localization source assets not found or incomplete. Searched candidates: {:?}. Ensure 'src/native' (or 'native'), 'zh-i18n.js', and 'cockpit-zh.json' exist, or specify --project-root.",
        candidates
    )))
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

    #[test]
    fn test_resolve_source_assets_standard_layout() {
        let tmp = std::env::temp_dir().join(format!("env-test-standard-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        std::fs::create_dir_all(src.join("native")).unwrap();
        std::fs::write(src.join("zh-i18n.js"), b"// i18n").unwrap();
        std::fs::write(src.join("cockpit-zh.json"), b"{}").unwrap();

        let assets = resolve_source_assets(Some(&tmp)).expect("should resolve standard assets");
        assert_eq!(assets.native_patches_dir, src.join("native"));
        assert_eq!(assets.source_i18n, src.join("zh-i18n.js"));
        assert_eq!(assets.source_dict, src.join("cockpit-zh.json"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_resolve_source_assets_external_root_dict() {
        let tmp = std::env::temp_dir().join(format!("env-test-ext-dict-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        std::fs::create_dir_all(src.join("native")).unwrap();
        std::fs::write(src.join("zh-i18n.js"), b"// i18n").unwrap();
        // Place cockpit-zh.json at root of tmp instead of src
        std::fs::write(tmp.join("cockpit-zh.json"), b"{}").unwrap();

        let assets = resolve_source_assets(Some(&tmp)).expect("should resolve root dict override");
        assert_eq!(assets.native_patches_dir, src.join("native"));
        assert_eq!(assets.source_i18n, src.join("zh-i18n.js"));
        assert_eq!(assets.source_dict, tmp.join("cockpit-zh.json"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_resolve_source_assets_flat_release_layout() {
        let tmp = std::env::temp_dir().join(format!("env-test-flat-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("native")).unwrap();
        std::fs::write(tmp.join("zh-i18n.js"), b"// i18n").unwrap();
        std::fs::write(tmp.join("cockpit-zh.json"), b"{}").unwrap();

        let assets = resolve_source_assets(Some(&tmp)).expect("should resolve flat assets");
        assert_eq!(assets.native_patches_dir, tmp.join("native"));
        assert_eq!(assets.source_i18n, tmp.join("zh-i18n.js"));
        assert_eq!(assets.source_dict, tmp.join("cockpit-zh.json"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_resolve_source_assets_missing_fails() {
        let tmp = std::env::temp_dir().join(format!("env-test-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();

        // Empty directory with no other candidates matching
        let err = resolve_source_assets(Some(&tmp)).unwrap_err();
        match err {
            InstallerError::Env(msg) => {
                assert!(msg.contains("not found or incomplete"));
            }
            other => panic!("Unexpected error type: {:?}", other),
        }

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
