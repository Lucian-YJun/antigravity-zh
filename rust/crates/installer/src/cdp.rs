use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;
use serde::Deserialize;

use crate::env;
use crate::error::InstallerError;

#[derive(Debug, Clone, Deserialize)]
pub struct CdpTarget {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub target_type: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub websocket_debugger_url: Option<String>,
}

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
        let port: u16 = first_line.trim().parse().ok()?;
        if port > 0 {
            Some(port)
        } else {
            None
        }
    }

    /// Verifies if a given host is a secure loopback address.
    pub fn is_loopback(host: &str) -> bool {
        let trimmed = host.trim().trim_start_matches('[').trim_end_matches(']');
        matches!(trimmed, "127.0.0.1" | "localhost" | "::1")
    }

    /// Checks if a page target URL qualifies for localization hot-sync.
    pub fn is_valid_target_url(url: &str) -> bool {
        if url.starts_with("file://") {
            return true;
        }
        if let Some(rest) = url.strip_prefix("plugin://") {
            return rest.starts_with("antigravity-");
        }
        let rest = if let Some(r) = url.strip_prefix("http://") {
            r
        } else if let Some(r) = url.strip_prefix("https://") {
            r
        } else {
            return false;
        };

        let host_part = rest.split('/').next().unwrap_or("");
        let host = if host_part.starts_with('[') {
            if let Some(end) = host_part.find(']') {
                &host_part[..=end]
            } else {
                host_part
            }
        } else {
            host_part.split(':').next().unwrap_or("")
        };
        Self::is_loopback(host)
    }


    /// Parses a WebSocket debugger URL into (host, port, path).
    pub fn parse_ws_url(url: &str) -> Option<(String, u16, String)> {
        let rest = if let Some(s) = url.strip_prefix("ws://") {
            s
        } else if let Some(s) = url.strip_prefix("wss://") {
            s
        } else {
            return None;
        };

        let (host_port, path) = match rest.find('/') {
            Some(idx) => (&rest[..idx], &rest[idx..]),
            None => (rest, "/"),
        };

        let (host, port_str) = match host_port.rfind(':') {
            Some(idx) => (&host_port[..idx], &host_port[idx + 1..]),
            None => return None,
        };

        let port: u16 = port_str.parse().ok()?;
        Some((host.to_string(), port, path.to_string()))
    }

    /// Verifies if the debugger URL belongs to the expected loopback host and port.
    pub fn is_trusted_debugger_url(ws_url: &str, port: u16) -> bool {
        if let Some((host, p, _)) = Self::parse_ws_url(ws_url) {
            Self::is_loopback(&host) && p == port
        } else {
            false
        }
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

        let content = fs::read_to_string(path)?;
        let dict_value: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| InstallerError::Env(format!("Failed to parse dictionary JSON: {}", e)))?;

        // 1. Discover active targets from CDP HTTP endpoint
        let raw_targets = match http_get(port, "/json") {
            Ok(body) => body,
            Err(_) => return Ok(0),
        };

        let targets: Vec<CdpTarget> = match serde_json::from_str(&raw_targets) {
            Ok(t) => t,
            Err(_) => return Ok(0),
        };

        let matching_pages: Vec<CdpTarget> = targets
            .into_iter()
            .filter(|t| {
                t.target_type.as_deref() == Some("page")
                    && t.url.as_ref().map(|u| Self::is_valid_target_url(u)).unwrap_or(false)
                    && t.websocket_debugger_url
                        .as_ref()
                        .map(|u| Self::is_trusted_debugger_url(u, port))
                        .unwrap_or(false)
            })
            .collect();

        if matching_pages.is_empty() {
            return Ok(0);
        }

        let rev = chrono::Utc::now().timestamp_millis();
        let code = format!(
            "(function() {{ if (window.__antigravityZh && window.__antigravityZh.setData) {{ window.__antigravityZh.setData({}, {}); window.__antigravityZh.retranslate(); return true; }} return false; }})()",
            dict_value, rev
        );

        let mut success_count = 0;
        for page in matching_pages {
            if let Some(ws_url) = page.websocket_debugger_url {
                if let Some((host, p, path)) = Self::parse_ws_url(&ws_url) {
                    if let Ok(true) = ws_evaluate(&host, p, &path, &code) {
                        success_count += 1;
                    }
                }
            }
        }

        Ok(success_count)
    }
}

