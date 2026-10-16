mod compilador;
mod monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(compilador::Ocupado::default())
        .manage(monitor::Monitor::default())
        .invoke_handler(tauri::generate_handler![
            compilador::verificar_entorno,
            compilador::preparar_entorno,
            compilador::compilar,
            compilador::detectar_placas,
            compilador::subir,
            monitor::monitor_iniciar,
            monitor::monitor_detener
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
