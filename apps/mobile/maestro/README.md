# Maestro UI tests

Eight flows, driven against the real installed app (not a dev server) on
iOS Simulator and Android emulator — confirmed passing on both unless
noted otherwise:

- `smoke-camera.yaml` — Home → Camera role → verifies permission-gated
  camera UI and the motion-recording toggle render correctly → back to Home.
- `smoke-viewer.yaml` — Home → Viewer role → exercises the "paste the code
  instead" pairing fallback (no camera/QR needed).
- `smoke-gallery.yaml` — Home → Recordings → verifies the empty-state
  Gallery UI and storage-cap display.
- `permission-denied-camera.yaml` — confirms denying camera/mic doesn't
  crash the Camera role; it surfaces a visible error state instead.
  **Android only** — see the TCC note below.
- `permission-denied-viewer.yaml` — confirms the Viewer role's
  deliberate graceful-degradation path (no camera → paste-fallback still
  usable) actually holds at runtime. **Android only**, same reason.
- `settings-persistence.yaml` — confirms a changed setting survives a
  full native process kill + relaunch (localStorage inside the native
  WebView, not just a React re-render). Passes on both platforms.

- `multi-camera.yaml` / `multi-viewer.yaml` — building blocks for
  `multi-device.sh`, the multi-device integration run: N Android emulators
  as named Cameras and M phones as Viewers that each add the first two
  cameras to their dashboard, all through one local signaling server. The
  script reads each camera's pairing code out of the Android accessibility
  tree, runs the viewer flows in parallel, then checks on the cameras that
  every one reports all viewers (`Viewers watching: M`). Verified with 2
  Android cameras + 3 iOS-simulator viewers (6 live WebRTC links).

```sh
CAMERAS="emulator-5554:Nursery emulator-5556:Garage" \
VIEWERS="ios:<udid> ios:<udid> ios:<udid>" ./multi-device.sh
```

  It needs no TLS: iOS simulators share the host's loopback and
  `adb reverse` maps each emulator's `localhost:8787` there. Use iOS 26.x
  simulators and keep Android emulators as Cameras only (see Platform
  limits in `docs/ARCHITECTURE.md`).

## Running

```sh
maestro test apps/mobile/maestro/smoke-camera.yaml --device <udid-or-emulator-id>
# ...same for the other flows
```

Requires the app already built and installed (`npm --prefix ../web run
build && npx cap sync` + the platform build step in `apps/mobile/README.md`)
— `appId: dev.peersitter.app` is shared by both the iOS and Android builds.

For the two `permission-denied-*` flows specifically, also revoke the
permission first so there's something to deny:
```sh
adb shell pm revoke dev.peersitter.app android.permission.CAMERA
adb shell pm revoke dev.peersitter.app android.permission.RECORD_AUDIO
```

## Findings worth knowing before you extend these

### App-level (real, verified against the actual code/behavior)

