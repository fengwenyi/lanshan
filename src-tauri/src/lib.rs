mod file_locks;
mod file_system;
mod preview;
mod application;
mod default_manager;

pub fn run() {
    if std::env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("--restore-default-manager")) {
        if default_manager::apply("disable").is_err() { std::process::exit(1); }
        return;
    }
    let result = tauri::Builder::default().manage(file_system::Access::default())
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            default_manager::default_manager_status, default_manager::set_default_manager, file_system::startup_folder,
            file_system::inspect_file_locks, file_system::locations, file_system::select_location, file_system::choose_folder, application::application_icon,
            file_system::list_directory, file_system::search_files, file_system::open_file, file_system::run_operation, file_system::cancel_operation, preview::preview_file, preview::open_preview_link
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result { eprintln!("览山启动失败：{error}"); }
}
