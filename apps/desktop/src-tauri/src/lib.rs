mod homekit;

use tauri::Manager;

/// Opens an https link in the default browser (a plain <a> would navigate the app window itself).
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  if !url.starts_with("https://") {
    return Err("only https links can be opened".into());
  }
  std::process::Command::new("/usr/bin/open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(homekit::HomeKit::default())
    .invoke_handler(tauri::generate_handler![
      open_external,
      homekit::homekit_start,
      homekit::homekit_stop,
      homekit::homekit_status,
      homekit::homekit_motion,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        homekit::shutdown(&app.state::<homekit::HomeKit>());
      }
    });
}
