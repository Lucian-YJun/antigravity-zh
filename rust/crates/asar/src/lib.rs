//! High-performance Electron ASAR archive library.
//!
//! Provides zero-copy memory-mapped reading, multi-threaded extraction,
//! and streaming archive packing following Chromium's pickle header format.

pub mod error;
pub mod extract;
pub mod header;
pub mod integrity;
pub mod pack;
pub mod reader;
pub mod writer;

pub use error::AsarError;
pub use extract::{extract_all, extract_file};
pub use header::{parse_header, serialize_header, AsarHeader, AsarNode, FileEntryInfo, IntegrityMeta};
pub use integrity::{file_integrity, BLOCK_SIZE as INTEGRITY_BLOCK_SIZE};
pub use pack::pack_dir;
pub use reader::{AsarReader, ExtractionStats};
pub use writer::{matches_unpack_glob, AsarWriter, PackOptions, PackStats};
