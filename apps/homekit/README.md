# HomeKit bridge

Publishes this Mac's camera as a native **HomeKit IP camera**, so it appears in
the Apple Home app (and on Apple TV / HomePod hubs) next to real HomeKit
cameras: live view, snapshots, and a motion sensor.

It speaks the open HomeKit Accessory Protocol via
[`hap-nodejs`](https://github.com/homebridge/HAP-NodeJS) (the library
Homebridge is built on) and uses `ffmpeg` to read the camera through
AVFoundation and send SRTP straight to the Home hub. Video never passes
through this process or any server.

## Requirements

- macOS, with `node` ≥ 18 and `ffmpeg` (`brew install node ffmpeg`)
- Camera permission (and optionally Microphone — without it, video-only)
- Local Network permission (macOS asks the first time; needed for mDNS)

## Use it

**From the desktop app:** Home screen → *Apple Home (HomeKit)* → *Enable HomeKit
camera*, then in the Home app: **+ → Add Accessory** and scan the QR code (or
type the 8-digit code). While a Camera screen with motion detection is open,
PeerSitter's motion events are forwarded to HomeKit as a motion sensor.

**Standalone:**

```sh
cd apps/homekit && npm install && npm start
```

stdout is newline-delimited JSON events (`ready`, `paired`, `stream`, …);
logs go to stderr. Send `{"cmd":"motion","detected":true}` on stdin to trigger
the motion sensor. Closing stdin shuts it down.

| Env var | Purpose |
| --- | --- |
| `PEERSITTER_HOMEKIT_NAME` | Name shown in Home (default `PeerSitter Camera`) |
| `PEERSITTER_VIDEO_DEVICE` / `PEERSITTER_AUDIO_DEVICE` | AVFoundation index (`ffmpeg -f avfoundation -list_devices true -i ""`); audio `none` disables the mic |
| `PEERSITTER_HOMEKIT_DIR` | Pairing state (default `~/Library/Application Support/PeerSitter/homekit`) |
| `FFMPEG_PATH` | ffmpeg binary |

Delete the state dir to reset pairing (also remove the accessory in Home).

## Limitations (read before relying on it)

- **Not an Apple-certified accessory.** Apple's own HomeKit framework can only
  *control* accessories; publishing one uses the HAP protocol directly, and the
  Home app will show an "Uncertified Accessory" warning when adding it. Tap
  *Add Anyway*.
- **Live view, snapshots, and motion only.** HomeKit Secure Video (iCloud
  recording, person/package detection) is not implemented. PeerSitter's own
  on-device clip recording still works as before.
- Streaming needs the Mac awake with the app/bridge running.
- The packaged app finds `node`/`ffmpeg` in `/opt/homebrew/bin`, `/usr/local/bin`
  or `PATH` (override with `PEERSITTER_NODE` / `FFMPEG_PATH`); they are not
  bundled. Node installed via fnm/nvm needs `PEERSITTER_NODE`.

## Tests

`npm test` covers ffmpeg argument building and device selection. The SRTP
pipeline itself was checked against a live camera (encrypted RTP packets
received on a local UDP socket); pairing with a real Home app is manual.
