use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::{self, Read, Write}, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Instant, UNIX_EPOCH}};
use tauri::ipc::Channel;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct AppError { code: &'static str, message: String }
pub(crate) type Reply<T> = Result<T, AppError>;
pub(crate) fn fail(message: impl Into<String>) -> AppError { AppError { code: "FILE_OPERATION_FAILED", message: message.into() } }
impl From<io::Error> for AppError {
    fn from(e: io::Error) -> Self {
        let message = match e.kind() {
            io::ErrorKind::PermissionDenied => "没有访问权限，请选择其他位置或检查文件权限。".into(),
            io::ErrorKind::NotFound => "文件或文件夹已不存在，请刷新目录。".into(),
            io::ErrorKind::AlreadyExists => "目标位置已有同名项目，请更换名称。".into(),
            _ => format!("文件操作失败：{e}"),
        };
        fail(message)
    }
}
#[derive(Clone, Serialize)]
pub struct Location { id: String, name: String, path: String, kind: &'static str }
#[derive(Default)]
pub struct Access { roots: Mutex<Vec<PathBuf>>, operations: Mutex<()>, jobs: Mutex<HashMap<String, Arc<AtomicBool>>> }
fn text(path: &Path) -> String { path.to_string_lossy().into_owned() }
fn known_locations(app: &tauri::AppHandle) -> Vec<Location> {
    let mut result = Vec::new();
    let resolver = app.path();
    for (id, name, resolved) in [
        ("home", "个人文件夹", resolver.home_dir()),
        ("desktop", "桌面", resolver.desktop_dir()),
        ("documents", "文稿", resolver.document_dir()),
        ("downloads", "下载", resolver.download_dir()),
        ("pictures", "图片", resolver.picture_dir()),
        ("music", "音乐", resolver.audio_dir()),
        ("videos", "影片", resolver.video_dir()),
    ] {
        if let Ok(path) = resolved {
            if path.is_dir() {
                result.push(Location { id: id.into(), name: name.into(), path: text(&path), kind: if id == "home" { "home" } else { "folder" } });
            }
        }
    }
    #[cfg(target_os = "windows")]
    for letter in b'A'..=b'Z' {
        let path = format!("{}:\\", letter as char);
        if Path::new(&path).is_dir() { result.push(Location { id: format!("drive-{}", letter as char), name: format!("本地磁盘 ({}:)", letter as char), path, kind: "drive" }); }
    }
    result
}
fn grant(access: &Access, path: &Path) -> Reply<String> {
    let path = fs::canonicalize(path)?;
    if !path.is_dir() { return Err(fail("请选择一个文件夹。")); }
    let mut roots = access.roots.lock().map_err(|_| fail("访问状态不可用，请重新打开应用。"))?;
    if !roots.contains(&path) { roots.push(path.clone()); }
    Ok(text(&path))
}
pub(crate) fn checked(access: &Access, path: &str) -> Reply<PathBuf> {
    let candidate = Path::new(path);
    if !candidate.is_absolute() { return Err(fail("请输入完整的绝对路径。")); }
    let canonical = fs::canonicalize(candidate)?;
    let roots = access.roots.lock().map_err(|_| fail("访问状态不可用。"))?;
    if !roots.iter().any(|root| canonical.starts_with(root)) { return Err(fail("此路径尚未授权，请从侧栏选择磁盘，或使用“打开文件夹”。")); }
    Ok(canonical)
}
fn check_name(name: &str) -> Reply<()> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    if name.trim().is_empty() || name.encode_utf16().count() > 255 || (name.ends_with(' ') || name.ends_with('.')) || name.chars().any(|c| c.is_control() || "\\/:*?\"<>|".contains(c)) || reserved.contains(&stem.as_str()) {
        return Err(fail("名称无效：请避免系统保留名称、特殊字符和结尾的空格或句点。"));
    }
    Ok(())
}
fn target(access: &Access, parent: &str, name: &str) -> Reply<PathBuf> {
    check_name(name)?;
    let parent = checked(access, parent)?;
    if !parent.is_dir() { return Err(fail("目标必须是文件夹。")); }
    let result = parent.join(name);
    match fs::symlink_metadata(&result) {
        Ok(_) => Err(AppError { code: "FS_ALREADY_EXISTS", message: "目标位置已有同名项目，不会覆盖原文件。可在操作队列中选择改名重试。".into() }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(result),
        Err(e) => Err(e.into()),
    }
}
#[tauri::command]
pub async fn locations(app: tauri::AppHandle) -> Reply<Vec<Location>> {
    tauri::async_runtime::spawn_blocking(move || known_locations(&app)).await.map_err(|_| fail("无法读取常用位置。"))
}
#[tauri::command]
pub async fn select_location(app: tauri::AppHandle, id: String) -> Reply<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let location = known_locations(&app).into_iter().find(|item| item.id == id).ok_or_else(|| fail("位置已不可用。"))?;
        grant(&app.state::<Access>(), Path::new(&location.path))
    }).await.map_err(|_| fail("无法打开位置。"))?
}
#[tauri::command]
pub async fn choose_folder(app: tauri::AppHandle) -> Reply<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_title("选择要在览山中打开的文件夹").blocking_pick_folder();
        match selected {
            Some(path) => {
                let path = path.into_path().map_err(|_| fail("无法解析所选路径。"))?;
                grant(&app.state::<Access>(), &path).map(Some)
            }
            None => Ok(None),
        }
    }).await.map_err(|_| fail("无法打开文件夹选择器。"))?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry { name: String, path: String, is_directory: bool, is_symlink: bool, size: u64, modified: u64, extension: String }
