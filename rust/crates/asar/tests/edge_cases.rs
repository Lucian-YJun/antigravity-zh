use antigravity_asar::{matches_unpack_glob, parse_header, serialize_header, AsarError, AsarHeader, AsarNode};

#[test]
fn test_asar_empty_archive_roundtrip() {
    let header = AsarHeader::new();
    let bytes = serialize_header(&header).expect("serialize empty header");
    let (parsed, offset) = parse_header(&bytes).expect("parse empty header");

    assert_eq!(offset, bytes.len());
    assert!(parsed.files.is_empty());
    assert!(parsed.list_entries().is_empty());
}

#[test]
fn test_asar_empty_file_serialization() {
    let mut header = AsarHeader::new();
    header
        .insert_file("zero_size.txt", 0, 0, false, false)
        .expect("insert zero size file");
    header
        .insert_file("nested/empty.bin", 0, 0, true, false)
        .expect("insert nested empty file");

    let bytes = serialize_header(&header).expect("serialize header with empty files");
    let (parsed, offset) = parse_header(&bytes).expect("parse header with empty files");

    assert_eq!(offset, bytes.len());
    let entries = parsed.list_entries();
    assert_eq!(entries.len(), 2);

    let node1 = parsed.find_node("zero_size.txt");
    assert!(node1.is_some());
    if let Some(AsarNode::File { size, offset, executable, unpacked, .. }) = node1 {
        assert_eq!(*size, 0);
        assert_eq!(*offset, Some(0));
        assert_eq!(*executable, false);
        assert_eq!(*unpacked, false);
    } else {
        panic!("Expected File node for zero_size.txt");
    }

    let node2 = parsed.find_node("nested/empty.bin");
    assert!(node2.is_some());
    if let Some(AsarNode::File { size, offset, executable, unpacked, .. }) = node2 {
        assert_eq!(*size, 0);
        assert_eq!(*offset, Some(0));
        assert_eq!(*executable, true);
        assert_eq!(*unpacked, false);
    } else {
        panic!("Expected File node for nested/empty.bin");
    }
}

#[test]
fn test_asar_unicode_and_complex_paths() {
    let mut header = AsarHeader::new();

    // Chinese characters
    header
        .insert_file("dist/中文目录/界面配置.json", 1234, 0, false, false)
        .expect("insert Chinese path");

    // Japanese & Korean
    header
        .insert_file("locales/日本語/メイン.js", 5678, 1234, false, false)
        .expect("insert Japanese path");
    header
        .insert_file("locales/한국어/메인.js", 9012, 6912, false, false)
        .expect("insert Korean path");

    // Emojis and multi-byte unicode
    header
        .insert_file("assets/🚀_launch/icon_👨‍👩‍👧‍👦.png", 4096, 15924, false, false)
        .expect("insert Emoji path");

    // Spaces and special symbols
    header
        .insert_file("spaced dir/my config & settings.json", 512, 20020, false, false)
        .expect("insert spaced path");

    let bytes = serialize_header(&header).expect("serialize complex unicode header");
    let (parsed, offset) = parse_header(&bytes).expect("parse complex unicode header");

    assert_eq!(offset, bytes.len());

    assert!(parsed.find_node("dist/中文目录/界面配置.json").is_some());
    assert!(parsed.find_node("locales/日本語/メイン.js").is_some());
    assert!(parsed.find_node("locales/한국어/메인.js").is_some());
    assert!(parsed.find_node("assets/🚀_launch/icon_👨‍👩‍👧‍👦.png").is_some());
    assert!(parsed.find_node("spaced dir/my config & settings.json").is_some());

    let entries = parsed.list_entries();
    assert_eq!(entries.len(), 5);
}

#[test]
fn test_asar_path_boundary_and_conflict_errors() {
    let mut header = AsarHeader::new();

    // Empty path
    assert!(matches!(
        header.insert_file("", 10, 0, false, false),
        Err(AsarError::InvalidPath(_))
    ));
    assert!(matches!(
        header.insert_file("///", 10, 0, false, false),
        Err(AsarError::InvalidPath(_))
    ));
    assert!(matches!(
        header.insert_file("\\\\\\", 10, 0, false, false),
        Err(AsarError::InvalidPath(_))
    ));

    // Path conflict: file as directory
    header
        .insert_file("a/b.js", 100, 0, false, false)
        .expect("insert a/b.js");
    let conflict_err = header.insert_file("a/b.js/c.js", 50, 100, false, false);
    assert!(
        matches!(&conflict_err, Err(AsarError::InvalidPath(msg)) if msg.contains("Path conflict")),
        "Expected Path conflict error, got {:?}",
        conflict_err
    );
}

