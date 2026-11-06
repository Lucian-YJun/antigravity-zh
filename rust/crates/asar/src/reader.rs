use std::collections::HashSet;
use std::fs::{self, File};
use std::path::{Component, Path, PathBuf};
use rayon::prelude::*;

use crate::error::AsarError;
use crate::header::{parse_header, AsarHeader, AsarNode, FileEntryInfo};

/// Validates that an archive-relative path can only descend below the
/// extraction root. ASAR header keys are attacker-controlled strings: on
/// Windows a leading `/`, a drive prefix (`C:\...`), a drive-relative prefix
/// (`C:foo`) or a UNC prefix (`\\server\share\...`) makes `PathBuf::join`
/// discard the destination root entirely. `..` escapes via the normal
/// parent-directory component.
///
/// The header is JSON, so keys are UTF-8. Backslashes are path separators in
/// Electron/ASAR paths; normalizing them to `/` lets the same checks reject
/// Windows-style absolute paths even when the extractor runs on Unix.
///
/// Only `Normal` and harmless leading `CurDir` components are allowed. This is
/// shared by single-file extraction, bulk file entries and empty directory
/// nodes so the three code paths cannot drift apart.
fn validate_archive_relative_path(path: &Path, context: &str) -> Result<(), AsarError> {
    let raw = path.to_string_lossy().into_owned();
    let reject = |reason: &str| {
        AsarError::InvalidPath(format!(
            "Path traversal attempt blocked{}: {} ({})",
            context, raw, reason
        ))
    };

    if raw.is_empty() {
        return Err(reject("empty archive path"));
    }

    let normalized = raw.replace('\\', "/");
    let normalized_path = Path::new(&normalized);

    // Backslashes are separators, so inspect the normalized string directly:
    // a leading `/` means the path was rooted (`/abs`, `//server/share`, or
    // `\abs` after normalization). Windows' `Path::components()` can normalize
    // that root marker away when a `./` prefix is present, but `PathBuf::join`
    // still discards dest_root. `..` is caught by the component loop below.
    if normalized.starts_with('/') {
        return Err(reject("rooted path"));
    }

    for candidate in [path, normalized_path] {
        if candidate.is_absolute() {
            return Err(reject("absolute path"));
        }
        for component in candidate.components() {
            match component {
                Component::Normal(_) | Component::CurDir => {}
                Component::Prefix(_) => return Err(reject("Windows path prefix")),
                Component::RootDir => return Err(reject("rooted path")),
                Component::ParentDir => return Err(reject("parent directory")),
            }
        }
    }

    // On Unix `Path::components()` treats `C:\...` as one Normal component,
    // and a drive-relative `C:foo` has no RootDir. Reject any drive-like
    // segment so the validator is platform-independent. `//server/share` is
    // already caught by RootDir, but keep the explicit UNC check for clarity.
    if normalized.starts_with("//") {
        return Err(reject("UNC path"));
    }
    if normalized.split('/').any(|segment| {
        let bytes = segment.as_bytes();
        bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
    }) {
        return Err(reject("Windows drive prefix"));
    }

    Ok(())
}

/// Statistics recorded during archive extraction.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ExtractionStats {
    pub total_files: usize,
    /// Directory nodes recorded in the archive header, excluding the implicit root.
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
        if let Some(trimmed) = path_str.strip_suffix(".orig") {
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
        validate_archive_relative_path(Path::new(internal_path), "")?;

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

        // Sanitize path components to prevent path traversal (Zip Slip).
        // The unified validator rejects rooted paths, Windows prefixes/UNC
        // paths and parent-directory components; checking only `..` let a
        // malicious header key such as `/abs` or `C:\abs` replace dest_root.
        for entry in &entries {
            validate_archive_relative_path(&entry.path, "")?;
        }

        let mut dirs_to_create = HashSet::new();

        for entry in &entries {
            if let Some(parent) = entry.path.parent() {
                if parent != Path::new("") {
                    dirs_to_create.insert(dest_root.join(parent));
                }
            }
        }

        // Directory nodes recorded in the header but containing no files must be
        // recreated too, otherwise an empty directory vanishes on a pack→extract
        // round trip while `total_directories` still counts it. Guarded against
        // traversal for the same reason the file entries are.
        for dir in self.header.list_directories() {
            let rel = Path::new(&dir);
            validate_archive_relative_path(rel, " in directory node")?;
            if !dir.is_empty() {
                dirs_to_create.insert(dest_root.join(rel));
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
            total_directories: self.header.count_directories(),
            total_bytes,
        })
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    fn assert_rejected(path: &str) -> String {
        match validate_archive_relative_path(Path::new(path), "") {
            Err(AsarError::InvalidPath(msg)) => msg,
            other => panic!("expected InvalidPath for {path:?}, got {other:?}"),
        }
    }

    #[test]
    fn test_validate_archive_relative_path_accepts_safe_relative_paths() {
        for path in ["a/b.txt", "./a/b.txt", "中文/文件.js", "single.txt"] {
            validate_archive_relative_path(Path::new(path), "")
                .unwrap_or_else(|e| panic!("{path:?} must be accepted, got {e:?}"));
        }
    }

    #[test]
    fn test_validate_archive_relative_path_rejects_parent_directory() {
        for path in ["../escape", "a/../../escape"] {
            let msg = assert_rejected(path);
            assert!(msg.contains("parent directory"), "{path:?}: {msg}");
        }
    }

    #[test]
    fn test_validate_archive_relative_path_rejects_rooted_paths() {
        for path in ["/abs/file", "/abs", "\\abs\\file", "\\abs"] {
            let msg = assert_rejected(path);
            assert!(msg.contains("rooted path"), "{path:?}: {msg}");
        }
    }

    #[test]
    fn test_validate_archive_relative_path_rejects_windows_drive_prefixes() {
        for path in ["C:\\abs\\file", "C:foo", "Z:\\", "./C:\\abs.txt"] {
            assert_rejected(path);
        }
    }

    #[test]
    fn test_validate_archive_relative_path_rejects_unc_paths() {
        for path in ["\\\\server\\share\\file", "//server/share/file"] {
            assert_rejected(path);
        }
    }

    #[test]
    fn test_validate_archive_relative_path_rejects_empty_path() {
        let msg = assert_rejected("");
        assert!(msg.contains("empty archive path"), "{msg}");
    }
}
