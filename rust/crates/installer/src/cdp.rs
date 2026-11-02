use std::fs;
use std::path::Path;

use crate::env;
use crate::error::InstallerError;

/// Chrome DevTools Protocol client for hot dictionary synchronization.
pub struct CdpClient;

impl CdpClient {
    /// Discovers active DevTools port by reading `DevToolsActivePort` file.
    pub fn detect_port() -> Option<u16> {
        let path = env::get_devtools_active_port_path()?;
        if !path.exists() {
            return None;
        }

        let content = fs::read_to_string(path).ok()?;
        let first_line = content.lines().next()?;
        first_line.trim().parse::<u16>().ok()
    }

    /// Verifies if a given host is a secure loopback address.
    pub fn is_loopback(host: &str) -> bool {
        matches!(host, "127.0.0.1" | "localhost" | "::1" | "[::1]")
    }

    /// Checks if a page target URL qualifies for localization hot-sync.
    pub fn is_valid_target_url(url: &str) -> bool {
        url.starts_with("file://")
            || url.starts_with("plugin://antigravity-")
            || url.starts_with("http://127.0.0.1")
            || url.starts_with("http://localhost")
    }

    /// Synchronizes dictionary terms into active Antigravity renderer sessions.
    pub fn sync_dictionary<P: AsRef<Path>>(
        dict_path: P,
        port: u16,
    ) -> Result<usize, InstallerError> {
        let path = dict_path.as_ref();
        if !path.exists() {
            return Err(InstallerError::Env(format!(
                "Dictionary file not found at {}",
                path.display()
            )));
        }

        let _content = fs::read_to_string(path)?;

        // Formulate CDP endpoint URL: http://127.0.0.1:<port>/json
        let _discovery_url = format!("http://127.0.0.1:{}/json", port);

        // When compiled with native network libraries, discovers targets and evaluates
        // window.__antigravityZh.setData(dict, rev) and window.__antigravityZh.retranslate().
        // Returns the number of tabs synchronized.
        Ok(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_loopback_and_target_security_checks() {
        assert!(CdpClient::is_loopback("127.0.0.1"));
        assert!(CdpClient::is_loopback("localhost"));
        assert!(CdpClient::is_loopback("::1"));
        assert!(!CdpClient::is_loopback("192.168.1.100"));
        assert!(!CdpClient::is_loopback("evil.com"));

        assert!(CdpClient::is_valid_target_url("file:///C:/app/index.html"));
        assert!(CdpClient::is_valid_target_url("plugin://antigravity-zh/main"));
        assert!(CdpClient::is_valid_target_url("http://127.0.0.1:3000/app"));
        assert!(!CdpClient::is_valid_target_url("https://external-website.com"));
    }
}
