# Antigravity Rust Toolchain Workspace

Native high-performance replacement toolchain for the Antigravity Chinese localization suite.

## Architecture

This workspace is organized into four modular crates:

| Crate | Purpose | Key Capabilities |
|---|---|---|
| `crates/asar` (`antigravity-asar`) | Archive operations | Zero-copy memory mapped parsing, parallel extraction, packing with pickle header protocol |
| `crates/replacer` (`antigravity-replacer`) | String replacement engine | Single-pass $O(L)$ multi-pattern replacement using Aho-Corasick automaton |
| `crates/installer` (`antigravity-installer`) | Lifecycle & deployment | Win32 Toolhelp process detection, sidecar filtering, atomic two-phase staging, SHA-256 backup tracking |
| `crates/cli` (`antigravity-cli`) | Unified executable | Command-line interface (`antigravity-tool.exe`) for install, revert, sync, asar, and check commands |

## Compilation & Installation

When `rustc` and `cargo` are available in your environment:

```bash
# Check all workspace crates
cargo check --workspace

# Run tests
cargo test --workspace

# Build optimized release binary
cargo build --release
```

The compiled standalone executable will be located at:
`target/release/antigravity-tool.exe`
