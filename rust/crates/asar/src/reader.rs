use std::collections::HashSet;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use rayon::prelude::*;

use crate::error::AsarError;
use crate::header::{parse_header, AsarHeader, AsarNode, FileEntryInfo};

/// Statistics recorded during archive extraction.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ExtractionStats {
    pub total_files: usize,
    pub total_directories: usize,
    pub total_bytes: u64,
}

/// Zero-copy memory-mapped reader for Electron ASAR archives.
pub struct AsarReader {
    mmap: memmap2::Mmap,
    header: AsarHeader,
    payload_base_offset: usize,
    source_path: PathBuf,
}

impl AsarReader {
    /// Opens an ASAR archive from the filesystem and maps its contents into memory.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, AsarError> {
        let path_buf = path.as_ref().to_path_buf();
        let file = File::open(&path_buf)?;
        let mmap = unsafe { memmap2::Mmap::map(&file)? };

        let (header, payload_base_offset) = parse_header(&mmap)?;

        Ok(Self {
            mmap,
            header,
            payload_base_offset,
            source_path: path_buf,
        })
    }

    /// Returns a reference to the parsed ASAR header.
    pub fn header(&self) -> &AsarHeader {
        &self.header
    }

    /// Returns the source archive path.
    pub fn source_path(&self) -> &Path {
        &self.source_path
    }

    /// Lists all files contained within the archive.
    pub fn list_files(&self) -> Vec<FileEntryInfo> {
        self.header.list_entries()
    }

    /// Reads a file from the archive as a zero-copy byte slice.
    pub fn read_file(&self, internal_path: &str) -> Result<&[u8], AsarError> {
        match self.header.find_node(internal_path) {
            Some(AsarNode::File { size, offset, .. }) => {
                let start = self.payload_base_offset + (*offset as usize);
                let end = start + (*size as usize);

                if end > self.mmap.len() {
                    return Err(AsarError::InvalidHeader(format!(
                        "File entry '{}' (range {}..{}) extends past archive EOF (len {})",
                        internal_path,
                        start,
                        end,
                        self.mmap.len()
                    )));
                }

                Ok(&self.mmap[start..end])
            }
            Some(AsarNode::Directory { .. }) => Err(AsarError::NotFound(format!(
                "Path '{}' is a directory, not a file",
                internal_path
            ))),
            None => Err(AsarError::NotFound(internal_path.to_string())),
        }
    }

    /// Extracts a single internal file to the specified destination path.
    pub fn extract_file<P: AsRef<Path>>(
        &self,
        internal_path: &str,
        dest_path: P,
    ) -> Result<u64, AsarError> {
        let data = self.read_file(internal_path)?;
        let dest = dest_path.as_ref();

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(dest, data)?;
        Ok(data.len() as u64)
    }

    /// Extracts all files in parallel to the specified target directory.
    pub fn extract_all<P: AsRef<Path>>(&self, dest_dir: P) -> Result<ExtractionStats, AsarError> {
        let dest_root = dest_dir.as_ref();
        fs::create_dir_all(dest_root)?;

        let entries = self.list_files();
        let mut dirs_to_create = HashSet::new();

        for entry in &entries {
            if let Some(parent) = entry.path.parent() {
                if parent != Path::new("") {
                    dirs_to_create.insert(dest_root.join(parent));
                }
            }
        }

        for dir in dirs_to_create {
            fs::create_dir_all(&dir)?;
        }

        let total_files = entries.len();
        let total_bytes: u64 = entries.iter().map(|e| e.size).sum();

        // Parallel extraction using Rayon
        entries.par_iter().try_for_each(|entry| -> Result<(), AsarError> {
            let relative_str = entry.path.to_string_lossy();
            let target_file_path = dest_root.join(&entry.path);

            let start = self.payload_base_offset + (entry.offset as usize);
            let end = start + (entry.size as usize);

            if end > self.mmap.len() {
                return Err(AsarError::InvalidHeader(format!(
                    "Entry '{}' bounds {}..{} exceed archive size {}",
                    relative_str,
                    start,
                    end,
                    self.mmap.len()
                )));
            }

            let slice = &self.mmap[start..end];
            if let Some(p) = target_file_path.parent() {
                fs::create_dir_all(p)?;
            }

            fs::write(&target_file_path, slice)?;
            Ok(())
        })?;

        Ok(ExtractionStats {
            total_files,
            total_directories: 0,
            total_bytes,
        })
    }
}
