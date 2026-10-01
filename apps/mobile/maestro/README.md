# Maestro UI tests

Three flows, driven against the real installed app (not a dev server) on
iOS Simulator and Android emulator — confirmed passing on both:

- `smoke-camera.yaml` — Home → Camera role → verifies permission-gated
  camera UI and the motion-recording toggle render correctly → back to Home.
- `smoke-viewer.yaml` — Home → Viewer role → exercises the "paste the code
  instead" pairing fallback (no camera/QR needed).
- `smoke-gallery.yaml` — Home → Recordings → verifies the empty-state
  Gallery UI and storage-cap display.

## Running

```sh
maestro test apps/mobile/maestro/smoke-camera.yaml --device <udid-or-emulator-id>
maestro test apps/mobile/maestro/smoke-viewer.yaml --device <udid-or-emulator-id>
maestro test apps/mobile/maestro/smoke-gallery.yaml --device <udid-or-emulator-id>
```

Requires the app already built and installed (`npm --prefix ../web run
build && npx cap sync` + the platform build step in `apps/mobile/README.md`)
— `appId: dev.peersitter.app` is shared by both the iOS and Android builds.

## Notes for anyone extending these flows

- **WebView accessibility merges text.** Each home-screen card's title and
  description collapse into one accessible label (e.g. `"Be a Camera Turn
  this device into a monitoring camera and generate a pairing QR code."`).
  Match cards by regex (`.*Be a Camera.*`), not the visible title alone.
- **`stopApp` before `launchApp`.** This is a single-page app with
  in-memory navigation state (no router). Without a hard kill, the WKWebView
  process can survive `launchApp`'s `clearState`, leaving the app on
  whatever screen a previous run navigated to.
- **`retryTapIfNoChange: false` on the "← Back" tap.** Both the Camera and
  Viewer screens show a live-updating elapsed-time counter. Maestro's
  default tap-retry heuristic (which checks whether the UI hierarchy
  changed after a tap to decide if it needs to retry) gets confused by a
  hierarchy that's *always* changing regardless of the tap, and can end up
  never actually registering the navigation. Explicitly disabling it fixes
  this.
- **Flows are kept short and single-purpose.** Longer combined flows (e.g.
  home → camera → back → viewer → back → gallery in one file) were
  noticeably less reliable through Maestro's MCP tool integration than the
  same steps split into focused, independent flows — even with identical
  commands and waits. If you're debugging a flaky assertion deep into a
  long flow, try isolating it into its own short flow before assuming it's
  an app bug.
