use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::InstallerError;

/// File fingerprint capturing size, modification timestamp, and SHA-256 checksum.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileFingerprint {
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: u64,
    pub sha256: String,
}

/// Metadata stored in `app.asar.orig.meta.json` to verify backup validity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupMeta {
    pub source: FileFingerprint,
    #[serde(rename = "recordedAt")]
    pub recorded_at: String,
}

pub struct BackupManager;

impl BackupManager {
    /// Computes the SHA-256 hex digest of a file using 1 MB buffered streaming.
    pub fn compute_sha256<P: AsRef<Path>>(path: P) -> Result<String, InstallerError> {
        let file = File::open(path.as_ref())?;
        let mut reader = BufReader::with_capacity(1024 * 1024, file);
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];

        loop {
            let n = reader.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        let hash_bytes = hasher.finalize();
        Ok(format!("{:x}", hash_bytes))
    }

    /// Generates a complete fingerprint for a target file.
    pub fn fingerprint<P: AsRef<Path>>(path: P) -> Result<FileFingerprint, InstallerError> {
        let path_ref = path.as_ref();
        let metadata = fs::metadata(path_ref)?;
        let size = metadata.len();

        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let sha256 = Self::compute_sha256(path_ref)?;

        Ok(FileFingerprint {
            size,
            mtime_ms,
            sha256,
        })
    }

    /// Reads and deserializes backup metadata from disk.
    pub fn read_meta<P: AsRef<Path>>(path: P) -> Option<BackupMeta> {
        let path_ref = path.as_ref();
        if !path_ref.exists() {
            return None;
        }

        let content = fs::read_to_string(path_ref).ok()?;
        serde_json::from_str(&content).ok()
    }

    /// Persists backup metadata formatted as pretty JSON.
    pub fn write_meta<P: AsRef<Path>>(path: P, meta: &BackupMeta) -> Result<(), InstallerError> {
        let json = serde_json::to_string_pretty(meta)?;
        fs::write(path.as_ref(), json)?;
        Ok(())
    }

    /// Constructs a new BackupMeta instance from the specified source file.
    pub fn create_meta_from_source<P: AsRef<Path>>(source_path: P) -> Result<BackupMeta, InstallerError> {
        let source = Self::fingerprint(source_path)?;
        let recorded_at = Utc::now().to_rfc3339();
        Ok(BackupMeta { source, recorded_at })
    }

    /// Determines whether the existing backup is stale due to an upstream client update.
    /// Invalidation condition: `current_asar` size or SHA-256 diverges from `meta.source`.
    pub fn is_backup_stale<P: AsRef<Path>, Q: AsRef<Path>>(
        meta_path: P,
        current_asar_path: Q,
    ) -> bool {
        let current_path = current_asar_path.as_ref();
        if !current_path.exists() {
            return false;
        }

        let meta = match Self::read_meta(meta_path) {
            Some(m) => m,
            None => return true, // Missing metadata indicates unverifiable backup
        };

        let current_meta = match fs::metadata(current_path) {
            Ok(m) => m,
            Err(_) => return false,
        };

        // Fast path: size divergence immediately invalidates backup
        if current_meta.len() != meta.source.size {
            return true;
        }

        // Full check: verify SHA-256 checksum
        match Self::compute_sha256(current_path) {
            Ok(hash) => hash != meta.source.sha256,
            Err(_) => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backup_meta_json_serialization() {
        let meta = BackupMeta {
            source: FileFingerprint {
                size: 156428231,
                mtime_ms: 1729123456789,
                sha256: "4a5b6c7d8e9f".to_string(),
            },
            recorded_at: "2026-11-02T12:00:00.000Z".to_string(),
        };

        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("mtimeMs"));
        assert!(json.contains("156428231"));

        let deserialized: BackupMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, meta);
    }
}
