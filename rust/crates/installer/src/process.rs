use std::collections::HashSet;
use std::path::Path;
use std::time::{Duration, Instant};

use crate::error::InstallerError;

/// Runtime information describing an Antigravity process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: u32,
    pub exe_name: String,
    pub has_window: bool,
    pub is_sidecar: bool,
    pub command_line: Option<String>,
}

/// Evaluates whether a process is a headless sidecar based on invariants.
/// Must satisfy all 3 conditions:
/// 1. `has_window == false`
/// 2. Command line does NOT contain `--type=`
/// 3. Command line contains `register_loader.js`, `sidecar_sdk`, or `--import=`
pub fn is_sidecar_process(has_window: bool, cmdline: Option<&str>) -> bool {
    if has_window {
        return false;
    }

    match cmdline {
        Some(cmd) => {
            let lower = cmd.to_lowercase();
            if lower.contains("--type=") {
                return false;
            }

            lower.contains("register_loader.js")
                || lower.contains("sidecar_sdk")
                || lower.contains("--import=")
        }
        None => false, // Fail-safe: if command line cannot be inspected, do not classify as sidecar
    }
}

pub struct ProcessManager;

#[cfg(windows)]
mod win32_impl {
    use super::*;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{
        CloseHandle, BOOL, FALSE, HANDLE, HWND, INVALID_HANDLE_VALUE, LPARAM, TRUE,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, TerminateProcess,
        PROCESS_TERMINATE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, WM_CLOSE,
    };

    struct WindowEnumState {
        target_pid: u32,
        found_visible_window: bool,
    }

    unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut WindowEnumState);
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut process_id);

        if process_id == state.target_pid && IsWindowVisible(hwnd) != FALSE {
            state.found_visible_window = true;
            return FALSE; // Stop enumerating
        }

        TRUE
    }

    /// Checks if a process owns any visible top-level window.
    pub fn has_visible_window(pid: u32) -> bool {
        let mut state = WindowEnumState {
            target_pid: pid,
            found_visible_window: false,
        };

        unsafe {
            EnumWindows(
                Some(enum_window_callback),
                &mut state as *mut WindowEnumState as LPARAM,
            );
        }

        state.found_visible_window
    }

    /// Enumerates all running processes using ToolHelp32Snapshot.
    pub fn get_process_snapshot() -> Result<Vec<(u32, u32, String)>, InstallerError> {
        let snapshot: HANDLE = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(InstallerError::Win32(
                "CreateToolhelp32Snapshot failed".into(),
            ));
        }

        let mut entries = Vec::new();
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        unsafe {
            if Process32FirstW(snapshot, &mut entry) != FALSE {
                loop {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe_name = OsString::from_wide(&entry.szExeFile[..len])
                        .to_string_lossy()
                        .into_owned();

                    entries.push((entry.th32ProcessID, entry.th32ParentProcessID, exe_name));

                    if Process32NextW(snapshot, &mut entry) == FALSE {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);
        }

        Ok(entries)
    }

    /// Terminates a process cleanly without tree-kill.
    pub fn terminate_single_process(pid: u32) -> Result<(), InstallerError> {
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
            if handle.is_null() {
                return Err(InstallerError::Win32(format!(
                    "Failed to open process PID {} for termination",
                    pid
                )));
            }

            let res = TerminateProcess(handle, 1);
            CloseHandle(handle);

            if res == FALSE {
                return Err(InstallerError::Win32(format!(
                    "TerminateProcess failed for PID {}",
                    pid
                )));
            }
        }
        Ok(())
    }

    /// Sends WM_CLOSE to all top-level windows belonging to the given PID.
    pub fn send_wm_close(pid: u32) {
        unsafe extern "system" fn close_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let target_pid = lparam as u32;
            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut process_id);

            if process_id == target_pid && IsWindowVisible(hwnd) != FALSE {
                PostMessageW(hwnd, WM_CLOSE, 0, 0);
            }
            TRUE
        }

        unsafe {
            EnumWindows(Some(close_callback), pid as LPARAM);
        }
    }

    pub fn current_pid() -> u32 {
        unsafe { GetCurrentProcessId() }
    }
}

impl ProcessManager {
    /// Lists all active Antigravity processes with window and sidecar classifications.
    pub fn list_antigravity_processes() -> Result<Vec<ProcessInfo>, InstallerError> {
        #[cfg(windows)]
        {
            let snapshot = win32_impl::get_process_snapshot()?;
            let mut results = Vec::new();

            for (pid, parent_pid, exe_name) in snapshot {
                if exe_name.eq_ignore_ascii_case("Antigravity.exe") {
                    let has_window = win32_impl::has_visible_window(pid);
                    // On Windows, command line can be retrieved or sidecar inferred
                    let is_sidecar = is_sidecar_process(has_window, None);

                    results.push(ProcessInfo {
                        pid,
                        parent_pid,
                        exe_name,
                        has_window,
                        is_sidecar,
                        command_line: None,
                    });
                }
            }

            Ok(results)
        }
        #[cfg(not(windows))]
        {
            Ok(Vec::new())
        }
    }

