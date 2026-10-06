//! Runs the `apps/homekit` bridge as a child process and exposes it to the
//! web UI. The bridge publishes this Mac's camera as a HomeKit IP camera; it
//! talks newline-delimited JSON on stdout (events) and stdin (commands).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

#[derive(Default)]
struct Inner {
  child: Option<Child>,
  stdin: Option<ChildStdin>,
  /// Latest merged view of the bridge's events, served to the UI as-is.
  status: Value,
}

#[derive(Default, Clone)]
pub struct HomeKit(Arc<Mutex<Inner>>);

/// A Finder-launched .app doesn't inherit the shell's PATH, so Homebrew's
/// `node`/`ffmpeg` aren't visible to a bare `Command::new("node")`.
fn find_binary(name: &str, env_override: &str) -> Option<PathBuf> {
  if let Ok(p) = std::env::var(env_override) {
    return Some(PathBuf::from(p));
  }
  let mut dirs: Vec<PathBuf> = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].iter().map(PathBuf::from).collect();
  if let Some(path) = std::env::var_os("PATH") {
    dirs.extend(std::env::split_paths(&path));
  }
  dirs.into_iter().map(|d| d.join(name)).find(|p| p.is_file())
}

fn bridge_script(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Ok(p) = std::env::var("PEERSITTER_HOMEKIT_SCRIPT") {
    return Some(PathBuf::from(p));
  }
  // Bundled app: resources/homekit/src/index.mjs
  let bundled = app.path().resource_dir().ok()?.join("homekit/src/index.mjs");
  if bundled.is_file() {
    return Some(bundled);
  }
  // `tauri dev`: straight from the monorepo.
  let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../homekit/src/index.mjs");
  dev.is_file().then_some(dev)
}

fn merge(status: &mut Value, patch: Value) {
  if let (Some(dst), Some(src)) = (status.as_object_mut(), patch.as_object()) {
    for (k, v) in src {
      dst.insert(k.clone(), v.clone());
    }
  }
}

#[tauri::command]
pub fn homekit_start(app: tauri::AppHandle, state: State<'_, HomeKit>) -> Result<(), String> {
  let mut inner = state.0.lock().unwrap();
  if inner.child.is_some() {
    return Ok(());
  }
  let node = find_binary("node", "PEERSITTER_NODE")
    .ok_or("Node.js not found. Install it (brew install node) to enable HomeKit.")?;
  let script = bridge_script(&app).ok_or("HomeKit bridge script not found.")?;

  let mut cmd = Command::new(node);
  cmd.arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
  if let Some(ffmpeg) = find_binary("ffmpeg", "FFMPEG_PATH") {
    cmd.env("FFMPEG_PATH", ffmpeg);
  }
  let mut child = cmd.spawn().map_err(|e| format!("Failed to start HomeKit bridge: {e}"))?;
  let stdout = child.stdout.take().ok_or("no stdout")?;
  inner.stdin = child.stdin.take();
  inner.child = Some(child);
  inner.status = json!({ "starting": true });

  let shared = state.0.clone();
  std::thread::spawn(move || {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      let Ok(mut ev) = serde_json::from_str::<Value>(&line) else { continue };
      let kind = ev["event"].as_str().unwrap_or_default().to_string();
      if let Some(o) = ev.as_object_mut() {
        o.remove("event");
      }
      let mut s = shared.lock().unwrap();
      match kind.as_str() {
        "ready" => {
          merge(&mut s.status, json!({ "starting": false, "error": null }));
          merge(&mut s.status, ev);
        }
        "paired" => merge(&mut s.status, json!({ "paired": true })),
        "unpaired" => merge(&mut s.status, json!({ "paired": false })),
        "stream" => merge(&mut s.status, ev),
        "error" => merge(&mut s.status, json!({ "starting": false, "error": ev["message"] })),
        _ => {}
      }
    }
    // stdout closed: the bridge exited.
    let mut s = shared.lock().unwrap();
    if let Some(mut c) = s.child.take() {
      let _ = c.wait();
    }
    s.stdin = None;
    let had_error = s.status["error"].is_string();
    s.status = if had_error { json!({ "error": s.status["error"].clone() }) } else { Value::Null };
  });
  Ok(())
}

fn stop_inner(inner: &mut Inner) {
  inner.stdin = None; // closing stdin makes the bridge shut down cleanly
  if let Some(mut c) = inner.child.take() {
    // Backstop if it's wedged (e.g. blocked on a macOS permission prompt).
    let _ = c.kill();
    let _ = c.wait();
  }
  inner.status = Value::Null;
}

#[tauri::command]
pub fn homekit_stop(state: State<'_, HomeKit>) {
  stop_inner(&mut state.0.lock().unwrap());
}

#[tauri::command]
pub fn homekit_status(state: State<'_, HomeKit>) -> Value {
  let s = state.0.lock().unwrap();
  let mut out = if s.status.is_object() { s.status.clone() } else { json!({}) };
  out["running"] = json!(s.child.is_some());
  out
}

/// Surfaces PeerSitter's motion detection as a HomeKit motion sensor event.
#[tauri::command]
pub fn homekit_motion(detected: bool, state: State<'_, HomeKit>) {
  if let Some(stdin) = state.0.lock().unwrap().stdin.as_mut() {
    let _ = writeln!(stdin, "{}", json!({ "cmd": "motion", "detected": detected }));
    let _ = stdin.flush();
  }
}

/// Called when the app exits so the camera isn't left held by an orphan.
pub fn shutdown(state: &HomeKit) {
  stop_inner(&mut state.0.lock().unwrap());
}
