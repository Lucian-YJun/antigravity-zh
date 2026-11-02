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
