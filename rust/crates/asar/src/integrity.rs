use std::fs::File;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::error::AsarError;
use crate::header::IntegrityMeta;

/// Integrity algorithm identifier written into the header, matching
/// `node_modules/@electron/asar/lib/integrity.js` (`ALGORITHM = 'SHA256'`).
/// (The `asar` package was renamed to `@electron/asar` upstream; the Node side of
/// this repo has migrated, so the reference implementation is the renamed package.)
pub const ALGORITHM: &str = "SHA256";

/// Block size used for per-block digests, matching asar's
/// `BLOCK_SIZE = 4 * 1024 * 1024` (4 MiB).
pub const BLOCK_SIZE: usize = 4 * 1024 * 1024;

/// Read granularity while streaming; unrelated to the emitted block size.
const READ_CHUNK: usize = 64 * 1024;

fn hex_lower(digest: impl AsRef<[u8]>) -> String {
    digest
        .as_ref()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

/// Computes SHA-256 integrity metadata for one file.
///
/// Mirrors asar's `getFileIntegrity`: `hash` is the digest of the whole file,
/// `blocks` holds the digest of every `BLOCK_SIZE` slice, and the final partial
/// slice is always emitted as its own block — so an empty file yields exactly
/// one block equal to the empty-input digest.
///
/// Streaming keeps memory flat: only one chunk plus one in-flight block hasher
/// is live at a time, regardless of file size.
pub fn file_integrity<P: AsRef<Path>>(path: P) -> Result<IntegrityMeta, AsarError> {
    let mut file = File::open(path)?;

    let mut whole = Sha256::new();
    let mut block_hasher = Sha256::new();
    let mut block_filled: usize = 0;
    let mut blocks: Vec<String> = Vec::new();
    let mut buf = [0u8; READ_CHUNK];

    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }

        let chunk = &buf[..read];
        whole.update(chunk);

        let mut rest = chunk;
        while !rest.is_empty() {
            let take = (BLOCK_SIZE - block_filled).min(rest.len());
            block_hasher.update(&rest[..take]);
            block_filled += take;
            rest = &rest[take..];

            if block_filled == BLOCK_SIZE {
                blocks.push(hex_lower(block_hasher.finalize_reset()));
                block_filled = 0;
            }
        }
    }

    // asar's stream `flush` always pushes the trailing block, even when empty.
    blocks.push(hex_lower(block_hasher.finalize_reset()));

    Ok(IntegrityMeta {
        algorithm: ALGORITHM.to_string(),
        hash: hex_lower(whole.finalize_reset()),
        block_size: Some(BLOCK_SIZE as u32),
        blocks: Some(blocks),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Each test gets its own directory so the parallel test threads cannot
    /// delete each other's fixtures.
    fn fixture_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "zh-integrity-{}-{}",
            std::process::id(),
            name
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_file(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        let mut file = File::create(&path).expect("create file");
        file.write_all(bytes).expect("write file");
        file.flush().expect("flush");
        path
    }

    #[test]
    fn matches_known_sha256_vectors() {
        let dir = fixture_dir("vectors");
        // Well-known vectors, independent of this crate's packing code path.
        let path = write_file(&dir, "abc.bin", b"abc");
        let meta = file_integrity(&path).expect("integrity");
        assert_eq!(meta.algorithm, "SHA256");
        assert_eq!(
            meta.hash.as_str(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(meta.block_size, Some(BLOCK_SIZE as u32));
        // Sub-block file: exactly one block, equal to the whole-file digest.
        let blocks = meta.blocks.expect("blocks present");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0], meta.hash);

        let empty = write_file(&dir, "empty.bin", b"");
        let empty_meta = file_integrity(&empty).expect("empty integrity");
        assert_eq!(
            empty_meta.hash.as_str(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(empty_meta.blocks.expect("empty blocks").len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn splits_blocks_at_four_mebibyte_boundary() {
        let dir = fixture_dir("blocks");
        // Exactly BLOCK_SIZE bytes plus one -> two blocks, and the first block
        // must not be mistaken for the whole-file digest.
        let path = write_file(&dir, "oversize.bin", &vec![0x41u8; BLOCK_SIZE + 1]);
        let meta = file_integrity(&path).expect("oversize integrity");
        let blocks = meta.blocks.expect("blocks present");
        assert_eq!(blocks.len(), 2);
        assert_ne!(blocks[0], meta.hash);
        assert_ne!(blocks[0], blocks[1]);

        // A file of exactly one full block emits TWO blocks: asar's boundary flush
        // closes the first, then its stream `flush` appends a trailing block over
        // an empty buffer. Verified against node_modules/asar/lib/integrity.js.
        let exact = write_file(&dir, "exact.bin", &vec![0x42u8; BLOCK_SIZE]);
        let exact_meta = file_integrity(&exact).expect("exact integrity");
        let exact_blocks = exact_meta.blocks.expect("blocks");
        assert_eq!(exact_blocks.len(), 2);
        assert_eq!(
            exact_blocks[1],
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Reference digests captured from `node_modules/asar/lib/integrity.js`
    /// (asar 3.2.0) for the same two inputs. Any drift in block splitting, block
    /// order, or the trailing-block rule fails here instead of quietly producing
    /// archives that disagree with the Node toolchain.
    #[test]
    fn matches_node_asar_reference_digests() {
        let dir = fixture_dir("node-parity");

        let exact = write_file(&dir, "exact.bin", &vec![0x42u8; BLOCK_SIZE]);
        let meta = file_integrity(&exact).expect("exact integrity");
        assert_eq!(
            meta.hash,
            "5947c00ce4da5eac3e8b3731df34e42a2d7b7e88bdb7bd93b8152afcedaa2f92"
        );
        assert_eq!(
            meta.blocks.expect("blocks"),
            vec![
                "5947c00ce4da5eac3e8b3731df34e42a2d7b7e88bdb7bd93b8152afcedaa2f92".to_string(),
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            ]
        );

        let over = write_file(&dir, "over.bin", &vec![0x41u8; BLOCK_SIZE + 1]);
        let over_meta = file_integrity(&over).expect("over integrity");
        assert_eq!(
            over_meta.hash,
            "84bb4cf7bbc98ea3f4dc5196c6ecb95a7faf2a5aee73c2a0a38db9817ba9e9e1"
        );
        assert_eq!(
            over_meta.blocks.expect("blocks"),
            vec![
                "a58789e910e5f939afc433a00fef5930702927dc192cb237fd9e7449bd6ffe1d".to_string(),
                "559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd".to_string(),
            ]
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
