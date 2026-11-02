use thiserror::Error;

/// Errors produced during installation, process management, and backup operations.
#[derive(Debug, Error)]
pub enum InstallerError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Environment error: {0}")]
    Env(String),

    #[error("Win32 error: {0}")]
    Win32(String),

    #[error("Process still active: {0}")]
    ProcessRunning(String),

    #[error("Deployment failed, rollback completed: {0}")]
    DeploymentRolledBack(String),

    #[error("ASAR archive error: {0}")]
    Asar(#[from] antigravity_asar::AsarError),

    #[error("Replacer error: {0}")]
    Replacer(#[from] antigravity_replacer::ReplacerError),
}
