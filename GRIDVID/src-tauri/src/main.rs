// gridvid desktop app — thin Tauri shell around the self-contained editor (dist/index.html).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri_plugin_dialog::DialogExt;

// Export a file: native Save dialog (Finder) -> write bytes -> reveal in Finder.
// Returns the saved path, or None if the user cancelled.
#[tauri::command]
async fn export_file(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    let file = app.dialog().file().set_file_name(&name).blocking_save_file();
    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![export_file])
        .run(tauri::generate_context!())
        .expect("error while running gridvid");
}
