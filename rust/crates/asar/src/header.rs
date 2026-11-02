use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

use crate::error::AsarError;

/// Root directory structure of an ASAR archive.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AsarHeader {
    pub files: HashMap<String, AsarNode>,
}

impl AsarHeader {
    /// Creates a new empty header.
    pub fn new() -> Self {
        Self {
            files: HashMap::new(),
        }
    }

    /// Recursively lists all file entries with their relative paths, sizes, and offsets.
    pub fn list_entries(&self) -> Vec<FileEntryInfo> {
        let mut entries = Vec::new();
        Self::collect_entries(&self.files, Path::new(""), &mut entries);
        entries
    }

    fn collect_entries(
        nodes: &HashMap<String, AsarNode>,
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
                        offset: *offset,
                        executable: *executable,
                        unpacked: *unpacked,
                    });
                }
            }
        }
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
                    if i == segments.len() - 1 {
                        return Some(file);
                    } else {
                        return None;
                    }
                }
                None => return None,
            }
        }

        None
    }

    /// Inserts a file entry into the tree hierarchy at the specified slash-delimited relative path.
    pub fn insert_file(
        &mut self,
        relative_path: &str,
        size: u64,
        offset: u64,
        executable: bool,
        unpacked: bool,
    ) -> Result<(), AsarError> {
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
        for i in 0..segments.len() - 1 {
            let seg = segments[i].to_string();
            current_map = match current_map
                .entry(seg)
                .or_insert_with(|| AsarNode::Directory {
                    files: HashMap::new(),
                }) {
                AsarNode::Directory { files } => files,
                AsarNode::File { .. } => {
                    return Err(AsarError::InvalidPath(format!(
                        "Path conflict: intermediate segment '{}' is a file",
                        segments[i]
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
                integrity: None,
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

/// An entry in the ASAR archive tree, either a directory or a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum AsarNode {
    Directory {
        files: HashMap<String, AsarNode>,
    },
    File {
        size: u64,
        #[serde(
            default,
            deserialize_with = "deserialize_offset",
            serialize_with = "serialize_offset"
        )]
        offset: u64,
        #[serde(default)]
        executable: bool,
        #[serde(default)]
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

    let payload_base_offset = 16 + json_len;
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
    let aligned_offset = 8 + payload_size;
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
    let json_len = json_bytes.len() as u32;

    // Pickle string payload structure:
    // payload_size = json_len + 8
    // pickle_str_len = json_len + 4
    let payload_size = json_len + 8;
    let pickle_str_len = json_len + 4;

    let mut buffer = Vec::with_capacity(16 + json_bytes.len());
    buffer.extend_from_slice(&4u32.to_le_bytes());
    buffer.extend_from_slice(&payload_size.to_le_bytes());
    buffer.extend_from_slice(&pickle_str_len.to_le_bytes());
    buffer.extend_from_slice(&json_len.to_le_bytes());
    buffer.extend_from_slice(&json_bytes);

    Ok(buffer)
}

fn deserialize_offset<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    struct OffsetVisitor;

    impl<'de> de::Visitor<'de> for OffsetVisitor {
        type Value = u64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or integer offset value")
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
            Ok(v)
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
            Ok(v as u64)
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            v.parse::<u64>().map_err(de::Error::custom)
        }
    }

    deserializer.deserialize_any(OffsetVisitor)
}

fn serialize_offset<S>(offset: &u64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&offset.to_string())
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
            assert_eq!(*offset, 0);
        } else {
            panic!("Expected file node");
        }
    }
}
