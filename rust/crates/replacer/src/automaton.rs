use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use aho_corasick::{AhoCorasick, MatchKind};

use crate::error::ReplacerError;
use crate::rules::{
    load_rules_from_file, load_rules_from_str, ReplacementRule, ReplacementSummary, SkipReason,
};

/// Multi-pattern string replacement engine utilizing the Aho-Corasick automaton.
pub struct StringReplacer {
    rules: Vec<ReplacementRule>,
    automaton: AhoCorasick,
}

impl StringReplacer {
    /// Constructs a replacer from a list of replacement rules.
    pub fn new(rules: Vec<ReplacementRule>) -> Result<Self, ReplacerError> {
        if rules.is_empty() {
            return Err(ReplacerError::EmptyRules);
        }

        let patterns: Vec<&str> = rules.iter().map(|r| r.search.as_str()).collect();
        let automaton = AhoCorasick::builder()
            .match_kind(MatchKind::LeftmostFirst)
            .build(&patterns)?;

        Ok(Self { rules, automaton })
    }

    /// Loads replacement rules from a JSON file and builds the automaton.
    pub fn from_json_file<P: AsRef<Path>>(path: P) -> Result<Self, ReplacerError> {
        let rules = load_rules_from_file(path)?;
        Self::new(rules)
    }

    /// Loads replacement rules from a JSON string and builds the automaton.
    pub fn from_json_str(json: &str) -> Result<Self, ReplacerError> {
        let rules = load_rules_from_str(json)?;
        Self::new(rules)
    }

    /// Returns a reference to the active rules.
    pub fn rules(&self) -> &[ReplacementRule] {
        &self.rules
    }

    /// Performs single-pass replacement across the input string.
    /// Returns the modified string and the number of matches replaced.
    pub fn apply(&self, input: &str) -> (String, usize) {
        let report = self.apply_detailed(input);
        (report.text, report.replacements)
    }

    /// Single-pass replacement with full reporting.
    ///
    /// `replacements` counts occurrences written, while `rules_hit` counts the
    /// distinct rules that matched at least once. The two differ whenever a
    /// target string occurs more than once — which PROJECT.md forbids, so
    /// `multi_match` surfaces those rule indices instead of hiding them.
    /// Mirrors `applyReplacements` in `scripts/lib/replacement-engine.js`.
    pub fn apply_detailed(&self, input: &str) -> ApplyReport {
        let mut replacements = 0usize;
        let mut hits: Vec<usize> = Vec::new();
        let mut text = String::with_capacity(input.len());

        self.automaton
            .replace_all_with(input, &mut text, |mat, _, dst| {
                replacements += 1;
                let pattern_idx = mat.pattern().as_usize();
                hits.push(pattern_idx);
                dst.push_str(&self.rules[pattern_idx].replace);
                true
            });

        let mut per_rule: BTreeMap<usize, usize> = BTreeMap::new();
        for idx in &hits {
            *per_rule.entry(*idx).or_insert(0) += 1;
        }
        let multi_match: Vec<usize> = per_rule
            .iter()
            .filter(|(_, n)| **n > 1)
            .map(|(idx, _)| *idx)
            .collect();

        ApplyReport {
            text,
            replacements,
            rules_hit: per_rule.len(),
            multi_match,
        }
    }

    /// Applies replacements directly to a file on disk.
    pub fn apply_to_file<P: AsRef<Path>>(
        &self,
        path: P,
        scope: &str,
        dry_run: bool,
    ) -> Result<ReplacementSummary, ReplacerError> {
        let target_path = path.as_ref();
        if !target_path.exists() {
            return Err(ReplacerError::TargetNotFound(target_path.to_path_buf()));
        }

        let content = fs::read_to_string(target_path)?;
        let report = self.apply_detailed(&content);
        let wrote = report.replacements > 0 && !dry_run;
        // `modified` 必须表示「磁盘上的文件真的被改了」。旧实现用
        // `replacements > 0`，于是 dry-run 也报 modified: true，与事实相反。
        let modified = wrote;

        if wrote {
            fs::write(target_path, report.text)?;
        }

        Ok(ReplacementSummary {
            scope: scope.to_string(),
            target_file: target_path.to_path_buf(),
            total_rules: self.rules.len(),
            matched_rules: report.replacements,
            rules_hit: report.rules_hit,
            multi_match: report.multi_match,
            modified,
            skipped: None,
        })
    }
}

/// Outcome of one single-pass replacement run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyReport {
    /// The rewritten text.
    pub text: String,
    /// Total occurrences replaced.
    pub replacements: usize,
    /// Distinct rules that matched at least once.
    pub rules_hit: usize,
    /// Rule indices that matched more than once (violates the unique-match contract).
    pub multi_match: Vec<usize>,
}

