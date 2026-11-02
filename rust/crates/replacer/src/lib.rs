//! High-performance string pattern replacement engine.
//!
//! Replaces sequential O(N*L) string replacements with a single-pass O(L)
//! Aho-Corasick automaton scan.

pub mod automaton;
pub mod engine;
pub mod error;
pub mod rules;

pub use automaton::{BatchReplacer, StringReplacer};
pub use error::ReplacerError;
pub use rules::{
    load_rules_from_file, load_rules_from_str, ReplacementRule, ReplacementSummary,
};
