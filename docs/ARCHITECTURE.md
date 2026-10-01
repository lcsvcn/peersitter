# Architecture

## Roles

Every device runs the same app and picks a role at runtime:

- **Camera** — captures local camera/mic, streams it out.
- **Viewer** — scans a pairing code, watches the stream.

There is no third role and no account system. Pairing is per-session: each
time a Camera starts, it mints a fresh random room id and certificate.

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