#[test]
fn test_asar_malformed_pickle_headers() {
    // Shorter than 16 bytes
    for len in 0..16 {
        let truncated = vec![0u8; len];
        assert!(matches!(
            parse_header(&truncated),
            Err(AsarError::InvalidHeader(_))
        ));
    }

    // Offset indicator != 4
    let mut bad_indicator = vec![0u8; 32];
    bad_indicator[0..4].copy_from_slice(&5u32.to_le_bytes());
    assert!(matches!(
        parse_header(&bad_indicator),
        Err(AsarError::InvalidHeader(_))
    ));

    // json_len exceeds buffer
    let mut overflow_len = vec![0u8; 20];
    overflow_len[0..4].copy_from_slice(&4u32.to_le_bytes());
    overflow_len[4..8].copy_from_slice(&100u32.to_le_bytes());
    overflow_len[8..12].copy_from_slice(&96u32.to_le_bytes());
    overflow_len[12..16].copy_from_slice(&1000u32.to_le_bytes()); // json_len = 1000
    assert!(matches!(
        parse_header(&overflow_len),
        Err(AsarError::InvalidHeader(_))
    ));

    // Corrupted JSON content
    let bad_json = b"{\"files\": { not_valid_json";
    let mut bad_json_buf = Vec::new();
    bad_json_buf.extend_from_slice(&4u32.to_le_bytes());
    bad_json_buf.extend_from_slice(&((bad_json.len() as u32) + 8).to_le_bytes());
    bad_json_buf.extend_from_slice(&((bad_json.len() as u32) + 4).to_le_bytes());
    bad_json_buf.extend_from_slice(&(bad_json.len() as u32).to_le_bytes());
    bad_json_buf.extend_from_slice(bad_json);
    assert!(matches!(
        parse_header(&bad_json_buf),
        Err(AsarError::InvalidHeader(_))
    ));
}

#[test]
fn test_asar_unpacked_pack_and_extract() {
    let tmp = std::env::temp_dir().join(format!("asar-test-unpacked-{}", std::process::id()));
    let src = tmp.join("src");
    let asar_file = tmp.join("app.asar");
    let dest = tmp.join("dest");

    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(src.join("sub")).unwrap();
    std::fs::write(src.join("packed.txt"), b"packed data").unwrap();
    std::fs::write(src.join("sub/binary.node"), b"native binary data").unwrap();

    let opts = antigravity_asar::PackOptions {
        unpack_globs: vec!["*.node".to_string()],
    };
    antigravity_asar::pack_dir(&src, &asar_file, Some(&opts)).expect("pack asar with unpack glob");

    assert!(asar_file.exists());
    let unpacked_dir = tmp.join("app.asar.unpacked");
    assert!(unpacked_dir.exists(), "app.asar.unpacked directory should be created");
    assert!(unpacked_dir.join("sub/binary.node").exists(), "unpacked binary should be copied");

    let reader = antigravity_asar::AsarReader::open(&asar_file).expect("open asar");
    let entries = reader.list_files();
    let bin_entry = entries.iter().find(|e| e.path == std::path::Path::new("sub/binary.node")).expect("find binary entry");
    assert!(bin_entry.unpacked, "binary entry should be marked unpacked");

    let stats = reader.extract_all(&dest).expect("extract asar");
    assert_eq!(stats.total_files, 2);
    assert_eq!(std::fs::read(dest.join("packed.txt")).unwrap(), b"packed data");
    assert_eq!(std::fs::read(dest.join("sub/binary.node")).unwrap(), b"native binary data");

    let _ = std::fs::remove_dir_all(&tmp);
}

#[test]
fn test_matches_unpack_glob_precision() {
    // Glob "test" must not match substring "latest.js"
    assert!(!matches_unpack_glob("test", "dist/latest.js"));
    assert!(!matches_unpack_glob("test", "test_file.js"));
    assert!(matches_unpack_glob("test", "test"));
    assert!(matches_unpack_glob("test", "test/file.js"));

    // Glob "*.node" matches any file ending with .node
    assert!(matches_unpack_glob("*.node", "a.node"));
    assert!(matches_unpack_glob("*.node", "sub/dir/native.node"));
    assert!(!matches_unpack_glob("*.node", "native.node.bak"));
    assert!(!matches_unpack_glob("*.node", "native.js"));

    // Directory glob "node_modules"
    assert!(matches_unpack_glob("node_modules", "node_modules/pkg/index.js"));
    assert!(!matches_unpack_glob("node_modules", "my_node_modules.js"));

    // Wildcard glob "build/**/*.node"
    assert!(matches_unpack_glob("build/**/*.node", "build/native/module.node"));
    assert!(!matches_unpack_glob("build/**/*.node", "src/module.node"));
}

#[test]
fn test_asar_unpacked_fallback_from_orig() {
    let tmp = std::env::temp_dir().join(format!("asar-test-orig-fallback-{}", std::process::id()));
    let src = tmp.join("src");
    let asar_file = tmp.join("app.asar");
    let asar_orig = tmp.join("app.asar.orig");
    let dest = tmp.join("dest");

    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(src.join("native")).unwrap();
    std::fs::write(src.join("bundle.js"), b"bundle payload").unwrap();
    std::fs::write(src.join("native/addon.node"), b"addon payload").unwrap();

    let opts = antigravity_asar::PackOptions {
        unpack_globs: vec!["*.node".to_string()],
    };
    antigravity_asar::pack_dir(&src, &asar_file, Some(&opts)).expect("pack asar");

    // Simulate patch installation: app.asar renamed to app.asar.orig,
    // while app.asar.unpacked remains named app.asar.unpacked
    std::fs::rename(&asar_file, &asar_orig).expect("rename asar to orig");
    assert!(!asar_file.exists());
    assert!(asar_orig.exists());
    assert!(tmp.join("app.asar.unpacked").exists());
    assert!(!tmp.join("app.asar.orig.unpacked").exists());

    // AsarReader opening app.asar.orig should fall back to app.asar.unpacked
    let reader = antigravity_asar::AsarReader::open(&asar_orig).expect("open orig asar");
    let stats = reader.extract_all(&dest).expect("extract all from orig asar");

    assert_eq!(stats.total_files, 2);
    assert_eq!(std::fs::read(dest.join("bundle.js")).unwrap(), b"bundle payload");
    assert_eq!(std::fs::read(dest.join("native/addon.node")).unwrap(), b"addon payload");

    let _ = std::fs::remove_dir_all(&tmp);
}

