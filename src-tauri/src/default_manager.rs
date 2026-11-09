use crate::file_system::{fail, Reply};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status { supported: bool, enabled: bool, partial: bool, can_restore: bool }

pub fn apply(action: &str) -> Reply<Status> {
    #[cfg(target_os = "windows")]
    {
        use std::{os::windows::process::CommandExt, process::Command};
        // A named mutex serializes changes across separately launched windows.
        let script = format!("$mutex = New-Object Threading.Mutex($false, 'Local\\Lanshan.DefaultManager'); $locked = $false; try {{ $locked = $mutex.WaitOne(15000); if (!$locked) {{ throw 'Settings are busy' }}; {} }} finally {{ if ($locked) {{ $mutex.ReleaseMutex() }}; $mutex.Dispose() }}", include_str!("default_manager.ps1"));
        let executable = std::env::current_exe()?;
        if action == "enable" && executable.components().any(|c| c.as_os_str() == "target") {
            return Err(fail("请先安装正式版本，再设为默认文件管理器。开发版本路径可能被清理。"));
        }
        let shell = std::path::PathBuf::from(std::env::var_os("SystemRoot").ok_or_else(|| fail("找不到 Windows 系统目录。"))?).join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let output = Command::new(shell).args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .env("LANSHAN_MANAGER_ACTION", action).env("LANSHAN_EXECUTABLE", executable)
            .creation_flags(0x08000000).output()?;
        if !output.status.success() { return Err(fail("无法更新默认文件管理器，请检查当前用户的注册表权限后重试。")); }
        let result = String::from_utf8_lossy(&output.stdout);
        let (count, recoverable) = result.trim().rsplit_once(',').ok_or_else(|| fail("无法读取默认文件管理器状态。"))?;
        Ok(Status { supported: true, enabled: count == "2", partial: count == "1", can_restore: recoverable.eq_ignore_ascii_case("true") })
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = action; Ok(Status { supported: false, enabled: false, partial: false, can_restore: false }) }
}

#[tauri::command]
pub async fn default_manager_status() -> Reply<Status> {
    tauri::async_runtime::spawn_blocking(|| apply("status")).await.map_err(|_| fail("无法读取系统设置。"))?
}
#[tauri::command]
pub async fn set_default_manager(enabled: bool) -> Reply<Status> {
    tauri::async_runtime::spawn_blocking(move || apply(if enabled { "enable" } else { "disable" })).await.map_err(|_| fail("无法更新系统设置。"))?
}
