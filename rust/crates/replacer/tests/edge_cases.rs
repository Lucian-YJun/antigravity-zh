use antigravity_replacer::{ReplacerError, ReplacementRule, StringReplacer};

#[test]
fn test_replacer_empty_rules_handling() {
    let empty_rules: Vec<ReplacementRule> = vec![];
    let res = StringReplacer::new(empty_rules);
    assert!(
        matches!(res, Err(ReplacerError::EmptyRules)),
        "Expected EmptyRules error, got {:?}",
        res.err()
    );
}

#[test]
fn test_replacer_empty_string_search_behavior() {
    // When a rule has an empty search string
    let rules = vec![ReplacementRule::new("", "prefix")];
    // Aho-Corasick in version 1.1 supports empty patterns or returns an error/behavior:
    // Let's test how StringReplacer constructs it
    let replacer_res = StringReplacer::new(rules);
    // If it succeeds or fails, let's observe the empirical outcome:
    if let Ok(replacer) = replacer_res {
        let (output, count) = replacer.apply("test");
        // In Aho-Corasick 1.1 with empty string, matches can occur at boundaries
        println!("Empty pattern match result: output='{}', count={}", output, count);
    } else {
        println!("Empty pattern rejected as error: {:?}", replacer_res.err());
    }
}

#[test]
fn test_replacer_empty_input_and_empty_replace() {
    let rules = vec![
        ReplacementRule::new("remove_me", ""),
        ReplacementRule::new("keep_me", "kept"),
    ];
    let replacer = StringReplacer::new(rules).expect("build replacer");

    // Empty input string
    let (out_empty, count_empty) = replacer.apply("");
    assert_eq!(out_empty, "");
    assert_eq!(count_empty, 0);

    // Replacement with empty string (deletion)
    let (out_del, count_del) = replacer.apply("hello remove_me world keep_me");
    assert_eq!(out_del, "hello  world kept");
    assert_eq!(count_del, 2);
}

#[test]
fn test_replacer_overlapping_rules_and_prefix_collisions() {
    // Test case 1: Prefix collision with LeftmostFirst precedence
    // When "cat" comes first:
    let rules1 = vec![
        ReplacementRule::new("cat", "FELINE"),
        ReplacementRule::new("caterpillar", "INSECT"),
    ];
    let replacer1 = StringReplacer::new(rules1).unwrap();
    let (out1, count1) = replacer1.apply("Look at the caterpillar on the tree.");
    assert_eq!(count1, 1);
    assert_eq!(out1, "Look at the FELINEerpillar on the tree.");

    // When "caterpillar" comes first:
    let rules2 = vec![
        ReplacementRule::new("caterpillar", "INSECT"),
        ReplacementRule::new("cat", "FELINE"),
    ];
    let replacer2 = StringReplacer::new(rules2).unwrap();
    let (out2, count2) = replacer2.apply("Look at the caterpillar on the tree.");
    assert_eq!(count2, 1);
    assert_eq!(out2, "Look at the INSECT on the tree.");

    // Test case 2: Suffix/prefix chain (single pass scan)
    let rules3 = vec![
        ReplacementRule::new("abc", "X"),
        ReplacementRule::new("bcd", "Y"),
        ReplacementRule::new("cde", "Z"),
    ];
    let replacer3 = StringReplacer::new(rules3).unwrap();
    let (out3, count3) = replacer3.apply("abcde");
    // "abc" matches at 0, consuming indices 0..3 ("abc"). Next search begins at index 3 ("de").
    assert_eq!(count3, 1);
    assert_eq!(out3, "Xde");

    // Test case 3: Multiple adjacent patterns
    let (out_adj, count_adj) = replacer3.apply("abcabcabc");
    assert_eq!(count_adj, 3);
    assert_eq!(out_adj, "XXX");
}

#[test]
fn test_replacer_multibyte_utf8_boundaries() {
    let rules = vec![
        ReplacementRule::new("你好", "HELLO"),
        ReplacementRule::new("世界", "WORLD"),
        ReplacementRule::new("𠮷野家", "YOSHINOYA"), // 4-byte UTF-8 char U+20BB7
        ReplacementRule::new("🚀", "ROCKET"),        // 4-byte UTF-8 emoji
        ReplacementRule::new("👨‍👩‍👧‍👦", "FAMILY"),       // Multi-codepoint emoji with ZWJ
        ReplacementRule::new("ASCII_TAG", "中文字符串"),
        ReplacementRule::new("【删除】", ""),
    ];

    let replacer = StringReplacer::new(rules).unwrap();

    let input = "测试：你好，欢迎来到𠮷野家！【删除】乘坐🚀与世界和👨‍👩‍👧‍👦一起，标记：ASCII_TAG。";
    let (output, count) = replacer.apply(input);

    assert_eq!(count, 7);
    assert_eq!(
        output,
        "测试：HELLO，欢迎来到YOSHINOYA！乘坐ROCKET与WORLD和FAMILY一起，标记：中文字符串。"
    );
}

