use crate::file_system::{checked, fail, Access, Reply};
use serde::Serialize;
use std::{fs, io::Read};
use tauri::Manager;

const TEXT_LIMIT: u64 = 256 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    kind: &'static str,
    path: Option<String>,
    bytes: Option<Vec<u8>>,
    size: u64,
    truncated: bool,
}
fn kind(extension: &str, name: &str) -> &'static str {
    match extension {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg" | "avif" => "image",
        "pdf" => "pdf",
        "mp3" | "wav" | "ogg" | "oga" | "flac" | "m4a" | "aac" | "opus" => "audio",
        "mp4" | "webm" | "mov" | "m4v" | "ogv" => "video",
        "txt" | "md" | "markdown" | "json" | "jsonl" | "csv" | "tsv" | "log" | "xml" |
        "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg" | "properties" | "sql" | "html" |
        "htm" | "css" | "scss" | "less" | "js" | "jsx" | "ts" | "tsx" | "vue" | "svelte" |
        "rs" | "go" | "py" | "java" | "c" | "h" | "cpp" | "hpp" | "cs" | "sh" | "ps1" |
        "bat" | "cmd" | "rb" | "php" | "swift" | "kt" | "dart" | "gitignore" | "gitattributes" => "text",
        _ if ["readme", "license", "dockerfile", "makefile", ".gitignore", ".gitattributes", ".editorconfig"].contains(&name) => "text",
        _ => "unsupported",
    }
}
#[tauri::command]
pub async fn preview_file(app: tauri::AppHandle, path: String) -> Reply<Preview> {
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        if fs::symlink_metadata(&path)?.file_type().is_symlink() { return Err(fail("暂不预览链接，请选择实际文件。")); }
        let path = checked(&access, &path)?;
        let metadata = fs::metadata(&path)?;
        if !metadata.is_file() { return Err(fail("请选择一个普通文件进行预览。")); }
        let extension = path.extension().map(|value| value.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        let name = path.file_name().map(|value| value.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        let kind = kind(&extension, &name);
        if kind == "text" {
            let mut bytes = Vec::new();
            fs::File::open(&path)?.take(TEXT_LIMIT + 1).read_to_end(&mut bytes)?;
            let truncated = bytes.len() as u64 > TEXT_LIMIT;
            bytes.truncate(TEXT_LIMIT as usize);
            return Ok(Preview { kind, path: None, bytes: Some(bytes), size: metadata.len(), truncated });
        }
        if kind == "pdf" {
            let mut header = [0_u8; 5];
            if fs::File::open(&path)?.read_exact(&mut header).is_err() || &header != b"%PDF-" {
                return Err(fail("此文件不包含有效的 PDF 文件头，请使用默认应用检查。"));
            }
        }
        if kind != "unsupported" {
            // Empty static scope; allow only this canonical, user-authorized leaf.
            // The built-in asset handler serves ranges for media without loading the whole file into IPC.
            app.asset_protocol_scope().allow_file(&path).map_err(|_| fail("无法授权读取该文件，请重新选择它所在的位置。"))?;
        }
        Ok(Preview { kind, path: if kind == "unsupported" { None } else { Some(path.to_string_lossy().into_owned()) }, bytes: None, size: metadata.len(), truncated: false })
    }).await.map_err(|_| fail("读取预览中断，请重试。"))?
}

#[tauri::command]
pub async fn open_preview_link(app: tauri::AppHandle, url: String) -> Reply<()> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = tauri::Url::parse(&url).map_err(|_| fail("网页链接无效。"))?;
    if !matches!(parsed.scheme(), "https" | "http") || parsed.host_str().is_none()
        || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(fail("只支持不含登录凭据的 HTTP/HTTPS 网页链接。"));
    }
    tauri::async_runtime::spawn_blocking(move || app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|_| fail("无法打开浏览器，请检查默认应用设置。")))
        .await.map_err(|_| fail("打开链接失败。"))?
}
