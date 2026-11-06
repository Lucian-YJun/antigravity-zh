use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

use crate::error::AsarError;

/// Root directory structure of an ASAR archive.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AsarHeader {
    pub files: BTreeMap<String, AsarNode>,
}

impl AsarHeader {
    /// Creates a new empty header.
    pub fn new() -> Self {
        Self {
            files: BTreeMap::new(),
        }
    }

    /// Recursively lists all file entries with their relative paths, sizes, and offsets.
    pub fn list_entries(&self) -> Vec<FileEntryInfo> {
        let mut entries = Vec::new();
        Self::collect_entries(&self.files, Path::new(""), &mut entries);
        entries
    }

    fn collect_entries(
        nodes: &BTreeMap<String, AsarNode>,
        parent_path: &Path,
        out: &mut Vec<FileEntryInfo>,
    ) {
        for (name, node) in nodes {
            let current_path = parent_path.join(name);
            match node {
                AsarNode::Directory { files } => {
                    Self::collect_entries(files, &current_path, out);
                }
                AsarNode::File {
                    size,
                    offset,
                    executable,
                    unpacked,
                    ..
                } => {
                    out.push(FileEntryInfo {
                        path: current_path,
                        size: *size,
                        offset: offset.unwrap_or(0),
                        executable: *executable,
                        unpacked: *unpacked,
                    });
                }
            }
        }
    }

    /// Counts the directory nodes recorded in the archive tree, excluding the
    /// implicit root. Empty directories that asar stored as bare directory nodes
    /// are included, since they exist in the header regardless of file entries.
    pub fn count_directories(&self) -> usize {
        Self::collect_directory_count(&self.files)
    }

    fn collect_directory_count(nodes: &BTreeMap<String, AsarNode>) -> usize {
        nodes
            .values()
            .map(|node| match node {
                AsarNode::Directory { files } => 1 + Self::collect_directory_count(files),
                AsarNode::File { .. } => 0,
            })
            .sum()
    }

    /// Lists every directory node recorded in the tree as a slash-delimited path,
    /// excluding the implicit root. Empty directories are included.
    pub fn list_directories(&self) -> Vec<String> {
        let mut out = Vec::new();
        Self::collect_directory_paths(&self.files, String::new(), &mut out);
        out
    }

