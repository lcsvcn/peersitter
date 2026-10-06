mod homekit;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(homekit::HomeKit::default())
    .invoke_handler(tauri::generate_handler![
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
