use crate::file_system::{checked, fail, Access, Reply};
use serde::Serialize;
use std::{fs, path::Path};
use tauri::Manager;

pub(crate) fn launchable(extension: &str) -> bool { matches!(extension, "exe" | "com" | "msi" | "msp" | "lnk") }
fn shell_path(path: &Path) -> String {
    let value = path.to_string_lossy().replace('/', "\\");
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") }
    else { value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned() }
}
#[derive(Serialize)]
pub struct ApplicationIcon { width: u32, height: u32, rgba: Vec<u8> }

#[tauri::command]
pub async fn application_icon(app: tauri::AppHandle, path: String) -> Reply<ApplicationIcon> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = checked(&app.state::<Access>(), &path)?;
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() { return Err(fail("请选择普通应用文件。")); }
        let extension = path.extension().map(|s| s.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        if !launchable(&extension) { return Err(fail("此文件类型暂不读取应用图标。")); }
        native::icon(&path)
    }).await.map_err(|_| fail("读取应用图标中断。"))?
}
pub(crate) fn launch(path: &Path) -> Reply<()> { native::launch(path) }

#[cfg(target_os = "windows")]
mod native {
    use super::*;
    use std::{ffi::c_void, ptr::{null, null_mut}};
    type Handle = *mut c_void;
    #[repr(C)]
    struct ShellInfo { icon: Handle, index: i32, attributes: u32, display: [u16; 260], type_name: [u16; 80] }
    #[repr(C)]
    struct BitmapHeader { size: u32, width: i32, height: i32, planes: u16, bit_count: u16, compression: u32, image_size: u32, xppm: i32, yppm: i32, used: u32, important: u32 }
    #[repr(C)]
    struct BitmapInfo { header: BitmapHeader, colors: [u32; 1] }
    #[repr(C)]
    struct Guid { a: u32, b: u16, c: u16, d: [u8; 8] }
    #[repr(C)]
    struct ImageList { vtable: *const ImageListVtable }
    #[repr(C)]
    struct ImageListVtable {
        query_interface: usize, add_ref: usize,
        release: unsafe extern "system" fn(*mut ImageList) -> u32,
        // IImageList methods Add through Remove occupy slots 3–9.
        methods_before_get_icon: [usize; 7],
        get_icon: unsafe extern "system" fn(*mut ImageList, i32, u32, *mut Handle) -> i32,
    }
    struct OwnedImageList(*mut ImageList);
    impl Drop for OwnedImageList { fn drop(&mut self) { unsafe { ((*(*self.0).vtable).release)(self.0); } } }
    #[link(name = "shell32")]
    extern "system" {
        fn SHGetFileInfoW(path: *const u16, attributes: u32, info: *mut ShellInfo, size: u32, flags: u32) -> usize;
        fn SHGetImageList(kind: i32, iid: *const Guid, list: *mut *mut ImageList) -> i32;
        fn ShellExecuteW(window: Handle, operation: *const u16, file: *const u16, parameters: *const u16, directory: *const u16, show: i32) -> isize;
    }
    #[link(name = "user32")]
    extern "system" {
        fn DestroyIcon(icon: Handle) -> i32;
        fn DrawIconEx(dc: Handle, x: i32, y: i32, icon: Handle, width: i32, height: i32, step: u32, brush: Handle, flags: u32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(dc: Handle) -> Handle;
        fn CreateDIBSection(dc: Handle, info: *const BitmapInfo, usage: u32, bits: *mut *mut c_void, section: Handle, offset: u32) -> Handle;
        fn SelectObject(dc: Handle, object: Handle) -> Handle;
        fn DeleteObject(object: Handle) -> i32;
        fn DeleteDC(dc: Handle) -> i32;
        fn GdiFlush() -> i32;
    }
    #[link(name = "ole32")]
    extern "system" { fn CoInitializeEx(reserved: Handle, mode: u32) -> i32; fn CoUninitialize(); }
    struct Com;
    impl Drop for Com { fn drop(&mut self) { unsafe { CoUninitialize(); } } }
    fn com() -> Reply<Com> {
        if unsafe { CoInitializeEx(null_mut(), 2) } < 0 { return Err(fail("Windows Shell 初始化失败。")); }
        Ok(Com)
    }
    struct Resources { icon: Handle, dc: Handle, bitmap: Handle, previous: Handle }
    impl Drop for Resources {
        fn drop(&mut self) { unsafe {
            if !self.previous.is_null() && self.previous as isize != -1 { SelectObject(self.dc, self.previous); }
            if !self.bitmap.is_null() { DeleteObject(self.bitmap); }
            if !self.dc.is_null() { DeleteDC(self.dc); }
            if !self.icon.is_null() { DestroyIcon(self.icon); }
        } }
    }
    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(Some(0)).collect() }
    pub fn launch(path: &Path) -> Reply<()> {
        let _com = com()?;
        let file = wide(&shell_path(path));
        let parent = path.parent().ok_or_else(|| fail("无法确定应用目录。"))?;
        let directory = wide(&shell_path(parent));
        // Pass the file and its working directory as separate arguments, never shell text.
        let result = unsafe { ShellExecuteW(null_mut(), wide("open").as_ptr(), file.as_ptr(), null(), directory.as_ptr(), 1) };
        if result > 32 { Ok(()) } else { Err(fail(match result {
            2 | 3 => "应用或快捷方式目标不存在，请刷新目录。",
            5 => "Windows 拒绝启动，可能已取消授权或文件被系统阻止。",
            31 => "没有关联的应用，请检查 Windows 默认应用设置。",
            _ => "Windows 无法启动此程序，请检查文件是否完整、是否被占用或与系统兼容。",
        })) }
    }
    pub fn icon(path: &Path) -> Reply<ApplicationIcon> {
        let _com = com()?;
        let path = wide(&shell_path(path));
        if path.len() > 260 { return Err(fail("应用路径过长，使用通用图标。")); }
        let mut info = ShellInfo { icon: null_mut(), index: 0, attributes: 0, display: [0; 260], type_name: [0; 80] };
        let result = unsafe { SHGetFileInfoW(path.as_ptr(), 0, &mut info, std::mem::size_of::<ShellInfo>() as u32, 0x4000) };
        let mut resources = Resources { icon: null_mut(), dc: null_mut(), bitmap: null_mut(), previous: null_mut() };
        let mut size = 32;
        if result != 0 {
            let iid = Guid { a: 0x46eb5926, b: 0x582e, c: 0x4017, d: [0x9f, 0xdf, 0xe8, 0x99, 0x8d, 0xaa, 0x09, 0x50] };
            for (kind, pixels) in [(4, 256), (2, 48)] {
                let mut list = null_mut();
                let status = unsafe { SHGetImageList(kind, &iid, &mut list) };
                if list.is_null() { continue; }
                let list = OwnedImageList(list);
                if status < 0 { continue; }
                let mut icon = null_mut();
                let status = unsafe { ((*(*list.0).vtable).get_icon)(list.0, info.index, 1, &mut icon) };
                if status >= 0 && !icon.is_null() { resources.icon = icon; size = pixels; break; }
                if !icon.is_null() { unsafe { DestroyIcon(icon); } }
            }
        }
        if resources.icon.is_null() {
            let result = unsafe { SHGetFileInfoW(path.as_ptr(), 0, &mut info, std::mem::size_of::<ShellInfo>() as u32, 0x100) };
            resources.icon = info.icon;
            if result == 0 || resources.icon.is_null() { return Err(fail("Windows 未返回应用图标。")); }
        }
        let bitmap_info = BitmapInfo { header: BitmapHeader { size: 40, width: size as i32, height: -(size as i32), planes: 1, bit_count: 32, compression: 0, image_size: 0, xppm: 0, yppm: 0, used: 0, important: 0 }, colors: [0] };
        let mut bits = null_mut();
        unsafe {
            resources.dc = CreateCompatibleDC(null_mut());
            if resources.dc.is_null() { return Err(fail("无法创建图标绘图上下文。")); }
            resources.bitmap = CreateDIBSection(resources.dc, &bitmap_info, 0, &mut bits, null_mut(), 0);
            if resources.bitmap.is_null() || bits.is_null() { return Err(fail("无法读取图标像素。")); }
            resources.previous = SelectObject(resources.dc, resources.bitmap);
            if resources.previous.is_null() || resources.previous as isize == -1 { return Err(fail("无法绘制图标。")); }
            std::ptr::write_bytes(bits.cast::<u8>(), 0, size * size * 4);
            if DrawIconEx(resources.dc, 0, 0, resources.icon, size as i32, size as i32, 0, null_mut(), 3) == 0 || GdiFlush() == 0 { return Err(fail("无法绘制应用图标。")); }
        }
        // Copy before drawing the legacy mask; no borrowed bitmap buffer survives a GDI write.
        let mut pixels = unsafe { std::slice::from_raw_parts(bits.cast::<u8>(), size * size * 4) }.to_vec();
        if pixels.chunks_exact(4).all(|pixel| pixel[3] == 0) {
            unsafe {
                if DrawIconEx(resources.dc, 0, 0, resources.icon, size as i32, size as i32, 0, null_mut(), 1) == 0 || GdiFlush() == 0 { return Err(fail("无法读取图标透明蒙版。")); }
            }
            let mask = unsafe { std::slice::from_raw_parts(bits.cast::<u8>(), size * size * 4) };
            for (pixel, mask) in pixels.chunks_exact_mut(4).zip(mask.chunks_exact(4)) { pixel[3] = if mask[0] < 128 { 255 } else { 0 }; }
        }
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            let alpha = pixel[3] as u32;
            if alpha > 0 && alpha < 255 { for channel in &mut pixel[..3] { *channel = ((*channel as u32 * 255 / alpha).min(255)) as u8; } }
        }
        // Some legacy apps have only a small icon inside a jumbo transparent canvas.
        // Crop padding instead of enlarging that small source to the full tile.
        let mut bounds = (size, size, 0, 0);
        let mut visible = false;
        for (index, pixel) in pixels.chunks_exact(4).enumerate() {
            if pixel[3] == 0 { continue; }
            visible = true;
            let (x, y) = (index % size, index / size);
            bounds = (bounds.0.min(x), bounds.1.min(y), bounds.2.max(x), bounds.3.max(y));
        }
        if !visible { return Err(fail("应用图标为空，使用通用图标。")); }
        let edge = (bounds.2 - bounds.0 + 1).max(bounds.3 - bounds.1 + 1).saturating_add(4).min(size);
        let left = ((bounds.0 + bounds.2 + 1).saturating_sub(edge) / 2).min(size - edge);
        let top = ((bounds.1 + bounds.3 + 1).saturating_sub(edge) / 2).min(size - edge);
        let mut cropped = Vec::with_capacity(edge * edge * 4);
        for y in top..top + edge { cropped.extend_from_slice(&pixels[(y * size + left) * 4..(y * size + left + edge) * 4]); }
        Ok(ApplicationIcon { width: edge as u32, height: edge as u32, rgba: cropped })
    }
}
#[cfg(not(target_os = "windows"))]
mod native {
    use super::*;
    pub fn launch(_path: &Path) -> Reply<()> { Err(fail("当前仅支持 Windows 应用启动。")) }
    pub fn icon(_path: &Path) -> Reply<ApplicationIcon> { Err(fail("当前仅支持 Windows 应用图标。")) }
}