/// Batch replacer executing scoped replacements across an entire staging directory.
pub struct BatchReplacer {
    rules_dir: PathBuf,
    scope_targets: BTreeMap<String, String>,
}

impl BatchReplacer {
    /// Creates a new batch replacer targeting the provided native rules directory.
    pub fn new<P: AsRef<Path>>(rules_dir: P) -> Self {
        Self {
            rules_dir: rules_dir.as_ref().to_path_buf(),
            scope_targets: Self::default_targets(),
        }
    }

    /// Returns the canonical target map matching `src/native/*.replacements.json`.
    pub fn default_targets() -> BTreeMap<String, String> {
        let mut targets = BTreeMap::new();
        targets.insert("utils".to_string(), "dist/utils.js".to_string());
        targets.insert("menu".to_string(), "dist/menu.js".to_string());
        targets.insert("main".to_string(), "dist/main.js".to_string());
        targets.insert("tray".to_string(), "dist/tray.js".to_string());
        targets.insert("updater".to_string(), "dist/updater.js".to_string());
        targets.insert("ipchandlers".to_string(), "dist/ipcHandlers.js".to_string());
        targets.insert(
            "wizard".to_string(),
            "dist/ideInstall/wizardHtml.js".to_string(),
        );
        // 2.29 新增的原生 dialog / 独立 data: URL 窗口（与 Node 侧 DEFAULT_TARGETS 同步）。
        // execute_batch 按 scope 找 <scope>.replacements.json，找不到会 RulesMissing + skip，
        // 因此两侧 key 与路径必须严格一致。
        targets.insert("webauthn".to_string(), "dist/webauthn.js".to_string());
        targets.insert("cablev2".to_string(), "dist/cablev2.js".to_string());
        targets.insert("qrEncoder".to_string(), "dist/qrEncoder.js".to_string());
        targets.insert("provisionSplash".to_string(), "dist/provisionSplash.js".to_string());
        targets.insert("wsl".to_string(), "dist/wsl.js".to_string());
        targets
    }

    /// Adds or updates a target mapping.
    pub fn add_target(&mut self, scope: &str, relative_target: &str) {
        self.scope_targets
            .insert(scope.to_string(), relative_target.to_string());
    }

    /// Executes batch replacement across all configured scopes against `staging_dir`.
    pub fn execute_batch<P: AsRef<Path>>(
        &self,
        staging_dir: P,
        dry_run: bool,
    ) -> Result<Vec<ReplacementSummary>, ReplacerError> {
        let staging_root = staging_dir.as_ref();
        let mut summaries = Vec::new();

        for (scope, rel_path) in &self.scope_targets {
            let target_file = staging_root.join(rel_path);
            let rules_file = self
                .rules_dir
                .join(format!("{}.replacements.json", scope));

            if !rules_file.exists() {
                summaries.push(skipped_summary(
                    scope,
                    &target_file,
                    SkipReason::RulesMissing(rules_file.clone()),
                ));
                continue;
            }

            if !target_file.exists() {
                summaries.push(skipped_summary(
                    scope,
                    &target_file,
                    SkipReason::TargetMissing(target_file.clone()),
                ));
                continue;
            }

            let replacer = StringReplacer::from_json_file(&rules_file)?;
            let summary = replacer.apply_to_file(&target_file, scope, dry_run)?;
            summaries.push(summary);
        }

        Ok(summaries)
    }
}

/// Builds a summary for a scope that was not attempted, so the missing file
/// surfaces in the report instead of vanishing from the output.
fn skipped_summary(scope: &str, target_file: &Path, reason: SkipReason) -> ReplacementSummary {
    ReplacementSummary {
        scope: scope.to_string(),
        target_file: target_file.to_path_buf(),
        total_rules: 0,
        matched_rules: 0,
        rules_hit: 0,
        multi_match: Vec::new(),
        modified: false,
        skipped: Some(reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_pass_aho_corasick_replacement() {
        let rules = vec![
            ReplacementRule::new("apple", "pomme"),
            ReplacementRule::new("banana", "banane"),
            ReplacementRule::new("orange", "orange"),
        ];

        let replacer = StringReplacer::new(rules).unwrap();
        let input = "I have an apple, a banana, and an orange.";
        let (output, count) = replacer.apply(input);

        assert_eq!(count, 3);
        assert_eq!(output, "I have an pomme, a banane, and an orange.");
    }

    #[test]
    fn test_leftmost_longest_precedence() {
        let rules = vec![
            ReplacementRule::new("test", "A"),
            ReplacementRule::new("testing", "B"),
        ];

        let replacer = StringReplacer::new(rules).unwrap();
        let (output, count) = replacer.apply("We are testing now.");

        assert_eq!(count, 1);
        assert_eq!(output, "We are Aing now."); // LeftmostFirst selects "test"
    }
}