    fn collect_directory_paths(
        nodes: &BTreeMap<String, AsarNode>,
        prefix: String,
        out: &mut Vec<String>,
    ) {
        for (name, node) in nodes {
            if let AsarNode::Directory { files } = node {
                let path = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", prefix, name)
                };
                out.push(path.clone());
                Self::collect_directory_paths(files, path, out);
            }
        }
    }

    /// Records a directory node, creating any intermediate segments as needed.
    ///
    /// Inserting file entries only ever creates the *intermediate* segments of a
    /// file path, so a directory that contains no files would never reach the
    /// header. `@electron/asar` records it as `{"files":{}}` (verified by diffing
    /// both headers for the same tree), so this is required for format parity.
    pub fn insert_directory(&mut self, relative_path: &str) -> Result<(), AsarError> {
        let clean = relative_path.replace('\\', "/");
        let segments: Vec<&str> = clean
            .trim_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        if segments.is_empty() {
            return Ok(());
        }

        let mut current_map = &mut self.files;
        for seg in segments {
            let key = seg.to_string();
            current_map = match current_map
                .entry(key)
                .or_insert_with(|| AsarNode::Directory {
                    files: BTreeMap::new(),
                }) {
                AsarNode::Directory { files } => files,
                AsarNode::File { .. } => {
                    return Err(AsarError::InvalidPath(format!(
                        "Path conflict: '{}' is already a file, cannot be a directory",
                        seg
                    )));
                }
            };
        }
        Ok(())
    }

    /// Finds a node within the tree using a relative slash-delimited path.
    pub fn find_node(&self, internal_path: &str) -> Option<&AsarNode> {
        let clean = internal_path.replace('\\', "/");
        let segments: Vec<&str> = clean
            .trim_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        if segments.is_empty() {
            return None;
        }

        let mut current_map = &self.files;
        for (i, segment) in segments.iter().enumerate() {
            match current_map.get(*segment) {
                Some(AsarNode::Directory { files }) => {
                    if i == segments.len() - 1 {
                        return current_map.get(*segment);
                    }
                    current_map = files;
                }
                Some(file @ AsarNode::File { .. }) => {
                    return if i == segments.len() - 1 { Some(file) } else { None };
                }
                None => return None,
            }
        }

        None
    }

    /// Inserts a file entry into the tree hierarchy at the specified slash-delimited relative path.
    pub fn insert_file<O: Into<Option<u64>>>(
        &mut self,
        relative_path: &str,
        size: u64,
        offset: O,
        executable: bool,
        unpacked: bool,
    ) -> Result<(), AsarError> {
        self.insert_file_with_integrity(relative_path, size, offset, executable, unpacked, None)
    }

    /// Inserts a file entry together with its integrity metadata.
    ///
    /// Passing a computed [`IntegrityMeta`] writes the same `integrity` object
    /// that `@electron/asar` emits, which keeps archives produced here
    /// format-compatible with the Node toolchain. Pass `None` to omit the field.
    pub fn insert_file_with_integrity<O: Into<Option<u64>>>(
        &mut self,
        relative_path: &str,
        size: u64,
        offset: O,
        executable: bool,
        unpacked: bool,
        integrity: Option<IntegrityMeta>,
    ) -> Result<(), AsarError> {
        let offset = offset.into();
        let clean = relative_path.replace('\\', "/");
        let segments: Vec<&str> = clean
            .trim_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        if segments.is_empty() {
            return Err(AsarError::InvalidPath("Empty path".into()));
        }

        let mut current_map = &mut self.files;
        for seg_ref in &segments[..segments.len() - 1] {
            let seg = seg_ref.to_string();
            current_map = match current_map
                .entry(seg)
                .or_insert_with(|| AsarNode::Directory {
                    files: BTreeMap::new(),
                }) {
                AsarNode::Directory { files } => files,
                AsarNode::File { .. } => {
                    return Err(AsarError::InvalidPath(format!(
                        "Path conflict: intermediate segment '{}' is a file",
                        seg_ref
                    )));
                }
            };
        }

        let file_name = segments[segments.len() - 1].to_string();
        current_map.insert(
            file_name,
            AsarNode::File {
                size,
                offset,
                executable,
                unpacked,
                integrity,
            },
        );

        Ok(())
    }
}

impl Default for AsarHeader {
    fn default() -> Self {
        Self::new()
    }
}

fn is_false(v: &bool) -> bool {
    !*v
}

/// An entry in the ASAR archive tree, either a directory or a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum AsarNode {
    Directory {
        files: BTreeMap<String, AsarNode>,
    },
    File {
        size: u64,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "deserialize_optional_offset",
            serialize_with = "serialize_optional_offset"
        )]
        offset: Option<u64>,
        #[serde(default, skip_serializing_if = "is_false")]
        executable: bool,
        #[serde(default, skip_serializing_if = "is_false")]
        unpacked: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        integrity: Option<IntegrityMeta>,
    },
}

/// Metadata verifying payload integrity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntegrityMeta {
    pub algorithm: String,
    pub hash: String,
    #[serde(rename = "blockSize", skip_serializing_if = "Option::is_none")]
    pub block_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<String>>,
}

/// Flattended file entry representation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEntryInfo {
    pub path: PathBuf,
    pub size: u64,
    pub offset: u64,
    pub executable: bool,
    pub unpacked: bool,
}

