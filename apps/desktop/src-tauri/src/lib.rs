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

/// The window has no visible close/minimise/zoom buttons (the glass layout owns the whole
/// window). Closing, minimising and quitting stay available via ⌘W, ⌘M and ⌘Q.
#[cfg(target_os = "macos")]
fn hide_window_buttons(window: &tauri::WebviewWindow) {
  use objc2_app_kit::{NSWindow, NSWindowButton};
  let Ok(ptr) = window.ns_window() else { return };
  // SAFETY: Tauri hands back the live NSWindow backing this webview window; we only
  // call main-thread-safe getters/setters from the main thread (setup / window events).
  let ns = unsafe { &*(ptr as *const NSWindow) };
  for kind in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
    if let Some(button) = ns.standardWindowButton(kind) {
      button.setHidden(true);
    }
  }
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
      #[cfg(target_os = "macos")]
      if let Some(window) = app.get_webview_window("main") {
        hide_window_buttons(&window);
      }
      Ok(())
    })
    // AppKit can re-show the buttons after resize / full-screen / focus changes.
    .on_window_event(|window, event| {
      #[cfg(target_os = "macos")]
      if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_)) {
        if let Some(w) = window.app_handle().get_webview_window(window.label()) {
          hide_window_buttons(&w);
        }
      }
      #[cfg(not(target_os = "macos"))]
      let _ = (window, event);
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        homekit::shutdown(&app.state::<homekit::HomeKit>());
      }
    });
}
