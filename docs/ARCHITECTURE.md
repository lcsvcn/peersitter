# Architecture

## Roles

Every device runs the same app and picks a role at runtime:

- **Camera** — captures local camera/mic, streams it out.
- **Viewer** — scans a pairing code, watches the stream.

There is no third role and no account system. Pairing is per-session: each
time a Camera starts, it mints a fresh random room id and certificate.

## Topology: many cameras, many viewers

A system can have any number of Cameras and any number of Viewers, e.g. four
spare Android phones as Cameras and four phones (iOS or Android) as Viewers.

- **A Camera is a hub.** It keeps one signaling room open and runs one
  independent WebRTC connection per Viewer (`PeerLink` per peer, multiplexed
  over a single signaling socket via `SignalingClient.channelFor(peerId)`).
  Viewers can join and leave at any time; the pairing QR stays valid. The relay
  caps viewers per camera (`MAX_VIEWERS_PER_CAMERA`, default 8) because each
  Viewer costs the Camera another encoded upstream.
- **A Viewer is a dashboard.** Each scanned/pasted code adds a tile with its
  own signaling socket and WebRTC link; tiles can be removed or enlarged
  (only the enlarged tile plays sound). Adding the same camera twice is
  refused.
- **Cameras and Viewers never need to know about each other.** N cameras x M
  viewers is just N x M independent links; the relay only ever sees one small
  room per camera.
- **Camera names** (Settings → Camera name) travel in the pairing code and
  label the Viewer's tiles.
- **Resilience.** A Camera that loses the relay (restart, Wi-Fi blip) keeps
  its existing streams, retries, and re-registers with a fresh code. The relay
  drops a Camera whose device vanished (ping/pong heartbeat) so dead rooms
  don't linger. A Camera going offline marks its tile "offline" on every
  Viewer without disturbing the others.

Relay protocol (all JSON): `create-room` → `room-created{roomId}`;
`join-room{roomId}` → `joined{peerId}` (host gets `peer-joined{peerId}`);
`signal{data}` from a viewer reaches the host tagged `from`; `signal{to,data}`
from the host reaches that viewer only (without `to` it broadcasts, the
original 1:1 behaviour); `peer-left{peerId?}`; errors `room-not-found` and
`room-full`. Viewers never see each other's traffic.

## Design system

The UI follows each platform's own design language, in light and dark:

| Platform | Style (`data-design`) | Look |
| --- | --- | --- |
| iOS, iPadOS, macOS (incl. the Tauri desktop app) | `glass` | Liquid Glass: translucent blurred surfaces over soft colour, capsule controls, SF type, iOS-style switches |
| Android, web, Windows, Linux | `material` | Material 3 / You: tonal surfaces, pill buttons, Roboto, M3 switches and segmented buttons |

`src/theme.ts` picks the style by user agent (override: Settings → Design
style) and light/dark from the OS (override: Settings → Theme), setting
`data-design` / `data-theme` on `<html>` before first paint; `src/styles.css`
holds the four token sets and the components only use semantic tokens.
Contrast is >= 4.5:1 for text (WCAG AA), >= 3:1 for outlines and focus rings,
touch targets >= 44px, focus rings on everything, reduced-motion respected,
and QR codes always render dark-on-white so they scan in dark mode.

`npm run test:e2e:design --workspace=apps/web` drives every screen in all
four style/theme combinations on phone and desktop viewports, screenshots them
(`apps/web/e2e/design-shots/`), and fails on any serious axe-core violation
(WCAG 2 A/AA, including colour contrast).

## Connection setup (signaling)

```
 Camera                    signaling-server                 Viewer
   |  create-room                  |                            |
   |------------------------------>|                            |
   |  roomId                       |                            |
   |<------------------------------|                            |
   |  (shows roomId + fingerprint  |                            |
   |   as a QR code)                                            |
   |                                |      join-room(roomId)     |
   |                                |<----------------------------
   |        peer-joined            |                            |
   |<------------------------------|                            |
   |  offer (SDP)                  |                            |
   |------------------------------>|--------------------------->|
   |                                |         answer (SDP)       |
   |<-------------------------------|<---------------------------
   |  ICE candidates <----------------------------------------->|
   |                                |                            |
   ================== direct WebRTC media/data ==================
```