/// Parses the 16-byte Chromium Pickle header and JSON metadata.
/// Returns the parsed header and the byte offset where file payloads begin.
pub fn parse_header(bytes: &[u8]) -> Result<(AsarHeader, usize), AsarError> {
    if bytes.len() < 16 {
        return Err(AsarError::InvalidHeader(
            "Archive byte length is smaller than 16-byte pickle header".into(),
        ));
    }

    let offset_indicator = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if offset_indicator != 4 {
        return Err(AsarError::InvalidHeader(format!(
            "Invalid pickle payload offset: expected 4, got {}",
            offset_indicator
        )));
    }

    let payload_size = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    let _pickle_str_len = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    let json_len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;

    let payload_base_offset = 16usize
        .checked_add(json_len)
        .ok_or_else(|| AsarError::InvalidHeader("Integer overflow in header json length".into()))?;

    if bytes.len() < payload_base_offset {
        return Err(AsarError::InvalidHeader(format!(
            "Header JSON length ({}) exceeds total buffer size ({})",
            json_len,
            bytes.len()
        )));
    }

    let json_bytes = &bytes[16..payload_base_offset];
    let header: AsarHeader = serde_json::from_slice(json_bytes)
        .map_err(|e| AsarError::InvalidHeader(format!("JSON header parse failure: {}", e)))?;

    // Determine payload offset (4-byte aligned boundary from pickle header if padding applied)
    let aligned_offset = 8usize
        .checked_add(payload_size)
        .ok_or_else(|| AsarError::InvalidHeader("Integer overflow in payload offset".into()))?;

    let actual_payload_offset = if aligned_offset >= payload_base_offset && aligned_offset <= bytes.len() {
        aligned_offset
    } else {
        payload_base_offset
    };

    Ok((header, actual_payload_offset))
}

/// Serializes an AsarHeader into Chromium Pickle binary format.
pub fn serialize_header(header: &AsarHeader) -> Result<Vec<u8>, AsarError> {
    let json_bytes = serde_json::to_vec(header)?;
    let json_len = json_bytes.len();

    let padding = (4 - (json_len % 4)) % 4;
    let aligned_json_len = json_len + padding;

    let pickle_str_len = (aligned_json_len + 4) as u32;
    let payload_size = pickle_str_len + 4;

    let mut buffer = Vec::with_capacity(16 + aligned_json_len);
    buffer.extend_from_slice(&4u32.to_le_bytes());
    buffer.extend_from_slice(&payload_size.to_le_bytes());
    buffer.extend_from_slice(&pickle_str_len.to_le_bytes());
    buffer.extend_from_slice(&(json_len as u32).to_le_bytes());
    buffer.extend_from_slice(&json_bytes);
    buffer.resize(16 + aligned_json_len, 0);

    Ok(buffer)
}

fn deserialize_optional_offset<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptionalOffsetVisitor;

    impl<'de> de::Visitor<'de> for OptionalOffsetVisitor {
        type Value = Option<u64>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or integer offset value or null")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: Deserializer<'de>,
        {
            deserializer.deserialize_any(self)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
            Ok(Some(v as u64))
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            v.parse::<u64>().map(Some).map_err(de::Error::custom)
        }
    }

    deserializer.deserialize_any(OptionalOffsetVisitor)
}

fn serialize_optional_offset<S>(offset: &Option<u64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match offset {
        Some(val) => serializer.serialize_str(&val.to_string()),
        None => serializer.serialize_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_serialization_roundtrip() {
        let mut header = AsarHeader::new();
        header
            .insert_file("dist/index.js", 1024, 0, false, false)
            .unwrap();
        header
            .insert_file("package.json", 256, 1024, false, false)
            .unwrap();

        let serialized = serialize_header(&header).unwrap();
        let (parsed, offset) = parse_header(&serialized).unwrap();

        assert_eq!(offset, serialized.len());
        assert_eq!(parsed.files.len(), 2);

        let entries = parsed.list_entries();
        assert_eq!(entries.len(), 2);

        let node = parsed.find_node("dist/index.js");
        assert!(node.is_some());
        if let Some(AsarNode::File { size, offset, .. }) = node {
            assert_eq!(*size, 1024);
            assert_eq!(*offset, Some(0));
        } else {
            panic!("Expected file node");
        }
    }
}
