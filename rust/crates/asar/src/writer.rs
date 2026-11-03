use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::error::AsarError;
use crate::header::{serialize_header, AsarHeader};

/// Options configuring ASAR packing behavior.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PackOptions {
    pub unpack_globs: Vec<String>,
}

/// Statistics recorded during archive creation.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PackStats {
    pub file_count: usize,
    pub directory_count: usize,
    pub header_size: usize,
    pub payload_size: u64,
    pub total_archive_size: u64,
}

/// Determines if a relative path matches the given unpack glob pattern.
pub fn matches_unpack_glob(glob: &str, path: &str) -> bool {
    if glob.is_empty() {
        return false;
    }
    let norm_path = path.replace('\\', "/");
    let norm_glob = glob.replace('\\', "/");

    // Exact match
    if norm_path == norm_glob {
        return true;
    }

    // Directory prefix match: e.g. "node_modules" matches "node_modules/..."
    let dir_prefix = format!("{}/", norm_glob.trim_end_matches('/'));
    if norm_path.starts_with(&dir_prefix) {
        return true;
    }

    // Extension glob fast path: e.g. "*.node" matches any file ending with ".node"
    if norm_glob.starts_with("*.") && norm_path.ends_with(&norm_glob[1..]) {
        return true;
    }

    let file_name = Path::new(&norm_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&norm_path);

    let target_to_match = if norm_glob.contains('/') {
        norm_path.as_str()
    } else {
        file_name
    };

    let mut pattern = String::from("^");
    let mut chars = norm_glob.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    pattern.push_str(".*");
                } else if norm_glob.contains('/') {
                    pattern.push_str("[^/]*");
                } else {
                    pattern.push_str(".*");
                }
            }
            '?' => {
                if norm_glob.contains('/') {
                    pattern.push_str("[^/]");
                } else {
                    pattern.push('.');
                }
            }
            '.' | '(' | ')' | '+' | '|' | '^' | '$' | '@' | '%' | '[' | ']' | '{' | '}' | '\\' => {
                pattern.push('\\');
                pattern.push(c);
            }
            _ => pattern.push(c),
        }
    }
    pattern.push('$');

    regex::Regex::new(&pattern)
        .map(|re| re.is_match(target_to_match))
        .unwrap_or(false)
}

struct CollectedFile {
    abs_path: PathBuf,
    rel_str: String,
    size: u64,
    executable: bool,
    unpacked: bool,
}

pub struct AsarWriter;

impl AsarWriter {
    /// Packs a source directory into an ASAR archive file.
    pub fn pack<P: AsRef<Path>, Q: AsRef<Path>>(
        src_dir: P,
        output_asar: Q,
        options: &PackOptions,
    ) -> Result<PackStats, AsarError> {
        let src_root = src_dir.as_ref();
        let output_path = output_asar.as_ref();

        if !src_root.exists() {
            return Err(AsarError::NotFound(src_root.display().to_string()));
        }

        let unpacked_dir = {
            let mut s = output_path.as_os_str().to_os_string();
            s.push(".unpacked");
            PathBuf::from(s)
        };

        let mut collected_files: Vec<CollectedFile> = Vec::new();
        let mut directory_count = 0;

        // Traverse source directory deterministically
        for entry in WalkDir::new(src_root).sort_by_file_name() {
            let entry = entry.map_err(|e| AsarError::Io(e.into()))?;
            let path = entry.path();

            if path == src_root {
                continue;
            }

            let rel_path = path
                .strip_prefix(src_root)
                .map_err(|_| AsarError::InvalidPath(path.display().to_string()))?;

            let rel_str = rel_path.to_string_lossy().replace('\\', "/");

            if entry.file_type().is_dir() {
                directory_count += 1;
            } else if entry.file_type().is_file() {
                let metadata = entry.metadata().map_err(|e| AsarError::Io(e.into()))?;
                let size = metadata.len();

                #[cfg(unix)]
                let executable = {
                    use std::os::unix::fs::PermissionsExt;
                    metadata.permissions().mode() & 0o111 != 0
                };
                #[cfg(not(unix))]
                let executable = false;

                let is_unpacked = options
                    .unpack_globs
                    .iter()
                    .any(|glob| matches_unpack_glob(glob, &rel_str));

                if is_unpacked {
                    let target = unpacked_dir.join(rel_path);
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::copy(path, &target)?;
                }

                collected_files.push(CollectedFile {
                    abs_path: path.to_path_buf(),
                    rel_str,
                    size,
                    executable,
                    unpacked: is_unpacked,
                });
            }
        }

        // Build header tree and assign offsets
        let mut header = AsarHeader::new();
        let mut current_offset: u64 = 0;

        for file in &collected_files {
            if file.unpacked {
                header.insert_file(&file.rel_str, file.size, None, file.executable, true)?;
            } else {
                header.insert_file(&file.rel_str, file.size, Some(current_offset), file.executable, false)?;
                current_offset += file.size;
            }
        }

        let header_bytes = serialize_header(&header)?;
        let header_size = header_bytes.len();
        let payload_size = current_offset;
        let total_archive_size = (header_size as u64) + payload_size;

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Stream header and file payloads to output file
        let out_file = File::create(output_path)?;
        let mut writer = BufWriter::with_capacity(1024 * 1024, out_file);

        writer.write_all(&header_bytes)?;

        let mut buffer = vec![0u8; 64 * 1024];
        for file in &collected_files {
            if file.unpacked {
                continue;
            }
            let opened = File::open(&file.abs_path)?;
            let mut reader = BufReader::new(opened);

            loop {
                let n = reader.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                writer.write_all(&buffer[..n])?;
            }
        }

        writer.flush()?;

        Ok(PackStats {
            file_count: collected_files.len(),
            directory_count,
            header_size,
            payload_size,
            total_archive_size,
        })
    }
}