#[derive(Serialize)]
pub struct Directory { path: String, parent: Option<String>, entries: Vec<Entry>, ancestors: Vec<Breadcrumb>, skipped: usize }
#[derive(Serialize)]
struct Breadcrumb { name: String, path: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest { path: String, query: String, show_hidden: bool }
#[derive(Serialize)]
pub struct SearchResult { entries: Vec<Entry>, scanned: usize, skipped: usize, limited: bool }

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        // Also exclude junctions and other reparse points from recursive traversal.
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(target_os = "windows"))]
    { metadata.file_type().is_symlink() }
}

#[tauri::command]
pub async fn search_files(app: tauri::AppHandle, request: SearchRequest) -> Reply<SearchResult> {
    if request.query.chars().count() > 256 { return Err(fail("搜索词最多 256 个字符。")); }
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let root = checked(&access, &request.path)?;
        if !root.is_dir() { return Err(fail("请选择文件夹进行搜索。")); }
        let words: Vec<String> = request.query.to_lowercase().split_whitespace().map(String::from).collect();
        let mut result = SearchResult { entries: Vec::new(), scanned: 0, skipped: 0, limited: false };
        let mut stack = vec![(root.clone(), 0)];
        let started = Instant::now();
        'scan: while let Some((folder, depth)) = stack.pop() {
            if started.elapsed().as_secs() >= 3 { result.limited = true; break; }
            let canonical = match checked(&access, &text(&folder)) { Ok(path) if path.starts_with(&root) => path, _ => { result.skipped += 1; continue; } };
            let items = match fs::read_dir(canonical) { Ok(items) => items, Err(error) if depth == 0 => return Err(error.into()), Err(_) => { result.skipped += 1; continue; } };
            for item in items {
                if result.scanned >= 30000 || result.entries.len() >= 2000 || started.elapsed().as_secs() >= 3 { result.limited = true; break 'scan; }
                result.scanned += 1;
                let item = match item { Ok(item) => item, Err(_) => { result.skipped += 1; continue; } };
                let name = item.file_name().to_string_lossy().into_owned();
                if !request.show_hidden && name.starts_with('.') { continue; }
                let path = item.path();
                let metadata = match fs::symlink_metadata(&path) { Ok(meta) => meta, Err(_) => { result.skipped += 1; continue; } };
                if is_link(&metadata) { result.skipped += 1; continue; }
                if metadata.is_dir() {
                    if depth < 32 { stack.push((path.clone(), depth + 1)); } else { result.limited = true; }
                }
                let folded_name = name.to_lowercase();
                if words.iter().all(|word| folded_name.contains(word)) {
                    result.entries.push(Entry { name, path: text(&path), is_directory: metadata.is_dir(), is_symlink: false, size: metadata.len(), modified: metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_secs()).unwrap_or(0), extension: path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() });
                }
            }
        }
        Ok(result)
    }).await.map_err(|_| fail("搜索中断，请重试。"))?
}
#[tauri::command]
pub async fn list_directory(app: tauri::AppHandle, path: String) -> Reply<Directory> {
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let path = checked(&access, &path)?;
        let mut entries = Vec::new();
        let mut skipped = 0;
        for item in fs::read_dir(&path)? {
            let item = match item { Ok(item) => item, Err(_) => { skipped += 1; continue; } };
            let metadata = match fs::symlink_metadata(item.path()) { Ok(meta) => meta, Err(_) => { skipped += 1; continue; } };
            let item_path = item.path();
            entries.push(Entry { name: item.file_name().to_string_lossy().into_owned(), path: text(&item_path), is_directory: metadata.is_dir(), is_symlink: is_link(&metadata), size: metadata.len(), modified: metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_secs()).unwrap_or(0), extension: item_path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() });
        }
        let parent = path.parent().and_then(|p| checked(&access, &text(p)).ok()).map(|p| text(&p));
        let mut ancestors: Vec<Breadcrumb> = path.ancestors().filter_map(|p| checked(&access, &text(p)).ok()).map(|p| Breadcrumb {
            name: p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| text(&p).trim_start_matches(r"\\?\").into()), path: text(&p)
        }).collect();
        ancestors.reverse();
        Ok(Directory { path: text(&path), parent, entries, ancestors, skipped })
    }).await.map_err(|_| fail("读取目录中断，请重试。"))?
}
#[tauri::command]
pub async fn open_file(app: tauri::AppHandle, path: String) -> Reply<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = checked(&app.state::<Access>(), &path)?;
        let extension = path.extension().map(|s| s.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        if ["bat", "cmd", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "scr", "url", "reg", "hta", "cpl"].contains(&extension.as_str()) { return Err(fail("此脚本或系统操作类型暂不支持直接执行，请使用 Windows 文件资源管理器。")); }
        if !path.is_file() { return Err(fail("请选择文件。")); }
        if crate::application::launchable(&extension) { return crate::application::launch(&path); }
        app.opener().open_path(text(&path), None::<&str>).map_err(|_| fail("系统无法打开此文件，请检查默认应用关联。"))
    }).await.map_err(|_| fail("打开文件失败。"))?
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Action { CreateFolder, Rename, Copy, Move, Trash }
#[derive(Deserialize)]
pub struct FileRequest { action: Action, source: String, destination: Option<String>, name: Option<String> }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress { phase: &'static str, bytes: u64, total_bytes: u64 }
struct CopyContext {
    cancel: Arc<AtomicBool>,
    channel: Channel<Progress>,
    bytes: u64,
    total: u64,
    last_sent: Instant,
}
impl CopyContext {
    fn check(&self) -> Reply<()> {
        if self.cancel.load(Ordering::Relaxed) {
            Err(AppError { code: "OPERATION_CANCELLED", message: "复制已取消。如已写入部分副本，原文件仍保留，请检查目标目录；再次复制请使用其他名称。".into() })
        } else { Ok(()) }
    }
    fn notify(&mut self, phase: &'static str, force: bool) {
        if force || self.last_sent.elapsed().as_millis() >= 100 {
            let _ = self.channel.send(Progress { phase, bytes: self.bytes, total_bytes: self.total });
            self.last_sent = Instant::now();
        }
    }
}
fn scan_tree(source: &Path, depth: usize, context: &mut CopyContext) -> Reply<()> {
    context.check()?;
    if depth > 128 { return Err(fail("目录层级过深，未开始复制。")); }
    let meta = fs::symlink_metadata(source)?;
    if meta.file_type().is_symlink() { return Err(fail("目录含有符号链接或联接，未开始复制。")); }
    if meta.is_dir() {
        for item in fs::read_dir(source)? { scan_tree(&item?.path(), depth + 1, context)?; }
    } else if meta.is_file() { context.total = context.total.saturating_add(meta.len()); }
    else { return Err(fail("目录包含不支持的特殊文件，未开始复制。")); }
    context.notify("scanning", false);
    Ok(())
}
fn copy_tree(source: &Path, destination: &Path, depth: usize, context: &mut CopyContext) -> Reply<()> {
    context.check()?;
    if depth > 128 { return Err(fail("目录层级过深。")); }
    let meta = fs::symlink_metadata(source)?;
    if meta.file_type().is_symlink() { return Err(fail("目录发生变化，复制遇到链接，已停止。")); }
    if meta.is_dir() {
        fs::create_dir(destination)?;
        for item in fs::read_dir(source)? {
            let item = item?;
            copy_tree(&item.path(), &destination.join(item.file_name()), depth + 1, context)?;
        }
    } else if meta.is_file() {
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(destination)?;
        let mut buffer = vec![0_u8; 1024 * 1024];
        loop {
            context.check()?;
            let count = input.read(&mut buffer)?;
            if count == 0 { break; }
            output.write_all(&buffer[..count])?;
            context.bytes = context.bytes.saturating_add(count as u64);
            context.notify("copying", false);
        }
        output.flush()?;
    } else { return Err(fail("不支持复制此特殊文件。")); }
    Ok(())
}
#[cfg(target_os = "windows")]
fn recycle(path: &Path) -> Reply<()> {
    use std::os::windows::process::CommandExt;
    // Fixed script, path is passed as process environment data, never executable text.
    let script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic; $p=$env:LANSHAN_RECYCLE_PATH; if ([System.IO.Directory]::Exists($p)) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'AllDialogs','SendToRecycleBin','ThrowException') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'AllDialogs','SendToRecycleBin','ThrowException') }";
    let system_root = std::env::var_os("SystemRoot").ok_or_else(|| fail("无法定位 Windows 系统目录。"))?;
    let powershell = PathBuf::from(system_root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let normal = text(path);
    let normal = normal.strip_prefix(r"\\?\").unwrap_or(&normal);
    if normal.starts_with("UNC\\") || normal.chars().count() >= 248 { return Err(fail("此路径不能安全提交到回收站，请在 Windows 文件资源管理器中处理。")); }
    let status = std::process::Command::new(powershell).args(["-NoProfile", "-NonInteractive", "-Command", script]).env("LANSHAN_RECYCLE_PATH", normal).creation_flags(0x08000000).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status()?;
    if status.success() { Ok(()) } else { Err(fail("无法移入回收站，请检查文件占用、权限或磁盘的回收站支持。")) }
}
#[cfg(not(target_os = "windows"))]
fn recycle(_path: &Path) -> Reply<()> { Err(fail("此版本仅支持 Windows 回收站。")) }


#[cfg(target_os = "windows")]
fn move_without_overwrite(source: &Path, destination: &Path) -> Reply<()> {
    use std::os::windows::ffi::OsStrExt;
    if source.components().next() != destination.components().next() {
        return Err(fail("跨磁盘移动尚未支持，请先复制核对，再将源项目移入回收站。"));
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileW(existing: *const u16, destination: *const u16) -> i32;
    }
    let existing: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: both pointers reference live, NUL-terminated UTF-16 buffers for this call.
    // Unlike fs::rename / MoveFileExW, MoveFileW refuses an existing destination.
    let moved = unsafe { MoveFileW(existing.as_ptr(), target.as_ptr()) };
    if moved != 0 { return Ok(()); }
    let error = io::Error::last_os_error();
    if matches!(error.raw_os_error(), Some(80) | Some(183)) {
        Err(AppError { code: "FS_ALREADY_EXISTS", message: "目标出现同名项目，已保留原文件。可改名重试。".into() })
    } else { Err(error.into()) }
}
#[cfg(not(target_os = "windows"))]
fn move_without_overwrite(_source: &Path, _destination: &Path) -> Reply<()> {
    Err(fail("此版本的移动和重命名仅支持 Windows。"))
}
fn execute(app: &tauri::AppHandle, request: FileRequest, context: &mut CopyContext) -> Reply<()> {
    let access = app.state::<Access>();
    let _operation = access.operations.lock().map_err(|_| fail("操作状态不可用。"))?;
    context.check()?;
    let source = checked(&access, &request.source)?;
    if matches!(request.action, Action::CreateFolder) {
        let destination = target(&access, &text(&source), request.name.as_deref().unwrap_or(""))?;
        return fs::create_dir(destination).map_err(Into::into);
    }
    if access.roots.lock().map_err(|_| fail("访问状态不可用。"))?.contains(&source)
        || known_locations(app).iter().any(|location| fs::canonicalize(&location.path).ok().as_ref() == Some(&source)) {
        return Err(fail("不能更名、复制、移动或删除位置根目录，请选择其中的项目。"));
    }
    if fs::symlink_metadata(&request.source)?.file_type().is_symlink() { return Err(fail("暂不支持操作符号链接或目录联接。")); }
    match request.action {
        Action::Trash => recycle(&source),
        Action::Rename => {
            let parent = source.parent().ok_or_else(|| fail("不能重命名磁盘根目录。"))?;
            let dest = target(&access, &text(parent), request.name.as_deref().unwrap_or(""))?;
            move_without_overwrite(&source, &dest)
        }
        Action::Copy | Action::Move => {
            let parent = request.destination.as_deref().ok_or_else(|| fail("请选择目标文件夹。"))?;
            let original = source.file_name().ok_or_else(|| fail("不能操作磁盘根目录。"))?.to_string_lossy();
            let name = request.name.as_deref().unwrap_or(&original);
            let dest = target(&access, parent, name)?;
            if dest.starts_with(&source) { return Err(fail("不能将文件夹复制或移动到自身内部。")); }
            if matches!(request.action, Action::Copy) {
                scan_tree(&source, 0, context)?;
                context.notify("copying", true);
                copy_tree(&source, &dest, 0, context).map_err(|mut error| {
                    if error.code != "OPERATION_CANCELLED" {
                        error.message.push_str(" 目标目录可能存在部分副本，原文件保留；请核对后使用其他名称重试。");
                    }
                    error
                })
            } else {
                move_without_overwrite(&source, &dest)
            }
        }
        Action::CreateFolder => Err(fail("无效的文件操作。")),
    }
}
#[tauri::command]
pub async fn run_operation(app: tauri::AppHandle, request: FileRequest, job_id: String, progress: Channel<Progress>) -> Reply<()> {
    if job_id.is_empty() || job_id.len() > 64 { return Err(fail("无效的任务标识。")); }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let access = app.state::<Access>();
        let mut jobs = access.jobs.lock().map_err(|_| fail("任务状态不可用。"))?;
        if jobs.contains_key(&job_id) { return Err(fail("任务已在运行。")); }
        jobs.insert(job_id.clone(), cancel.clone());
    }
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut context = CopyContext { cancel, channel: progress, bytes: 0, total: 0, last_sent: Instant::now() };
        context.notify("scanning", true);
        execute(&worker_app, request, &mut context)?;
        context.notify("complete", true);
        Ok::<(), AppError>(())
    }).await.map_err(|_| fail("文件操作中断，请刷新后核对结果。"));
    if let Ok(mut jobs) = app.state::<Access>().jobs.lock() { jobs.remove(&job_id); }
    result?
}
#[tauri::command]
pub fn cancel_operation(access: tauri::State<'_, Access>, job_id: String) -> Reply<()> {
    if let Some(token) = access.jobs.lock().map_err(|_| fail("任务状态不可用。"))?.get(&job_id) {
        token.store(true, Ordering::Relaxed);
    }
    Ok(())
}
