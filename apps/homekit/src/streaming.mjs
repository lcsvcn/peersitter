import { spawn, execFile } from "node:child_process";
import dgram from "node:dgram";
import { promisify } from "node:util";
import hap from "hap-nodejs";
import {
  parseAvfoundationDevices,
  pickVideoDevice,
  pickAudioDevice,
  buildStreamArgs,
  buildSnapshotArgs,
} from "./ffmpeg.mjs";

const { StreamRequestTypes, CameraController } = hap;
const execFileP = promisify(execFile);
const SNAPSHOT_TTL_MS = 5000;

/** Ask the OS for a free UDP port by binding to 0 and releasing it. */
function pickUdpPort() {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    sock.once("error", reject);
    sock.bind(0, () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
  });
}

export async function detectDevices(ffmpegPath) {
  // ffmpeg exits non-zero for this listing; the device list is on stderr.
  const out = await execFileP(ffmpegPath, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
    .then((r) => r.stderr)
    .catch((e) => e.stderr ?? "");
  const all = parseAvfoundationDevices(out);
  return { video: pickVideoDevice(all.video), audio: pickAudioDevice(all.audio), all };
}

/** True if ffmpeg can actually open this mic (false when macOS microphone permission is denied). */
export function probeAudio(ffmpegPath, index, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", `:${index}`, "-t", "0.2", "-f", "null", "-"], {
      stdio: "ignore",
    });
    // SIGKILL, not SIGTERM: ffmpeg ignores SIGTERM while blocked on a pending macOS permission prompt.
    const timer = setTimeout(() => ff.kill("SIGKILL"), timeoutMs);
    ff.on("error", () => resolve(false));
    ff.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Bridges HomeKit's SRTP streaming protocol to ffmpeg reading the Mac's
 * camera through AVFoundation. HomeKit negotiates the encoding and the
 * keys; ffmpeg encodes straight to the controller (the Home app / Apple TV /
 * HomePod hub) — frames never pass through this process.
 */
export class FfmpegStreamingDelegate {
  constructor({ ffmpegPath, videoDevice, audioDevice, log }) {
    this.ffmpegPath = ffmpegPath;
    this.videoDevice = videoDevice;
    this.audioDevice = audioDevice;
    this.log = log;
    this.pending = new Map(); // sessionID -> prepared session
    this.running = new Map(); // sessionID -> ChildProcess
    this.lastSnapshot = null;
    this.onStreamState = () => {};
  }

  setController(controller) {
    this.controller = controller;
  }

  handleSnapshotRequest(request, callback) {
    if (this.lastSnapshot && Date.now() - this.lastSnapshot.at < SNAPSHOT_TTL_MS) {
      callback(undefined, this.lastSnapshot.buffer);
      return;
    }
    const args = buildSnapshotArgs({ videoDevice: this.videoDevice, width: request.width, height: request.height });
    const ff = spawn(this.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => (stderr += c));
    ff.on("error", (e) => callback(e));
    ff.on("close", () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        this.log(`snapshot failed: ${stderr.trim() || "no frame (camera permission denied?)"}`);
        callback(new Error("snapshot failed"));
        return;
      }
      this.lastSnapshot = { at: Date.now(), buffer };
      callback(undefined, buffer);
    });
  }

  async prepareStream(request, callback) {
    try {
      const videoLocalPort = await pickUdpPort();
      const audioLocalPort = await pickUdpPort();
      const videoSSRC = CameraController.generateSynchronisationSource();
      const audioSSRC = CameraController.generateSynchronisationSource();

      this.pending.set(request.sessionID, {
        address: request.targetAddress,
        videoPort: request.video.port,
        videoLocalPort,
        videoSSRC,
        videoSrtpKey: request.video.srtp_key,
        videoSrtpSalt: request.video.srtp_salt,
        audioPort: request.audio.port,
        audioLocalPort,
        audioSSRC,
        audioSrtpKey: request.audio.srtp_key,
        audioSrtpSalt: request.audio.srtp_salt,
      });

      // HomeKit's setup handshake has the accessory echo the controller's
      // SRTP key/salt back; ffmpeg then encrypts the outgoing streams with
      // that same key. `port` is where we listen for the controller's RTCP
      // (ffmpeg's localrtcpport).
      callback(undefined, {
        video: {
          port: videoLocalPort,
          ssrc: videoSSRC,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
        audio: {
          port: audioLocalPort,
          ssrc: audioSSRC,
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt,
        },
      });
    } catch (e) {
      callback(e);
    }
  }

  handleStreamRequest(request, callback) {
    const id = request.sessionID;
    switch (request.type) {
      case StreamRequestTypes.START: {
        const session = this.pending.get(id);
        if (!session) return callback(new Error("unknown session"));
        this.pending.delete(id);

        const args = buildStreamArgs({
          videoDevice: this.videoDevice,
          audioDevice: this.audioDevice,
          session,
          request,
        });
        this.log(`stream ${id.slice(0, 8)} start: ${request.video.width}x${request.video.height}@${request.video.fps}`);
        const ff = spawn(this.ffmpegPath, ["-hide_banner", "-loglevel", "warning", ...args], {
          stdio: ["ignore", "ignore", "pipe"],
        });
        this.running.set(id, ff);
        this.onStreamState({ streaming: true, sessions: this.running.size });
        ff.stderr.on("data", (d) => this.log(`ffmpeg: ${d.toString().trim()}`));
        ff.on("error", (e) => this.log(`ffmpeg failed to start: ${e.message}`));
        ff.on("close", (code, signal) => {
          if (this.running.get(id) === ff) {
            // Died on its own (not via STOP): tell HomeKit so the Home app
            // shows an error instead of spinning forever.
            this.running.delete(id);
            if (code !== 0 && signal !== "SIGKILL") {
              this.log(`ffmpeg exited with code ${code}`);
              this.controller?.forceStopStreamingSession(id);
            }
          }
          this.onStreamState({ streaming: this.running.size > 0, sessions: this.running.size });
        });
        // Returning before ffmpeg is producing frames is what homebridge-camera-ffmpeg does too.
        return callback();
      }
      case StreamRequestTypes.RECONFIGURE:
        // ffmpeg can't change bitrate mid-stream; the negotiated one stays in force.
        return callback();
      case StreamRequestTypes.STOP: {
        const ff = this.running.get(id);
        this.running.delete(id);
        this.pending.delete(id);
        ff?.kill("SIGKILL");
        this.log(`stream ${id.slice(0, 8)} stop`);
        return callback();
      }
    }
  }

  stopAll() {
    for (const ff of this.running.values()) ff.kill("SIGKILL");
    this.running.clear();
  }
}
