use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::ReplacerError;

/// A pair of strings defining a search pattern and its replacement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplacementRule {
    pub search: String,
    pub replace: String,
}

impl ReplacementRule {
    pub fn new<S: Into<String>, R: Into<String>>(search: S, replace: R) -> Self {
        Self {
            search: search.into(),
            replace: replace.into(),
        }
    }
}

impl<'de> Deserialize<'de> for ReplacementRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RuleFormat {
            Tuple(String, String),
            Struct { search: String, replace: String },
        }

        match RuleFormat::deserialize(deserializer)? {
            RuleFormat::Tuple(search, replace) => Ok(ReplacementRule { search, replace }),
            RuleFormat::Struct { search, replace } => Ok(ReplacementRule { search, replace }),
        }
    }
}

impl Serialize for ReplacementRule {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        (&self.search, &self.replace).serialize(serializer)
    }
}

/// Summary report of replacements applied to a single file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplacementSummary {
    pub scope: String,
    pub target_file: PathBuf,
    pub total_rules: usize,
    pub matched_rules: usize,
    pub modified: bool,
}

/// Loads a replacement rule set from a JSON file.
pub fn load_rules_from_file<P: AsRef<Path>>(path: P) -> Result<Vec<ReplacementRule>, ReplacerError> {
    let path_ref = path.as_ref();
    if !path_ref.exists() {
        return Err(ReplacerError::RuleNotFound(path_ref.to_path_buf()));
    }

    let content = fs::read_to_string(path_ref)?;
    load_rules_from_str(&content)
}

/// Parses replacement rules from a JSON string.
pub fn load_rules_from_str(json: &str) -> Result<Vec<ReplacementRule>, ReplacerError> {
    let rules: Vec<ReplacementRule> = serde_json::from_str(json)?;
    Ok(rules)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rules_json_parsing() {
        let json = r#"[
            ["Hello World", "你好世界"],
            ["Settings", "设置"]
        ]"#;

        let rules = load_rules_from_str(json).unwrap();
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].search, "Hello World");
        assert_eq!(rules[0].replace, "你好世界");
    }
}
