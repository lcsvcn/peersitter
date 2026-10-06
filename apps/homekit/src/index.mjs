#!/usr/bin/env node
// Publishes this Mac's camera as a HomeKit IP camera. Speaks newline-delimited
// JSON on stdout (events) and stdin (commands) so the desktop shell can drive
// it; human-readable logs go to stderr.
import readline from "node:readline";
import hap from "hap-nodejs";
import { loadIdentity, stateDir } from "./config.mjs";
import { FfmpegStreamingDelegate, detectDevices, probeAudio } from "./streaming.mjs";

const {
  Accessory, Categories, CameraController, HAPStorage, uuid,
  H264Profile, H264Level, SRTPCryptoSuites, AudioStreamingCodecType, AudioStreamingSamplerate,
  AccessoryEventTypes,
} = hap;

const log = (msg) => process.stderr.write(`[homekit] ${msg}\n`);
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\n");

const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";
const name = process.env.PEERSITTER_HOMEKIT_NAME ?? "PeerSitter Camera";

HAPStorage.setCustomStoragePath(stateDir());
const identity = loadIdentity();

const devices = await detectDevices(ffmpegPath).catch((e) => {
  emit({ event: "error", message: `ffmpeg not usable (${e.message}). Install it with: brew install ffmpeg` });
  process.exit(1);
});
const videoDevice = process.env.PEERSITTER_VIDEO_DEVICE ?? devices.video?.index;
let audioDevice = process.env.PEERSITTER_AUDIO_DEVICE === "none"
  ? null
  : (process.env.PEERSITTER_AUDIO_DEVICE ?? devices.audio?.index ?? null);
if (audioDevice != null && !(await probeAudio(ffmpegPath, audioDevice))) {
  log("microphone unavailable (permission denied?) — streaming video only");
  audioDevice = null;
}
if (videoDevice == null) {
  emit({ event: "error", message: "No camera found. Check System Settings → Privacy & Security → Camera." });
  process.exit(1);
}
log(`video device ${videoDevice} (${devices.video?.name ?? "override"}), audio ${audioDevice ?? "off"}`);

const delegate = new FfmpegStreamingDelegate({ ffmpegPath, videoDevice, audioDevice, log });

const controller = new CameraController({
  cameraStreamCount: 2,
  delegate,
  sensors: { motion: true },
  streamingOptions: {
    supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
    video: {
      resolutions: [
        [1280, 720, 30], [1024, 768, 30], [640, 480, 30], [640, 360, 30],
        [480, 360, 30], [480, 270, 30], [320, 240, 30], [320, 180, 30],
      ],
      codec: {
        profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
        levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
      },
    },
    audio: {
      twoWayAudio: false,
      codecs: [{ type: AudioStreamingCodecType.OPUS, samplerate: AudioStreamingSamplerate.KHZ_24 }],
    },
  },
});
delegate.setController(controller);

const accessory = new Accessory(name, uuid.generate(`peersitter:${identity.username}`));
accessory.getService(hap.Service.AccessoryInformation)
  .setCharacteristic(hap.Characteristic.Manufacturer, "PeerSitter")
  .setCharacteristic(hap.Characteristic.Model, "Mac Camera")
  .setCharacteristic(hap.Characteristic.SerialNumber, identity.username.replaceAll(":", ""));
accessory.configureController(controller);

const isPaired = () => Boolean(accessory._accessoryInfo?.paired?.());

accessory.on(AccessoryEventTypes.PAIRED, () => emit({ event: "paired" }));
accessory.on(AccessoryEventTypes.UNPAIRED, () => emit({ event: "unpaired" }));
delegate.onStreamState = (s) => emit({ event: "stream", ...s });

await accessory.publish({
  username: identity.username,
  pincode: identity.pincode,
  category: Categories.IP_CAMERA,
});

emit({
  event: "ready",
  name,
  pincode: identity.pincode,
  setupURI: accessory.setupURI(),
  paired: isPaired(),
  video: devices.video?.name ?? String(videoDevice),
  audio: audioDevice == null ? null : (devices.audio?.name ?? String(audioDevice)),
});
log(`Home app → Add Accessory → "${name}" · setup code ${identity.pincode}`);

// Commands from the desktop shell: {"cmd":"motion","detected":true}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.cmd === "motion") {
      controller.motionService?.updateCharacteristic(hap.Characteristic.MotionDetected, Boolean(msg.detected));
    }
  } catch {
    log(`ignoring malformed command: ${line}`);
  }
}).on("close", () => shutdown()); // parent went away → don't linger holding the camera

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  delegate.stopAll();
  await accessory.unpublish().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