- **The Android WebView accessibility tree can omit an element that's
  genuinely on screen.** `Camera.tsx`'s `{error && <p class="error">
  {error}</p>}` renders and is visible in every screenshot taken during
  testing, but is reproducibly **absent** from the accessibility snapshot
  `assertVisible`/`inspect_screen` read from on Android — confirmed by
  diffing the dump against DOM order (the element is skipped between the
  status line and the motion checkbox, exactly where it should be).
  `assertVisible` can never see that specific element. Assert on the
  `Status:` value (`"error"`) instead, and verify message text via
  `takeScreenshot` + visual read, not an automated assertion.
- **Android's Capacitor WebView requires `wss://`, not `ws://`, for any
  non-localhost signaling URL** — a strict HTTPS mixed-content
  restriction that iOS's WKWebView doesn't enforce as strictly. Full
  writeup in `docs/ARCHITECTURE.md` ("The signaling URL must be `wss://`,
  not `ws://`, for Android") — found via a real cross-platform pairing
  attempt (iOS Camera, Android Viewer, over the host's real LAN IP): the
  iOS Camera created a signaling room fine; the Android Viewer's
  `new WebSocket(...)` threw synchronously with `Failed to construct
  'WebSocket': An insecure WebSocket connection may not be initiated from
  a page loaded over HTTPS.` The app handled it gracefully (a visible
  `error` status, not a crash) but the pairing never completed. This is a
  genuine production-relevant finding, not a test artifact — it affects
  anyone self-hosting the signaling server on bare LAN hardware (e.g. a
  Raspberry Pi) without TLS in front of it.
- **A cosmetic nit**: Camera.tsx shows "Watching for motion…" even when
  there's no active stream (e.g. permission denied) — `useMotionRecording`
  correctly no-ops with a null stream, but the status text isn't
  conditioned on that. Harmless, but slightly misleading. Not fixed as
  part of this testing pass since it's cosmetic only.

- **Android camera/mic permission was silently broken until multi-device
  testing:** the manifest lacked `MODIFY_AUDIO_SETTINGS`, which Capacitor's
  WebView requires before it grants `getUserMedia({audio})`, so on Android
  the Camera role always ended in `Permission denied` even with permissions
  granted. That also meant the `permission-denied-*` flows were passing for
  the wrong reason; they now use `launchApp: permissions: {all: deny}`.
  Maestro's `launchApp` grants everything by default.
- **Android blocks cleartext `ws://`** (`ERR_CLEARTEXT_NOT_PERMITTED`) even
  to localhost; fixed in the manifest + Capacitor config.
- **Typing a long JSON pairing code with `inputText` garbles it on Android**
  (doubled `{`, dropped characters). Use `setClipboard` + `pasteText`. The
  Viewer's paste field connects as soon as it holds a valid code, so no
  Connect tap (and no on-screen keyboard dismissal) is needed.
- **Each camera tile fills a phone screen**, so the second tile is below the
  fold and absent from the accessibility snapshot; `scrollUntilVisible` to
  it. Likewise the Android WebView doesn't expose the motion checkbox's
  label text once the live preview runs, so `smoke-camera.yaml` asserts on
  the motion status line instead.

### Platform/tooling quirks (not app bugs — don't "fix" the app for these)

- **`launchApp`'s `permissions` block doesn't suppress Android's native
  runtime dialog.** Capacitor's WebView triggers its own per-request
  permission prompt regardless of any pre-set app-level grant state.
  Revoke permissions via `adb shell pm revoke` before the flow instead,
  and tap through the dialog if it appears (it won't if the permission
  was already explicitly denied once — Android/Chrome skip re-prompting
  after that, going straight to the app's error state).
- **iOS Simulator doesn't gate WKWebView camera/microphone access via TCC
  at all.** `xcrun simctl privacy ... revoke camera <bundle-id>` is
  rejected outright (`camera` isn't a valid service for that command —
  only `microphone` is), and revoking `microphone` has no effect either:
  `getUserMedia({video:true, audio:true})` succeeds unconditionally on
  Simulator regardless of privacy settings, backed by a genuinely
  animated synthetic camera feed (SMPTE color bars + live timecode —
  useful for motion-detection testing, see below). **The permission-denial
  flows are consequently untestable on iOS Simulator** — they'd need a
  real device, where TCC consent is actually real. This is also why
  `permission-denied-*.yaml` are marked Android-only above.
- **`hideKeyboard` is flaky on iOS** (Maestro's own docs note this).
  Tap a neutral nearby label instead to shift focus away from a text
  field — dismisses the keyboard as a side effect on both platforms, more
  reliably than the dedicated command.
- **A tap can land on the on-screen keyboard instead of its target** if
  the target (e.g. a "Connect" button right below a just-filled text
  field) is positioned low enough to sit under the keyboard's screen
  region. The element still resolves in the accessibility tree (so
  `tapOn` doesn't error), but the physical tap coordinates hit the
  keyboard overlay and nothing happens. Dismiss the keyboard first.
- **Long, content-heavy screens need explicit scrolling** —
  `assertVisible`/`extendedWaitUntil` only see what's in the current
  accessibility snapshot, which only covers on-screen content; an
  off-screen element (confirmed via `inspect_screen` reporting "2 pages"
  of vertical scroll) simply isn't there until you `scrollUntilVisible`
  to it. The Camera screen's QR code section is tall enough to push the
  motion-recording controls below the fold on a standard-height
  simulator/emulator — `smoke-camera.yaml` scrolls down to reach them,
  then back up before tapping "← Back".
- **WebView accessibility merges text.** Each home-screen card's title
  and description collapse into one accessible label (e.g. `"Be a Camera
  Turn this device into a monitoring camera and generate a pairing QR
  code."`). Match cards by regex (`.*Be a Camera.*`), not the visible
  title alone.
- **`stopApp` before `launchApp`.** This is a single-page app with
  in-memory navigation state (no router). Without a hard kill, the
  WKWebView process can survive `launchApp`'s `clearState`, leaving the
  app on whatever screen a previous run navigated to.
- **`retryTapIfNoChange: false` on the "← Back" tap.** Both the Camera
  and Viewer screens show a live-updating elapsed-time counter. Maestro's
  default tap-retry heuristic (which checks whether the UI hierarchy
  changed after a tap to decide if it needs to retry) gets confused by a
  hierarchy that's *always* changing regardless of the tap, and can end
  up never actually registering the navigation. Explicitly disabling it
  fixes this.
- **Flows are kept short and single-purpose.** Longer combined flows
  (e.g. home → camera → back → viewer → back → gallery in one file) were
  noticeably less reliable through Maestro's MCP tool integration than
  the same steps split into focused, independent flows — even with
  identical commands and waits. If you're debugging a flaky assertion
  deep into a long flow, try isolating it into its own short flow before
  assuming it's an app bug.

## What a real cross-platform pairing test needs

Proven working up to the point blocked by the `wss://` requirement above:
an iOS Camera can create a signaling room on a custom, non-default
signaling URL (set live via the Settings panel) and reach
"waiting-for-viewer"; the pairing code can be extracted from the device
via `inspect_screen` (the paste-fallback textarea's `val` field holds the
exact JSON) and fed into a second device's paste-fallback field with
`inputText` to drive a real, non-simulated pairing — no QR camera-to-
camera scanning needed. To actually reach `connected` status end-to-end
cross-platform, stand up the signaling server behind TLS first (even a
self-signed cert trusted into both the Android emulator's and iOS
Simulator's trust stores would do for local testing) and point both
devices at the resulting `wss://` URL.
