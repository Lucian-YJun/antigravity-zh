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

    /// Returns the associated `.unpacked` sibling directory for this archive.
    /// If the primary path does not exist and the archive ends with `.orig` (e.g. `app.asar.orig`),
    /// automatically falls back to checking `<name>.unpacked` (e.g. `app.asar.unpacked`).
    pub fn unpacked_dir(&self) -> PathBuf {
        let mut s = self.source_path.as_os_str().to_os_string();
        s.push(".unpacked");
        let primary = PathBuf::from(s);
        if primary.exists() {
            return primary;
        }

        let path_str = self.source_path.to_string_lossy();
        if path_str.ends_with(".orig") {
            let trimmed = &path_str[..path_str.len() - 5];
            let fallback = PathBuf::from(format!("{}.unpacked", trimmed));
            if fallback.exists() {
                return fallback;
            }
        }

        primary
    }

    /// Lists all files contained within the archive.
    pub fn list_files(&self) -> Vec<FileEntryInfo> {
        self.header.list_entries()
    }

    /// Reads a file from the archive as a zero-copy byte slice.
    pub fn read_file(&self, internal_path: &str) -> Result<&[u8], AsarError> {
        match self.header.find_node(internal_path) {
            Some(AsarNode::File { unpacked: true, .. }) => Err(AsarError::NotFound(format!(
                "File '{}' is stored unpacked; use extract_file or read from .unpacked directory",
                internal_path
            ))),
            Some(AsarNode::File { size, offset, .. }) => {
                let off = offset.unwrap_or(0);
                let start = self.payload_base_offset
                    .checked_add(off as usize)
                    .ok_or_else(|| AsarError::InvalidHeader("Start offset arithmetic overflow".into()))?;
                let end = start
                    .checked_add(*size as usize)
                    .ok_or_else(|| AsarError::InvalidHeader("End offset arithmetic overflow".into()))?;

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
        if Path::new(internal_path).components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(AsarError::InvalidPath(format!(
                "Path traversal attempt blocked: {}",
                internal_path
            )));
        }

        let dest = dest_path.as_ref();
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }

        match self.header.find_node(internal_path) {
            Some(AsarNode::File { unpacked: true, size, .. }) => {
                let clean = internal_path.replace('\\', "/");
                let unpacked_src = self.unpacked_dir().join(clean.trim_start_matches('/'));
                if !unpacked_src.exists() {
                    return Err(AsarError::NotFound(format!(
                        "Unpacked file missing at {}",
                        unpacked_src.display()
                    )));
                }
                fs::copy(&unpacked_src, dest)?;
                Ok(*size)
            }
            Some(AsarNode::File { .. }) => {
                let data = self.read_file(internal_path)?;
                fs::write(dest, data)?;
                Ok(data.len() as u64)
            }
            Some(AsarNode::Directory { .. }) => Err(AsarError::NotFound(format!(
                "Path '{}' is a directory, not a file",
                internal_path
            ))),
            None => Err(AsarError::NotFound(internal_path.to_string())),
        }
    }

    /// Extracts all files in parallel to the specified target directory.
    pub fn extract_all<P: AsRef<Path>>(&self, dest_dir: P) -> Result<ExtractionStats, AsarError> {
        let dest_root = dest_dir.as_ref();
        fs::create_dir_all(dest_root)?;

        let entries = self.list_files();

        // Sanitize path components to prevent path traversal (Zip Slip)
        for entry in &entries {
            if entry.path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
                return Err(AsarError::InvalidPath(format!(
                    "Path traversal attempt blocked: {}",
                    entry.path.display()
                )));
            }
        }

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
        let unpacked_base = self.unpacked_dir();

        // Parallel extraction using Rayon
        entries.par_iter().try_for_each(|entry| -> Result<(), AsarError> {
            let relative_str = entry.path.to_string_lossy();
            let target_file_path = dest_root.join(&entry.path);

            if let Some(p) = target_file_path.parent() {
                fs::create_dir_all(p)?;
            }

            if entry.unpacked {
                let unpacked_src = unpacked_base.join(&entry.path);
                if unpacked_src.exists() {
                    fs::copy(&unpacked_src, &target_file_path)?;
                } else {
                    return Err(AsarError::NotFound(format!(
                        "Unpacked file missing: {}",
                        unpacked_src.display()
                    )));
                }
            } else {
                let start = self.payload_base_offset
                    .checked_add(entry.offset as usize)
                    .ok_or_else(|| AsarError::InvalidHeader("Start offset arithmetic overflow".into()))?;
                let end = start
                    .checked_add(entry.size as usize)
                    .ok_or_else(|| AsarError::InvalidHeader("End offset arithmetic overflow".into()))?;

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
                fs::write(&target_file_path, slice)?;
            }

            Ok(())
        })?;

        Ok(ExtractionStats {
            total_files,
            total_directories: 0,
            total_bytes,
        })
    }
}
