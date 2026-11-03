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
        PROCESS_TERMINATE, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, WM_CLOSE,
    };

    #[repr(C)]
    struct ProcessBasicInformation {
        exit_status: i32,
        _pad1: u32,
        peb_base_address: usize,
        affinity_mask: usize,
        base_priority: i32,
        _pad2: u32,
        unique_process_id: usize,
        inherited_from_unique_process_id: usize,
    }

    #[repr(C)]
    struct UnicodeString {
        length: u16,
        maximum_length: u16,
        _pad: u32,
        buffer: *const u16,
    }

    extern "system" {
        fn ReadProcessMemory(
            hprocess: HANDLE,
            lpbaseaddress: *const std::ffi::c_void,
            lpbuffer: *mut std::ffi::c_void,
            nsize: usize,
            lpnumberofbytesread: *mut usize,
        ) -> BOOL;
    }

    type NtQueryInformationProcessFn = unsafe extern "system" fn(
        HANDLE,
        u32,
        *mut std::ffi::c_void,
        u32,
        *mut u32,
    ) -> i32;

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

            if process_id == target_pid {
                PostMessageW(hwnd, WM_CLOSE, 0, 0);
            }
            TRUE
        }

        unsafe {
            EnumWindows(Some(close_callback), pid as LPARAM);
        }
    }

    pub fn get_command_line_peb(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                FALSE,
                pid,
            );
            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                return None;
            }

            struct HandleGuard(HANDLE);
            impl Drop for HandleGuard {
                fn drop(&mut self) {
                    unsafe {
                        CloseHandle(self.0);
                    }
                }
            }
            let _guard = HandleGuard(handle);

            let ntdll = windows_sys::Win32::System::LibraryLoader::GetModuleHandleA(b"ntdll.dll\0".as_ptr());
            if ntdll.is_null() {
                return None;
            }
            let proc = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                ntdll,
                b"NtQueryInformationProcess\0".as_ptr(),
            )?;
            let nt_query: NtQueryInformationProcessFn = std::mem::transmute(proc);

            let mut pbi: ProcessBasicInformation = std::mem::zeroed();
            let mut ret_len = 0u32;
            let status = nt_query(
                handle,
                0, // ProcessBasicInformation
                &mut pbi as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<ProcessBasicInformation>() as u32,
                &mut ret_len,
            );
            if status != 0 || pbi.peb_base_address == 0 {
                return None;
            }

            // In 64-bit Windows, ProcessParameters is at PEB + 0x20
            let mut proc_params_ptr: usize = 0;
            let ok = ReadProcessMemory(
                handle,
                (pbi.peb_base_address + 0x20) as *const std::ffi::c_void,
                &mut proc_params_ptr as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<usize>(),
                std::ptr::null_mut(),
            );
            if ok == FALSE || proc_params_ptr == 0 {
                return None;
            }

            // In 64-bit RTL_USER_PROCESS_PARAMETERS, CommandLine (UNICODE_STRING) is at offset 0x70
            let mut cmd_line_us: UnicodeString = std::mem::zeroed();
            let ok = ReadProcessMemory(
                handle,
                (proc_params_ptr + 0x70) as *const std::ffi::c_void,
                &mut cmd_line_us as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<UnicodeString>(),
                std::ptr::null_mut(),
            );
            if ok == FALSE || cmd_line_us.length == 0 || cmd_line_us.buffer.is_null() {
                return None;
            }

            let num_chars = (cmd_line_us.length / 2) as usize;
            if num_chars > 32768 {
                return None;
            }
            let mut buf = vec![0u16; num_chars];
            let ok = ReadProcessMemory(
                handle,
                cmd_line_us.buffer as *const std::ffi::c_void,
                buf.as_mut_ptr() as *mut std::ffi::c_void,
                cmd_line_us.length as usize,
                std::ptr::null_mut(),
            );
            if ok == FALSE {
                return None;
            }

            Some(String::from_utf16_lossy(&buf))
        }
    }

    pub fn get_command_line_powershell(pid: u32) -> Option<String> {
        let script = format!(
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (Get-CimInstance Win32_Process -Filter \"ProcessId = {}\").CommandLine",
            pid
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .ok()?;
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
        None
    }

    pub fn get_command_line(pid: u32) -> Option<String> {
        get_command_line_peb(pid).or_else(|| get_command_line_powershell(pid))
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
                    let cmdline = win32_impl::get_command_line(pid);
                    let is_sidecar = is_sidecar_process(has_window, cmdline.as_deref());

                    results.push(ProcessInfo {
                        pid,
                        parent_pid,
                        exe_name,
                        has_window,
                        is_sidecar,
                        command_line: cmdline,
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

        let mut cmd = std::process::Command::new(path);
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        if let Some(parent) = path.parent() {
            cmd.current_dir(parent);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const DETACHED_PROCESS: u32 = 0x00000008;
            cmd.creation_flags(DETACHED_PROCESS);
        }

        cmd.spawn().map_err(InstallerError::Io)?;

        Ok(())
    }

    /// Automatically relaunches Antigravity IDE given its resources directory.
    pub fn relaunch_antigravity(resources_dir: &Path) -> Result<bool, InstallerError> {
        let exe_path = resources_dir
            .parent()
            .map(|p| p.join("Antigravity.exe"))
            .unwrap_or_else(|| std::path::PathBuf::from("Antigravity.exe"));

        if exe_path.exists() {
            Self::relaunch(&exe_path)?;
            Ok(true)
        } else {
            Ok(false)
        }
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

    #[cfg(windows)]
    #[test]
    fn test_current_process_command_line_retrieval() {
        let cur_pid = std::process::id();
        let cmd = win32_impl::get_command_line(cur_pid);
        assert!(cmd.is_some(), "Should retrieve command line for current process");
    }
}
