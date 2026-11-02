use std::path::Path;

use crate::error::AsarError;
pub use crate::writer::{AsarWriter, PackOptions, PackStats};

/// High-level function to pack a directory into an ASAR archive.
pub fn pack_dir<P: AsRef<Path>, Q: AsRef<Path>>(
    src_dir: P,
    output_asar: Q,
    options: Option<&PackOptions>,
) -> Result<PackStats, AsarError> {
    let default_options = PackOptions::default();
    let opts = options.unwrap_or(&default_options);
    AsarWriter::pack(src_dir, output_asar, opts)
}