fn http_get(port: u16, path: &str) -> Result<String, InstallerError> {
    let addr_str = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect_timeout(
        &addr_str.parse().map_err(|e| InstallerError::Env(format!("Socket parse: {}", e)))?,
        Duration::from_millis(3000),
    )?;

    stream.set_read_timeout(Some(Duration::from_millis(3000)))?;
    stream.set_write_timeout(Some(Duration::from_millis(3000)))?;

    let req = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
        path, port
    );
    stream.write_all(req.as_bytes())?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;

    let resp_str = String::from_utf8_lossy(&response);
    if let Some(pos) = resp_str.find("\r\n\r\n") {
        let headers = &resp_str[..pos];
        if headers.starts_with("HTTP/1.1 200") || headers.starts_with("HTTP/1.0 200") {
            return Ok(resp_str[pos + 4..].to_string());
        }
    }

    Err(InstallerError::Env("CDP HTTP non-200 or malformed response".into()))
}

struct WsReader<'a> {
    stream: &'a mut TcpStream,
    buffer: Vec<u8>,
    cursor: usize,
}

impl<'a> WsReader<'a> {
    fn new(stream: &'a mut TcpStream, initial: Vec<u8>) -> Self {
        Self {
            stream,
            buffer: initial,
            cursor: 0,
        }
    }

    fn read_exact(&mut self, buf: &mut [u8]) -> std::io::Result<()> {
        let mut needed = buf.len();
        let mut out_offset = 0;

        let available = self.buffer.len() - self.cursor;
        if available > 0 {
            let to_copy = available.min(needed);
            buf[..to_copy].copy_from_slice(&self.buffer[self.cursor..self.cursor + to_copy]);
            self.cursor += to_copy;
            needed -= to_copy;
            out_offset += to_copy;
        }

        if needed > 0 {
            self.stream.read_exact(&mut buf[out_offset..])?;
        }

        Ok(())
    }
}

