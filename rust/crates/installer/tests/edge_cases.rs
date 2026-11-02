use antigravity_installer::{is_sidecar_process, BackupManager, CdpClient};
use std::fs;

#[test]
fn test_sidecar_decision_exhaustive_matrix() {
    // Invariant 1: has_window == true is NEVER a sidecar
    assert!(!is_sidecar_process(true, Some("register_loader.js")));
    assert!(!is_sidecar_process(true, Some("sidecar_sdk")));
    assert!(!is_sidecar_process(true, Some("--import=./patch.js")));
    assert!(!is_sidecar_process(true, Some("Antigravity.exe")));

    // Invariant 2: --type= in command line is NEVER a sidecar
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe --type=renderer register_loader.js")
    ));
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe --type=gpu-process sidecar_sdk")
    ));
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe --type=utility --import=./foo.js")
    ));
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe --type=crashpad-handler")
    ));

    // Invariant 3: Genuine sidecars matching any of the 3 signature strings
    assert!(is_sidecar_process(
        false,
        Some("Antigravity.exe register_loader.js")
    ));
    assert!(is_sidecar_process(
        false,
        Some("C:\\Programs\\Antigravity\\Antigravity.exe REGISTER_LOADER.JS --port=1234")
    ));
    assert!(is_sidecar_process(
        false,
        Some("Antigravity.exe sidecar_sdk daemon")
    ));
    assert!(is_sidecar_process(
        false,
        Some("Antigravity.exe Sidecar_SDK")
    ));
    assert!(is_sidecar_process(
        false,
        Some("Antigravity.exe --import=./loader.js")
    ));
    assert!(is_sidecar_process(
        false,
        Some("Antigravity.exe --IMPORT=C:\\path\\loader.js")
    ));

    // Invariant 4: Fail-safe protection on missing or non-sidecar command lines
    assert!(!is_sidecar_process(false, None));
    assert!(!is_sidecar_process(false, Some("")));
    assert!(!is_sidecar_process(false, Some("Antigravity.exe")));
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe --unknown-flag")
    ));
    assert!(!is_sidecar_process(
        false,
        Some("Antigravity.exe register_loader.txt")
    ));
}

#[test]
fn test_loopback_and_target_security_vectors() {
    // Valid loopbacks
    assert!(CdpClient::is_loopback("127.0.0.1"));
    assert!(CdpClient::is_loopback("localhost"));
    assert!(CdpClient::is_loopback("::1"));
    assert!(CdpClient::is_loopback("[::1]"));

    // Attack vectors / non-loopbacks
    assert!(!CdpClient::is_loopback("127.0.0.2"));
    assert!(!CdpClient::is_loopback("0.0.0.0"));
    assert!(!CdpClient::is_loopback("192.168.1.1"));
    assert!(!CdpClient::is_loopback("10.0.0.1"));
    assert!(!CdpClient::is_loopback("localhost.evil.com"));
    assert!(!CdpClient::is_loopback("evil.com"));
    assert!(!CdpClient::is_loopback(""));

    // Valid target URLs
    assert!(CdpClient::is_valid_target_url("file:///C:/Users/app/index.html"));
    assert!(CdpClient::is_valid_target_url("plugin://antigravity-chat/index.html"));
    assert!(CdpClient::is_valid_target_url("plugin://antigravity-workbench/view.html"));
    assert!(CdpClient::is_valid_target_url("http://127.0.0.1:9222/view"));
    assert!(CdpClient::is_valid_target_url("http://localhost:3000/"));

    // Invalid target URLs
    assert!(!CdpClient::is_valid_target_url("https://google.com"));
    assert!(!CdpClient::is_valid_target_url("http://192.168.1.1:8080"));
    assert!(!CdpClient::is_valid_target_url("plugin://other-plugin/index.html"));
    assert!(!CdpClient::is_valid_target_url("plugin://antigravity/not-matching-prefix"));
    assert!(!CdpClient::is_valid_target_url("javascript:alert(1)"));
}

#[test]
fn test_backup_metadata_and_stale_detection_matrix() {
    let tmp = std::env::temp_dir().join(format!("agy-installer-test-meta-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).expect("create temp dir");

    let current_asar = tmp.join("app.asar");
    let meta_path = tmp.join("app.asar.orig.meta.json");

    // Case 1: Missing current file -> false (not stale)
    assert!(!BackupManager::is_backup_stale(&meta_path, &current_asar));

    // Case 2: Current file exists, but metadata file is missing -> true (stale / unverifiable)
    fs::write(&current_asar, b"v1 content").expect("write asar");
    assert!(BackupManager::is_backup_stale(&meta_path, &current_asar));

    // Case 3: Metadata valid and matching current file -> false (NOT stale)
    let meta = BackupManager::create_meta_from_source(&current_asar).expect("create meta");
    BackupManager::write_meta(&meta_path, &meta).expect("write meta");
    assert!(!BackupManager::is_backup_stale(&meta_path, &current_asar));

    // Case 4: File size changed (fast path invalidation) -> true (stale)
    fs::write(&current_asar, b"v2 content is longer").expect("modify asar length");
    assert!(BackupManager::is_backup_stale(&meta_path, &current_asar));

    // Case 5: File size matches original, but sha256 changed -> true (stale)
    // "v1 content" is 10 bytes. Let's write another 10 bytes: "v1 modified"
    fs::write(&current_asar, b"v1 xxxxxxx").expect("same size different content");
    assert_eq!(fs::metadata(&current_asar).unwrap().len(), 10);
    assert_eq!(meta.source.size, 10);
    assert!(BackupManager::is_backup_stale(&meta_path, &current_asar));

    // Case 6: Restore exact content -> valid again
    fs::write(&current_asar, b"v1 content").expect("restore exact content");
    assert!(!BackupManager::is_backup_stale(&meta_path, &current_asar));

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_compute_sha256_boundaries() {
    let tmp = std::env::temp_dir().join(format!("agy-installer-test-sha-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).expect("create temp dir");

    // Empty file (0 bytes)
    let empty_file = tmp.join("empty.bin");
    fs::write(&empty_file, b"").expect("write empty");
    let sha_empty = BackupManager::compute_sha256(&empty_file).expect("sha256 empty");
    assert_eq!(
        sha_empty,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    // 1 MB file (exact buffer capacity boundary)
    let one_mb_file = tmp.join("1mb.bin");
    let one_mb_data = vec![0x41u8; 1024 * 1024];
    fs::write(&one_mb_file, &one_mb_data).expect("write 1mb");
    let sha_1mb = BackupManager::compute_sha256(&one_mb_file).expect("sha256 1mb");
    assert_eq!(sha_1mb.len(), 64);

    let _ = fs::remove_dir_all(&tmp);
}