`signaling-server/` only ever relays the messages between the `|` arrows
above: room bootstrapping and opaque SDP/ICE blobs. It cannot decrypt or
record media because media never routes through it at all — once ICE
negotiation finishes, video/audio/data flow directly between the two
devices (or through a STUN-negotiated NAT hole-punch, or a TURN relay as a
last resort — see below), encrypted via WebRTC's mandatory DTLS-SRTP.

## Why the signaling server isn't a trust problem

A dishonest or compromised signaling server could still try to
man-in-the-middle the handshake by substituting its own SDP answer. The
fingerprint check defeats this:

1. The Camera generates its DTLS certificate **before** talking to
   signaling at all, and bakes that certificate's SHA-256 fingerprint into
   the QR code.
2. The Viewer scans the QR code directly — that channel never touches the
   signaling server.
3. After the WebRTC handshake completes, the Viewer re-derives the
   fingerprint that was actually negotiated (`a=fingerprint:sha-256 …` in
   the remote SDP) and compares it to the one from the QR code.
4. A mismatch means someone tampered with the handshake; the Viewer
   refuses the connection (`fingerprint-mismatch` state in `Viewer.tsx`).

This is the same pattern Signal/WhatsApp-style "safety numbers" use, just
automated instead of requiring a manual compare.

## Plain `ws://` signaling on Android

Android blocks cleartext (non-TLS) network traffic by default
(`net::ERR_CLEARTEXT_NOT_PERMITTED`), and the Capacitor WebView additionally
blocks `ws://` from its `https://` app origin as mixed content. Both bit a
self-hosted relay on a bare LAN address (e.g. a Raspberry Pi) — found via real
device-to-device testing (`apps/mobile/maestro/README.md`). `ws://localhost`
failed too: there is no loopback exemption in the WebView.

The Android shell now opts in to both (`usesCleartextTraffic="true"` in the
manifest, `android.allowMixedContent` in `capacitor.config.ts`). This is safe
by design: signaling only carries SDP/ICE (never media), and the DTLS
fingerprint check above defeats a tampering relay, so TLS on the relay adds
little. `wss://` is still the better choice for relays exposed to the
internet (Render/Fly/Railway provide it automatically), but it is no longer
required for LAN or localhost relays on Android. iOS never had this
restriction.

## Known platform limits

- **iOS 27 simulator/OS:** apps built with the iOS 27 SDK must adopt the
  UIScene lifecycle. The Capacitor 7 shell doesn't, so it fails to launch
  there ("UIScene life cycle is required for apps built with this SDK").
  It runs on iOS 26.x. Fixing it needs a Capacitor upgrade or a manual
  scene-delegate migration.
- **Two Android emulators can't connect to each other:** every emulator sits
  behind its own NAT with the same `10.0.2.15` address, so ICE has no
  usable path. Android emulator ↔ iOS simulator works; real phones on a
  LAN are unaffected.

## NAT traversal: STUN and (optional) TURN

Pure P2P can't always punch through NAT/firewalls on its own:

- **STUN** (default: a public Google STUN server, configurable) lets both
  devices discover their public IP/port so they can usually connect
  directly — no relay, no cost.
- **TURN** is only needed as a fallback for restrictive networks
  (symmetric NAT, some corporate firewalls) where direct punching fails.
  A TURN relay forwards the already-encrypted media bytes — it still can't
  decrypt them — but it does cost bandwidth. This repo ships without one
  configured, so those edge-case networks may fail to connect; self-host
  [coturn](https://github.com/coturn/coturn) (free on a small VPS) and add
  it to `DEFAULT_ICE_SERVERS` in `packages/core/src/peerConnection.ts` if
  you need that reliability.

## Recording and storage

Recording happens locally via `MediaRecorder` on whichever stream you're
watching (local camera feed or the received remote stream) and is saved
straight to the device it runs on — a browser download on web, or
app-private storage via a native filesystem plugin on the Capacitor/Tauri
wrappers (see `apps/mobile/README.md`, `apps/desktop/README.md`). There is
no upload step and nothing this project runs incurs storage cost; the
trade-off is that recordings live only on the device that made them,
with no off-site backup unless you add one yourself.

## One codebase, three targets

`apps/web` is the only app code. `apps/mobile` (Capacitor) and
`apps/desktop` (Tauri) are thin native shells around its build output, so
iOS/Android/desktop stay in sync with the web app for free instead of
needing a parallel React Native implementation.
