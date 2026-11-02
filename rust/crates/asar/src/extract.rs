use std::path::Path;

use crate::error::AsarError;
pub use crate::reader::{AsarReader, ExtractionStats};

/// High-level function to extract an entire ASAR archive into a destination directory.
pub fn extract_all<P: AsRef<Path>, Q: AsRef<Path>>(
    archive_path: P,
    dest_dir: Q,
) -> Result<ExtractionStats, AsarError> {
    let reader = AsarReader::open(archive_path)?;
    reader.extract_all(dest_dir)
}

/// High-level function to extract a single file from an ASAR archive.
pub fn extract_file<P: AsRef<Path>, Q: AsRef<Path>>(
    archive_path: P,
    internal_path: &str,
    dest_file: Q,
) -> Result<u64, AsarError> {
    let reader = AsarReader::open(archive_path)?;
    reader.extract_file(internal_path, dest_file)
}
