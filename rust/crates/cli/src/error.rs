use thiserror::Error;

/// CLI-level error union.
#[derive(Debug, Error)]
pub enum CliError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("ASAR operation failed: {0}")]
    Asar(#[from] antigravity_asar::AsarError),

    #[error("Replacer operation failed: {0}")]
    Replacer(#[from] antigravity_replacer::ReplacerError),

    #[error("Installer operation failed: {0}")]
    Installer(#[from] antigravity_installer::InstallerError),

    #[error("Execution error: {0}")]
    Execution(String),
}
