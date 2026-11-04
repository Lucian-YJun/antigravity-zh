//! Windows lifecycle, process detection, atomic staging, and backup management.
//!
//! Provides Win32 Toolhelp snapshot process management with sidecar filtering,
//! SHA-256 backup metadata persistence, and transactional two-phase deployment.

pub mod backup;
pub mod cdp;
pub mod deploy;
pub mod deployer;
pub mod env;
pub mod error;
pub mod process;

pub use backup::{BackupManager, BackupMeta, FileFingerprint};
pub use cdp::CdpClient;
pub use deployer::Deployer;
// Explicit re-exports rather than `pub use env::*`: a glob would silently widen
// the public API every time env gains an item, and can introduce name clashes.
pub use env::{
    get_app_asar_orig_path, get_app_asar_path, get_app_data, get_app_dir,
    get_default_antigravity_dir, get_devtools_active_port_path, get_local_app_data, get_meta_path,
    get_resources_dir, get_zh_patch_dir, resolve_source_assets, SourceAssets,
};
pub use error::InstallerError;
pub use process::{is_sidecar_process, ProcessInfo, ProcessManager};
