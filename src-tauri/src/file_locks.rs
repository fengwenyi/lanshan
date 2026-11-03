use crate::file_system::{fail, Reply};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LockProcess { pub pid: u32, pub started: [u32; 2], pub name: String }

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::{ffi::c_void, fs, os::windows::ffi::OsStrExt, ptr};
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Unique { pid: u32, started: [u32; 2] }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Info { process: Unique, name: [u16; 256], service: [u16; 64], kind: u32, status: u32, session: u32, restartable: i32 }
    #[link(name = "Rstrtmgr")]
    extern "system" {
        fn RmStartSession(handle: *mut u32, flags: u32, key: *mut u16) -> u32;
        fn RmEndSession(handle: u32) -> u32;
        fn RmRegisterResources(handle: u32, count: u32, files: *const *const u16, apps: u32, processes: *const Unique, services: u32, names: *const *const u16) -> u32;
        fn RmGetList(handle: u32, needed: *mut u32, count: *mut u32, info: *mut Info, reasons: *mut u32) -> u32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn GetProcessTimes(handle: *mut c_void, created: *mut [u32; 2], exit: *mut [u32; 2], kernel: *mut [u32; 2], user: *mut [u32; 2]) -> i32;
        fn TerminateProcess(handle: *mut c_void, code: u32) -> i32;
        fn WaitForSingleObject(handle: *mut c_void, timeout: u32) -> u32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    struct Session(u32);
    impl Drop for Session { fn drop(&mut self) { unsafe { RmEndSession(self.0); } } }
    struct Handle(*mut c_void);
    impl Drop for Handle { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
    fn resources(path: &Path, files: &mut Vec<Vec<u16>>, depth: usize) -> Reply<()> {
        if depth > 64 || files.len() >= 10000 { return Err(fail("目录过大，无法完整检查占用，请缩小选择范围。")); }
        let meta = fs::symlink_metadata(path)?;
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return Err(fail("目录含有链接，无法安全检查占用。")); }
        if meta.is_dir() { for item in fs::read_dir(path)? { resources(&item?.path(), files, depth + 1)?; } }
        else { files.push(path.as_os_str().encode_wide().chain(Some(0)).collect()); }
        Ok(())
    }
    pub fn inspect(path: &Path) -> Reply<Vec<LockProcess>> {
        let mut files = Vec::new();
        resources(path, &mut files, 0)?;
        if files.is_empty() { return Ok(Vec::new()); }
        let mut session = 0;
        let mut key = [0u16; 33];
        // SAFETY: all FFI buffers have the documented C layout and remain live for each call.
        if unsafe { RmStartSession(&mut session, 0, key.as_mut_ptr()) } != 0 { return Err(fail("无法启动占用检查。")); }
        let session = Session(session);
        let pointers: Vec<_> = files.iter().map(|file| file.as_ptr()).collect();
        if unsafe { RmRegisterResources(session.0, pointers.len() as u32, pointers.as_ptr(), 0, ptr::null(), 0, ptr::null()) } != 0 { return Err(fail("无法检查文件占用。")); }
        let mut info: Vec<Info> = Vec::new();
        for _ in 0..5 {
            let (mut needed, mut count, mut reasons) = (0, info.len() as u32, 0);
            let status = unsafe { RmGetList(session.0, &mut needed, &mut count, if info.is_empty() { ptr::null_mut() } else { info.as_mut_ptr() }, &mut reasons) };
            if status == 234 && needed <= 4096 { info = vec![unsafe { std::mem::zeroed() }; needed as usize]; continue; }
            if status != 0 { return Err(fail("无法完整识别占用程序，请手动关闭后重试。")); }
            info.truncate(count as usize);
            if reasons != 0 || info.iter().any(|p| p.kind == 3 || p.kind == 4 || p.kind == 1000 || p.process.pid <= 4 || p.process.pid == std::process::id()) { return Err(fail("涉及系统服务、资源管理器或览山自身，请手动关闭预览或相关程序后重试。")); }
            return Ok(info.iter().map(|p| LockProcess { pid: p.process.pid, started: p.process.started, name: String::from_utf16_lossy(&p.name[..p.name.iter().position(|v| *v == 0).unwrap_or(256)]) }).collect());
        }
        Err(fail("占用程序正在变化，请重新检查。"))
    }
    pub fn close(path: &Path, approved: &[LockProcess]) -> Reply<()> {
        let current = inspect(path)?;
        if current.iter().any(|p| !approved.contains(p)) { return Err(fail("占用程序已改变，请重新检查并确认。")); }
        let mut handles = Vec::new();
        for process in current {
            let raw = unsafe { OpenProcess(0x1000 | 0x100000 | 1, 0, process.pid) };
            if raw.is_null() { return Err(fail("无法关闭占用程序，请手动退出后重试。")); }
            let handle = Handle(raw);
            let (mut created, mut exit, mut kernel, mut user) = ([0; 2], [0; 2], [0; 2], [0; 2]);
            if unsafe { GetProcessTimes(raw, &mut created, &mut exit, &mut kernel, &mut user) } == 0 || created != process.started { return Err(fail("程序已退出或发生变化，请重新检查。")); }
            handles.push(handle);
        }
        for handle in handles {
            if unsafe { TerminateProcess(handle.0, 1) } == 0 || unsafe { WaitForSingleObject(handle.0, 5000) } != 0 { return Err(fail("部分程序可能已关闭，但仍有程序未能退出，请核对后重试。")); }
        }
        Ok(())
    }
}
#[cfg(target_os = "windows")]
pub use windows::{inspect, close};
#[cfg(not(target_os = "windows"))]
pub fn inspect(_: &Path) -> Reply<Vec<LockProcess>> { Err(fail("占用检查仅支持 Windows。")) }
#[cfg(not(target_os = "windows"))]
pub fn close(_: &Path, _: &[LockProcess]) -> Reply<()> { Err(fail("关闭占用程序仅支持 Windows。")) }

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use std::{fs, io::{BufRead, BufReader}, os::windows::process::CommandExt, process::{Child, Command, Stdio}};
    struct Fixture { child: Child, path: std::path::PathBuf }
    impl Drop for Fixture { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); let _ = fs::remove_file(&self.path); } }
    #[test]
    fn detects_child_lock_requires_approval_and_releases_file() {
        let path = std::env::temp_dir().join(format!("lanshan-lock-test-{}.txt", std::process::id()));
        fs::write(&path, "test").unwrap();
        let path = fs::canonicalize(path).unwrap();
        let shell = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let child = Command::new(shell).args(["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; $f=[IO.File]::Open($env:LANSHAN_TEST_FILE,'Open','ReadWrite','None'); [Console]::WriteLine('READY'); Start-Sleep -Seconds 30; $f.Dispose()"])
            .env("LANSHAN_TEST_FILE", &path).stdout(Stdio::piped()).creation_flags(0x08000000).spawn().unwrap();
        let mut fixture = Fixture { child, path };
        let mut ready = String::new();
        BufReader::new(fixture.child.stdout.take().unwrap()).read_line(&mut ready).unwrap();
        assert_eq!(ready.trim(), "READY");
        let locks = inspect(&fixture.path).expect("lock inspection failed");
        assert!(locks.iter().any(|p| p.pid == fixture.child.id()));
        assert!(close(&fixture.path, &[]).is_err());
        let mut changed = locks.clone();
        for process in &mut changed { process.started[0] ^= 1; }
        assert!(close(&fixture.path, &changed).is_err());
        assert!(fixture.child.try_wait().unwrap().is_none());
        close(&fixture.path, &locks).unwrap_or_else(|_| panic!("closing approved test child failed"));
        assert!(fixture.child.try_wait().unwrap().is_some());
        assert!(inspect(&fixture.path).unwrap_or_default().is_empty());
        fs::remove_file(&fixture.path).unwrap();
    }
}
