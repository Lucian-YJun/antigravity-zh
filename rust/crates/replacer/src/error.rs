use std::path::PathBuf;
use thiserror::Error;

/// Errors produced during string replacement operations.
#[derive(Debug, Error)]
pub enum ReplacerError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Aho-Corasick build error: {0}")]
    Automaton(#[from] aho_corasick::BuildError),

    #[error("Rule file not found: {0}")]
    RuleNotFound(PathBuf),

    #[error("Target file not found: {0}")]
    TargetNotFound(PathBuf),

    #[error("Empty rule set")]
    EmptyRules,
}