fn ws_evaluate(host: &str, port: u16, path: &str, code: &str) -> Result<bool, InstallerError> {
    let addr_str = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect_timeout(
        &addr_str.parse().map_err(|e| InstallerError::Env(format!("Socket parse: {}", e)))?,
        Duration::from_millis(3000),
    )?;

    stream.set_read_timeout(Some(Duration::from_millis(3000)))?;
    stream.set_write_timeout(Some(Duration::from_millis(3000)))?;

    // 1. Handshake
    let handshake = format!(
        "GET {} HTTP/1.1\r\nHost: {}:{}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
        path, host, port
    );
    stream.write_all(handshake.as_bytes())?;

    let mut buf = [0u8; 1024];
    let mut handshake_resp = Vec::new();
    let end_of_headers = loop {
        let n = stream.read(&mut buf)?;
        if n == 0 {
            return Ok(false);
        }
        handshake_resp.extend_from_slice(&buf[..n]);
        if let Some(pos) = handshake_resp.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos + 4;
        }
    };
    let handshake_str = String::from_utf8_lossy(&handshake_resp[..end_of_headers]);
    if !handshake_str.contains("101 Switching Protocols") && !handshake_str.contains("HTTP/1.1 101") {
        return Ok(false);
    }

    let unconsumed = handshake_resp[end_of_headers..].to_vec();

    // 2. Format CDP Runtime.evaluate request
    let eval_payload = serde_json::json!({
        "id": 999,
        "method": "Runtime.evaluate",
        "params": {
            "expression": code,
            "returnByValue": true
        }
    });
    let payload_bytes = serde_json::to_vec(&eval_payload)?;

    // 3. Send masked WebSocket frame (RFC 6455)
    let len = payload_bytes.len();
    let mut frame = Vec::new();
    frame.push(0x81); // FIN + text opcode

    let mask_key: [u8; 4] = [0x41, 0x47, 0x59, 0x5A]; // "AGYZ"
    if len < 126 {
        frame.push(0x80 | (len as u8));
    } else if len <= 65535 {
        frame.push(0x80 | 126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(0x80 | 127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }
    frame.extend_from_slice(&mask_key);

    for (i, &b) in payload_bytes.iter().enumerate() {
        frame.push(b ^ mask_key[i % 4]);
    }
    stream.write_all(&frame)?;

    // 4. Read response frame(s) with WsReader
    let mut reader = WsReader::new(&mut stream, unconsumed);
    loop {
        let mut header = [0u8; 2];
        if reader.read_exact(&mut header).is_err() {
            return Ok(false);
        }
        let opcode = header[0] & 0x0F;
        let masked = (header[1] & 0x80) != 0;
        let mut payload_len = (header[1] & 0x7F) as usize;

        if payload_len == 126 {
            let mut len_bytes = [0u8; 2];
            reader.read_exact(&mut len_bytes)?;
            payload_len = u16::from_be_bytes(len_bytes) as usize;
        } else if payload_len == 127 {
            let mut len_bytes = [0u8; 8];
            reader.read_exact(&mut len_bytes)?;
            payload_len = u64::from_be_bytes(len_bytes) as usize;
        }

        let mask = if masked {
            let mut m = [0u8; 4];
            reader.read_exact(&mut m)?;
            Some(m)
        } else {
            None
        };

        let mut body = vec![0u8; payload_len];
        reader.read_exact(&mut body)?;

        if let Some(m) = mask {
            for (i, b) in body.iter_mut().enumerate() {
                *b ^= m[i % 4];
            }
        }

        if opcode == 0x9 {
            // Ping frame: reply with Pong frame (opcode 0xA)
            let mut pong = vec![0x8A, 0x80];
            let mask = [0x50, 0x4F, 0x4E, 0x47];
            pong.extend_from_slice(&mask);
            reader.stream.write_all(&pong)?;
            continue;
        }

        if opcode == 0x8 {
            // Close frame
            return Ok(false);
        }

        if opcode == 0x1 {
            // Text frame: check if this message responds to our eval request
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&body) {
                if val.get("id").and_then(|id| id.as_i64()) == Some(999) {
                    return Ok(val["result"]["result"]["value"].as_bool() == Some(true));
                }
            }
        }
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

    #[test]
    fn test_ws_url_parsing_and_trusted_debugger() {
        assert!(CdpClient::is_trusted_debugger_url(
            "ws://127.0.0.1:9222/devtools/page/abc-123",
            9222
        ));
        assert!(CdpClient::is_trusted_debugger_url(
            "ws://localhost:9222/devtools/page/xyz",
            9222
        ));
        assert!(!CdpClient::is_trusted_debugger_url(
            "ws://127.0.0.1:9223/devtools/page/xyz",
            9222
        ));
        assert!(!CdpClient::is_trusted_debugger_url(
            "ws://attacker.com:9222/devtools/page/xyz",
            9222
        ));
    }

    #[test]
    fn test_cdp_sync_dictionary_roundtrip_with_mock_server() {
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let handle = std::thread::spawn(move || {
            // First connection: HTTP GET /json
            let (mut stream, _) = listener.accept().unwrap();
            let mut req_buf = [0u8; 1024];
            let n = stream.read(&mut req_buf).unwrap();
            let req_str = String::from_utf8_lossy(&req_buf[..n]);
            assert!(req_str.contains("GET /json HTTP/1.1"));

            let targets_json = format!(
                r#"[{{
                    "type": "page",
                    "url": "file:///C:/app/index.html",
                    "webSocketDebuggerUrl": "ws://127.0.0.1:{}/devtools/page/test1"
                }}]"#,
                port
            );

            let http_resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                targets_json.len(),
                targets_json
            );
            stream.write_all(http_resp.as_bytes()).unwrap();
            drop(stream);

            // Second connection: WebSocket to /devtools/page/test1
            let (mut ws_stream, _) = listener.accept().unwrap();
            let mut ws_req_buf = [0u8; 1024];
            let n = ws_stream.read(&mut ws_req_buf).unwrap();
            let ws_req_str = String::from_utf8_lossy(&ws_req_buf[..n]);
            assert!(ws_req_str.contains("Upgrade: websocket"));

            let ws_resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n";
            ws_stream.write_all(ws_resp.as_bytes()).unwrap();

            // Read client's masked frame
            let mut header = [0u8; 2];
            ws_stream.read_exact(&mut header).unwrap();
            let mut len = (header[1] & 0x7F) as usize;
            if len == 126 {
                let mut ext = [0u8; 2];
                ws_stream.read_exact(&mut ext).unwrap();
                len = u16::from_be_bytes(ext) as usize;
            }
            let mut mask = [0u8; 4];
            ws_stream.read_exact(&mut mask).unwrap();
            let mut payload = vec![0u8; len];
            ws_stream.read_exact(&mut payload).unwrap();
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= mask[i % 4];
            }

            let payload_str = String::from_utf8_lossy(&payload);
            assert!(payload_str.contains("Runtime.evaluate"));
            assert!(payload_str.contains("__antigravityZh"));

            // Respond with success JSON frame: {"id":999,"result":{"result":{"type":"boolean","value":true}}}
            let eval_resp = br#"{"id":999,"result":{"result":{"type":"boolean","value":true}}}"#;
            let mut resp_frame = Vec::new();
            resp_frame.push(0x81);
            resp_frame.push(eval_resp.len() as u8);
            resp_frame.extend_from_slice(eval_resp);
            ws_stream.write_all(&resp_frame).unwrap();
        });

        let tmp = std::env::temp_dir().join(format!("cdp-dict-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let dict_file = tmp.join("cockpit-zh.json");
        fs::write(&dict_file, b"{\"dict\": {\"Hello\": \"\xE4\xBD\xA0\xE5\xA5\xBD\"}}").unwrap();

        let updated = CdpClient::sync_dictionary(&dict_file, port).expect("sync dictionary");
        assert_eq!(updated, 1, "Should successfully synchronize 1 target");

        handle.join().unwrap();
        let _ = fs::remove_dir_all(&tmp);
    }
}
