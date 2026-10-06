# PeerSitter

An open-source, peer-to-peer alternative to [Alfred Camera](https://alfred.camera/pt):
turn one device into a security camera and another into a viewer, with the
video encrypted end-to-end straight between them — no cloud account, no
company server watching your feed, no storage subscription.

## Why

Alfred Camera routes your video through its own cloud. This project does
the same job (spare-phone-as-camera monitoring) but:

- **100% open source** (MIT) — every line, including the tiny signaling
  relay, is in this repo.
- **Encrypted, peer-to-peer** — video/audio go directly between your two
  devices over WebRTC (the same encrypted-transport tech behind WhatsApp
  and Signal calls). The only server involved relays connection setup
  info, never media — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Records only when something moves** — a lightweight on-device motion
  detector (frame-diffing, no cloud ML) starts recording when it sees
  movement and stops once things go quiet, instead of recording
  continuously.
- **Free local recording, self-capping** — clips save straight to the
  device (browser-private storage on web, app-private storage on native)
  with a configurable size cap; once full, the oldest clips are deleted
  automatically, like a dashcam ring buffer. No cloud storage bill, no
  manual cleanup.

## Structure

```
signaling-server/   tiny WebSocket relay: bootstraps WebRTC connections, never touches media
packages/core/       shared pairing / WebRTC / recording logic
apps/web/            the actual app (React) — Camera and Viewer roles
apps/mobile/         Capacitor shell → real iOS/Android app from apps/web
apps/desktop/        Tauri shell → real Windows/macOS/Linux app from apps/web
apps/homekit/        HomeKit bridge: shows a Mac as a camera in the Apple Home app (see its README)
docs/ARCHITECTURE.md how pairing, encryption, and NAT traversal work
```

## Quickstart (web, two browser tabs/devices)

```sh
npm install

# terminal 1
npm run dev:signal

# terminal 2
npm run dev:web
```

Open the printed URL on one device, choose **Be a Camera**; open it on a
second device, choose **Be a Viewer**, and scan the Camera's QR code.

Camera/mic access requires a secure context. `localhost` works for
same-machine testing; to pair two devices on your LAN, serve both over
HTTPS (e.g. `vite --host` behind a reverse proxy, or a tool like
[`mkcert`](https://github.com/FiloSottile/mkcert) + a local cert) or use
a tunnel (ngrok/Cloudflare Tunnel) pointed at both the web app and the
signaling server.

No camera handy, or pairing two desktops? Use the "paste the code
instead" fallback on the Viewer screen with the text shown under the
Camera's QR code — no scanning required.

### Automated end-to-end test

`apps/web/e2e/smoke.mjs` drives the whole flow with Playwright and two
fake camera devices: starts both servers, pairs a Camera and Viewer via
the paste-code fallback, waits for the encrypted connection and
fingerprint verification, confirms motion-triggered recording kicks in,
and checks the clip lands in the Gallery under the storage cap.

```sh
npm run build --workspace=apps/web   # once
npm run test:e2e --workspace=apps/web
```

### e2e framework (deterministic + agentic)

`apps/web/tests/*.e2e.ts` use [e2e](https://tester.army/e2e): fast
deterministic checks of the home and viewer screens, plus an agentic test
(`agent.act` / `agent.assert`) that runs only when `AI_GATEWAY_API_KEY` is
set. The runner starts the Vite dev server itself.

```sh
npm run test:e2e:agentic --workspace=apps/web
```

## Self-hosting the signaling server for $0

It's a stateless Node process (`signaling-server/`) — deploy it free on
any platform with a free web-service tier (Render, Fly.io, Railway, a
spare Raspberry Pi on your own network, etc.) and point the app at it via
the "Advanced: signaling server" field on the home screen, or
`VITE_SIGNALING_URL` at build time. It costs nothing to run because it
only ever pushes a handful of small JSON messages per pairing, never
media.

**Use a `wss://` URL, not `ws://`, unless every device is on
`localhost`.** Render/Fly.io/Railway give you `wss://` automatically, so
this is a non-issue on those — but the Android app specifically refuses
to open a plain `ws://` connection to anything other than
`localhost`/`127.0.0.1` (a WebView mixed-content restriction; iOS doesn't
enforce this). Self-hosting on bare LAN hardware like a Raspberry Pi
needs TLS in front of it (e.g. Caddy) for Android devices to pair at
all — see `docs/ARCHITECTURE.md`.

## Native apps

`apps/web` is the only app codebase. `apps/mobile` (Capacitor → iOS +
Android) and `apps/desktop` (Tauri → macOS/Windows/Linux) are native
shells around its build output, checked in and confirmed building,
installing, and launching the real app:

- **macOS**: `cd apps/desktop && npm run build` → `.app` in
  `src-tauri/target/release/bundle/macos/`.
- **iOS**: builds and runs in Simulator via `xcodebuild`; for installing
  on your own device through **AltStore** (no App Store, no paid
  developer account), see `apps/mobile/README.md`.
- **Android**: builds a debug APK via `./gradlew assembleDebug` (needs
  JDK 21 specifically, see `apps/mobile/README.md`); sideload it with
  `adb install` or publish it yourself via Google Play (that costs
  Google's standard one-time $25 developer fee — unavoidable on their
  end, not this project's).

See each app's README for exact commands and the couple of one-time
environment fixes (JDK version, iOS deployment target) this repo already
has baked in.

## Security model, in short

- All media is encrypted end-to-end via WebRTC's mandatory DTLS-SRTP —
  nothing in transit is ever plaintext, including to the signaling
  server, which doesn't see media at all.
- The Viewer verifies the Camera's identity by comparing the DTLS
  fingerprint baked into the QR code (scanned out-of-band) against what
  was actually negotiated, so even a malicious signaling server can't
  silently MITM the pairing. Details in
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#why-the-signaling-server-isnt-a-trust-problem).

This hasn't had an independent security audit — treat it as a solid
starting architecture, not a guarantee, until one happens.

## Known gaps / roadmap

- No background streaming on mobile yet (screen must stay on) — needs a
  background-mode plugin, see `apps/mobile/README.md`.
- No TURN relay configured by default, so a minority of restrictive
  networks may fail to connect P2P — see the NAT traversal section in
  `docs/ARCHITECTURE.md`.
- No push notifications on motion yet.
- Clip storage (`packages/core/src/storageManager.ts`) uses the browser's
  Origin Private File System, which works identically inside the
  Capacitor/Tauri webviews; swapping it for each platform's native
  filesystem API is only worth doing if you need clips accessible outside
  the app's own Gallery screen (e.g. in the OS Photos/Files app).
- On the Android build, granting the camera + microphone permission
  dialogs can occasionally still result in `getUserMedia` reporting
  `Permission denied` due to a WebView permission-bridging timing race —
  see `apps/mobile/README.md` for the diagnosis and fix path.

## License

MIT — see [`LICENSE`](LICENSE).

## Legal

- [Privacy Policy](https://lcsvcn.github.io/peersitter/privacy.html)
- [Terms of Use](https://lcsvcn.github.io/peersitter/terms.html)