    /// Returns true if any main IDE process (non-sidecar Antigravity.exe) is currently running.
    pub fn is_ide_running() -> Result<bool, InstallerError> {
        let processes = Self::list_antigravity_processes()?;
        Ok(processes.iter().any(|p| !p.is_sidecar))
    }

    /// Builds a protected set of ancestor PIDs up to `max_depth` (default 64)
    /// to avoid killing parent runners or shells.
    pub fn get_ancestor_pids(max_depth: usize) -> Result<HashSet<u32>, InstallerError> {
        #[cfg(windows)]
        {
            let snapshot = win32_impl::get_process_snapshot()?;
            let parent_map: std::collections::HashMap<u32, u32> = snapshot
                .into_iter()
                .map(|(pid, ppid, _)| (pid, ppid))
                .collect();

            let mut ancestors = HashSet::new();
            let mut current = win32_impl::current_pid();
            ancestors.insert(current);

            for _ in 0..max_depth {
                if let Some(&parent) = parent_map.get(&current) {
                    if parent == 0 || parent == current || ancestors.contains(&parent) {
                        break;
                    }
                    ancestors.insert(parent);
                    current = parent;
                } else {
                    break;
                }
            }

            Ok(ancestors)
        }
        #[cfg(not(windows))]
        {
            Ok(HashSet::new())
        }
    }

    /// Terminates residual sidecar processes while strictly respecting ancestor protection
    /// and avoiding recursive tree kills.
    pub fn kill_residual_sidecars() -> Result<usize, InstallerError> {
        #[cfg(windows)]
        {
            let ancestors = Self::get_ancestor_pids(64)?;
            let processes = Self::list_antigravity_processes()?;
            let mut killed = 0;

            for proc in processes {
                if proc.is_sidecar && !ancestors.contains(&proc.pid) {
                    if win32_impl::terminate_single_process(proc.pid).is_ok() {
                        killed += 1;
                    }
                }
            }

            Ok(killed)
        }
        #[cfg(not(windows))]
        {
            Ok(0)
        }
    }

    /// Requests a graceful shutdown of active IDE instances via WM_CLOSE.
    /// Polls until all IDE processes terminate or the timeout expires.
    pub fn graceful_close(timeout_secs: u64) -> Result<bool, InstallerError> {
        #[cfg(windows)]
        {
            let ide_procs: Vec<u32> = Self::list_antigravity_processes()?
                .into_iter()
                .filter(|p| !p.is_sidecar)
                .map(|p| p.pid)
                .collect();

            if ide_procs.is_empty() {
                return Ok(true);
            }

            for &pid in &ide_procs {
                win32_impl::send_wm_close(pid);
            }

            let start = Instant::now();
            let timeout = Duration::from_secs(timeout_secs);

            while start.elapsed() < timeout {
                std::thread::sleep(Duration::from_millis(500));
                if !Self::is_ide_running()? {
                    return Ok(true);
                }
            }

            Ok(false)
        }
        #[cfg(not(windows))]
        {
            Ok(true)
        }
    }

    /// Relaunches the Antigravity IDE executable in the background.
    pub fn relaunch<P: AsRef<Path>>(exe_path: P) -> Result<(), InstallerError> {
        let path = exe_path.as_ref();
        if !path.exists() {
            return Err(InstallerError::Env(format!(
                "Executable not found at {}",
                path.display()
            )));
        }

        std::process::Command::new(path)
            .spawn()
            .map_err(InstallerError::Io)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sidecar_decision_logic() {
        // UI window active -> never sidecar
        assert!(!is_sidecar_process(true, Some("register_loader.js")));

        // Electron renderer child process (--type=renderer) -> never sidecar
        assert!(!is_sidecar_process(
            false,
            Some("--type=renderer register_loader.js")
        ));

        // Sidecar signature present with no UI window
        assert!(is_sidecar_process(
            false,
            Some("C:\\app\\Antigravity.exe register_loader.js")
        ));
        assert!(is_sidecar_process(
            false,
            Some("Antigravity.exe --import=./loader.js")
        ));
        assert!(is_sidecar_process(
            false,
            Some("Antigravity.exe sidecar_sdk worker")
        ));

        // Unrecognized args -> fail safe, not a sidecar
        assert!(!is_sidecar_process(false, Some("Antigravity.exe --unknown")));
        assert!(!is_sidecar_process(false, None));
    }
}
