# Desktop shell (Tauri) — macOS, Windows, Linux

Wraps `apps/web`'s build output as a native desktop app. `src-tauri/` is
checked in and builds out of the box.

## Requirements

- [Rust toolchain](https://www.rust-lang.org/tools/install)
- Tauri's [platform prerequisites](https://v2.tauri.app/start/prerequisites/)
  (on macOS: Xcode Command Line Tools, already covered if you have Xcode)

## Commands

```sh
cd apps/desktop
npm install

npm run dev     # launches the desktop app against the Vite dev server (run `npm run dev --workspace=apps/web` first)
npm run build   # builds apps/web, then produces a native app in src-tauri/target/release/bundle/macos/*.app
```

On macOS, `npm run build` output is unsigned/unnotarized — fine for local
use; launch it with `open src-tauri/target/release/bundle/macos/PeerSitter.app`.
Gatekeeper may warn on first launch since it isn't notarized by an Apple
Developer ID — right-click → Open once to bypass, or codesign it yourself
if you have a Developer ID.

## Camera/mic permissions

`src-tauri/Info.plist` declares `NSCameraUsageDescription` and
`NSMicrophoneUsageDescription`, which macOS requires before it will even
show the permission prompt — Tauri's bundler merges this into the app's
final Info.plist automatically. The webview then uses the OS's native
`getUserMedia` permission prompt, same as Safari/Chrome.

If you package recordings to native disk instead of the browser-download
fallback, swap `packages/core/src/recorder.ts`'s `saveBlob` for Tauri's
`@tauri-apps/plugin-fs`.

## Apple Home (HomeKit) on macOS

The macOS build can also present itself to the Apple Home app as a HomeKit
camera — see [`apps/homekit/README.md`](../homekit/README.md) for how it
works and its limits (needs `node` + `ffmpeg` installed; not an
Apple-certified accessory). `npm run build` installs the bridge's
dependencies and bundles it into the `.app`. The bridge is only reachable
inside this desktop shell, via the `homekit_*` commands in
`src-tauri/src/homekit.rs`.