#[test]
fn test_replacer_high_volume_stress() {
    let rules = vec![
        ReplacementRule::new("VAR_ALPHA", "localized_alpha"),
        ReplacementRule::new("VAR_BETA", "localized_beta"),
        ReplacementRule::new("VAR_GAMMA", "localized_gamma"),
    ];
    let replacer = StringReplacer::new(rules).unwrap();

    // Construct 500KB input text with 15,000 matches
    let chunk = "const a = VAR_ALPHA; const b = VAR_BETA; const c = VAR_GAMMA;\n";
    let mut large_input = String::with_capacity(chunk.len() * 5000);
    for _ in 0..5000 {
        large_input.push_str(chunk);
    }

    let start = std::time::Instant::now();
    let (output, count) = replacer.apply(&large_input);
    let elapsed = start.elapsed();

    assert_eq!(count, 15000);
    assert!(output.contains("localized_alpha"));
    assert!(!output.contains("VAR_ALPHA"));
    println!(
        "High volume replacer: 15,000 matches in {:.2}ms ({:.1} MB/s)",
        elapsed.as_secs_f64() * 1000.0,
        (large_input.len() as f64 / (1024.0 * 1024.0)) / elapsed.as_secs_f64()
    );
}

#[test]
fn test_batch_reports_every_skipped_scope_instead_of_dropping_it() {
    use antigravity_replacer::{BatchReplacer, SkipReason};

    let tmp = std::env::temp_dir().join(format!("replacer-test-batch-{}", std::process::id()));
    let rules_dir = tmp.join("rules");
    let staging = tmp.join("staging");
    let empty_staging = tmp.join("empty_staging");

    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&rules_dir).unwrap();
    std::fs::create_dir_all(staging.join("dist")).unwrap();
    std::fs::create_dir_all(&empty_staging).unwrap();

    std::fs::write(
        rules_dir.join("utils.replacements.json"),
        r#"[["Hello","你好"]]"#,
    )
    .unwrap();
    std::fs::write(staging.join("dist").join("utils.js"), "Hello world").unwrap();

    let summaries = BatchReplacer::new(&rules_dir)
        .execute_batch(&staging, false)
        .expect("batch run");

    // 每个配置的 scope 都必须在报告里出现，不能再被静默丢掉。
    assert_eq!(summaries.len(), 7);

    let utils = summaries
        .iter()
        .find(|s| s.scope == "utils")
        .expect("utils scope reported");
    assert!(utils.skipped.is_none(), "utils was patched, not skipped");
    assert_eq!(utils.matched_rules, 1);
    assert_eq!(utils.total_rules, 1);
    assert!(utils.modified);
    assert_eq!(
        std::fs::read_to_string(staging.join("dist").join("utils.js")).unwrap(),
        "你好 world"
    );

    let skipped: Vec<_> = summaries.iter().filter(|s| s.skipped.is_some()).collect();
    assert_eq!(skipped.len(), 6);
    for summary in &skipped {
        assert!(
            matches!(summary.skipped, Some(SkipReason::RulesMissing(_))),
            "missing rule file should be reported as RulesMissing, got {:?}",
            summary.skipped
        );
        assert_eq!(summary.matched_rules, 0);
        assert_eq!(summary.total_rules, 0);
    }

    // 规则文件在、staging 里的目标文件没了（上游改名）——必须报 TargetMissing。
    let second_run = BatchReplacer::new(&rules_dir)
        .execute_batch(&empty_staging, true)
        .expect("batch run on empty staging");
    let utils_missing = second_run
        .iter()
        .find(|s| s.scope == "utils")
        .expect("utils scope reported");
    assert!(
        matches!(utils_missing.skipped, Some(SkipReason::TargetMissing(_))),
        "expected TargetMissing, got {:?}",
        utils_missing.skipped
    );

    let _ = std::fs::remove_dir_all(&tmp);
}
