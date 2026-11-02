use thiserror::Error;

/// Errors produced during ASAR archive operations.
#[derive(Debug, Error)]
pub enum AsarError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid ASAR header: {0}")]
    InvalidHeader(String),

    #[error("JSON header parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("File not found in archive: {0}")]
    NotFound(String),

    #[error("Path traversal rejected: {0}")]
    InvalidPath(String),

    #[error("Archive size mismatch: expected {expected}, actual {actual}")]
    SizeMismatch { expected: u64, actual: u64 },
}
