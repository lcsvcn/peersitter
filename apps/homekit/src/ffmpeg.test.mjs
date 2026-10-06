import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAvfoundationDevices,
  pickVideoDevice,
  pickAudioDevice,
  buildStreamArgs,
  buildSnapshotArgs,
} from "./ffmpeg.mjs";

const LISTING = `
[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] iPhone do Lucas Camera
[AVFoundation indev @ 0x1] [1] MacBook Pro Camera
[AVFoundation indev @ 0x1] [2] MacBook Pro Desk View Camera
[AVFoundation indev @ 0x1] [3] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] iPhone do Lucas Microphone
[AVFoundation indev @ 0x1] [1] External Microphone
[AVFoundation indev @ 0x1] [2] MacBook Pro Microphone
`;

test("parses and picks the built-in webcam and mic, not Continuity/Desk View", () => {
  const d = parseAvfoundationDevices(LISTING);
  assert.equal(d.video.length, 4);
  assert.equal(pickVideoDevice(d.video).index, 1);
  assert.equal(pickAudioDevice(d.audio).index, 2);
});

const session = {
  address: "192.168.1.20",
  videoPort: 5000, videoLocalPort: 6000, videoSSRC: 111,
  videoSrtpKey: Buffer.alloc(16, 1), videoSrtpSalt: Buffer.alloc(14, 2),
  audioPort: 5002, audioLocalPort: 6002, audioSSRC: 222,
  audioSrtpKey: Buffer.alloc(16, 3), audioSrtpSalt: Buffer.alloc(14, 4),
};
const request = {
  video: { fps: 30, width: 1280, height: 720, max_bit_rate: 1000, profile: 1, level: 2, pt: 99, mtu: 1316 },
  audio: { sample_rate: 24, bit_rate: 24, channel: 1, packet_time: 20, pt: 110 },
};

test("stream args carry SRTP params for both video and audio", () => {
  const args = buildStreamArgs({ videoDevice: 1, audioDevice: 1, session, request });
  assert.ok(args.includes("1:1"));
  assert.ok(args.includes("srtp://192.168.1.20:5000?rtcpport=5000&localrtcpport=6000&pkt_size=1316"));
  assert.ok(args.includes("srtp://192.168.1.20:5002?rtcpport=5002&localrtcpport=6002&pkt_size=188"));
  assert.equal(args[args.indexOf("-srtp_out_params") + 1].length, 40); // base64 of 30 bytes
  assert.equal(args[args.indexOf("-level:v") + 1], "4.0");
  assert.equal(args[args.indexOf("-ar") + 1], "24000");
});

test("stream args omit audio when there is no microphone", () => {
  const args = buildStreamArgs({ videoDevice: 1, audioDevice: null, session, request });
  assert.ok(args.includes("1"));
  assert.ok(!args.includes("libopus"));
});

test("snapshot args write one JPEG to stdout", () => {
  const args = buildSnapshotArgs({ videoDevice: 1, width: 640, height: 360 });
  assert.equal(args.at(-1), "pipe:1");
  assert.ok(args.includes("mjpeg"));
});
