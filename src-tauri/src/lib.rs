mod file_system;
mod preview;
mod application;

pub fn run() {
    let result = tauri::Builder::default().manage(file_system::Access::default())
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_system::locations, file_system::select_location, file_system::choose_folder, application::application_icon,
            file_system::list_directory, file_system::search_files, file_system::open_file, file_system::run_operation, file_system::cancel_operation, preview::preview_file, preview::open_preview_link
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result { eprintln!("览山启动失败：{error}"); }
}
