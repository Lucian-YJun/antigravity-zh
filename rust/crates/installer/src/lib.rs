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
pub use env::*;
pub use error::InstallerError;
pub use process::{is_sidecar_process, ProcessInfo, ProcessManager};
