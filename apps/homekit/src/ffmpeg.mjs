// Pure helpers that build ffmpeg argument lists and parse ffmpeg's device
// listing. Kept free of side effects so they can be unit-tested without a
// camera.

const SRTP_SUITE = "AES_CM_128_HMAC_SHA1_80";

/** `ffmpeg -f avfoundation -list_devices true -i ""` prints to stderr. */
export function parseAvfoundationDevices(output) {
  const video = [];
  const audio = [];
  let section = null;
  for (const line of output.split("\n")) {
    if (/AVFoundation video devices/.test(line)) section = video;
    else if (/AVFoundation audio devices/.test(line)) section = audio;
    else if (section) {
      const m = line.match(/\[(\d+)\]\s+(.+?)\s*$/);
      if (m) section.push({ index: Number(m[1]), name: m[2] });
    }
  }
  return { video, audio };
}

/** Prefer a real built-in/USB webcam over Continuity Camera, Desk View, or screen capture. */
export function pickVideoDevice(devices) {
  const skip = /iphone|ipad|desk view|capture screen/i;
  return devices.find((d) => !skip.test(d.name)) ?? null;
}

export function pickAudioDevice(devices) {
  const skip = /iphone|ipad/i;
  const mics = devices.filter((d) => /microphone/i.test(d.name) && !skip.test(d.name));
  // Prefer the machine's own mic over whatever external/aggregate input is plugged in.
  return mics.find((d) => /macbook|imac|mac mini|mac studio|built-in/i.test(d.name)) ?? mics[0] ?? null;
}

function avfoundationInput({ videoDevice, audioDevice, width, height, fps }) {
  const spec = audioDevice == null ? `${videoDevice}` : `${videoDevice}:${audioDevice}`;
  return ["-f", "avfoundation", "-framerate", String(fps), "-video_size", `${width}x${height}`, "-i", spec];
}

function srtpParams(key, salt) {
  return Buffer.concat([key, salt]).toString("base64");
}

/**
 * Args for a live HomeKit stream: one ffmpeg process reads the camera once
 * and fans out to an SRTP video stream (H.264) and, if a mic is present, an
 * SRTP Opus audio stream.
 *
 * @param session  the prepared session (target address, ports, srtp keys, ssrcs, local ports)
 * @param request  the HomeKit START request (negotiated video/audio parameters)
 */
export function buildStreamArgs({ videoDevice, audioDevice, session, request }) {
  const v = request.video;
  const fps = Math.min(v.fps, 30);
  const bitrate = v.max_bit_rate;
  const args = [
    ...avfoundationInput({ videoDevice, audioDevice, width: v.width, height: v.height, fps }),
    "-map", "0:v",
    "-vcodec", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-profile:v", v.profile === 0 ? "baseline" : v.profile === 1 ? "main" : "high",
    "-level:v", ["3.1", "3.2", "4.0"][v.level] ?? "4.0",
    "-r", String(fps),
    "-vf", `scale=${v.width}:${v.height}`,
    "-g", String(fps * 2),
    "-b:v", `${bitrate}k`,
    "-maxrate", `${bitrate}k`,
    "-bufsize", `${bitrate * 2}k`,
    "-payload_type", String(v.pt),
    "-ssrc", String(session.videoSSRC),
    "-f", "rtp",
    "-srtp_out_suite", SRTP_SUITE,
    "-srtp_out_params", srtpParams(session.videoSrtpKey, session.videoSrtpSalt),
    `srtp://${session.address}:${session.videoPort}?rtcpport=${session.videoPort}` +
      `&localrtcpport=${session.videoLocalPort}&pkt_size=${v.mtu}`,
  ];

  if (audioDevice != null && request.audio && session.audioPort) {
    const a = request.audio;
    args.push(
      "-map", "0:a",
      "-acodec", "libopus",
      "-application", "lowdelay",
      "-flags", "+global_header",
      "-ar", String(a.sample_rate * 1000),
      "-b:a", `${a.bit_rate}k`,
      "-ac", String(a.channel),
      "-frame_duration", String(a.packet_time),
      "-payload_type", String(a.pt),
      "-ssrc", String(session.audioSSRC),
      "-f", "rtp",
      "-srtp_out_suite", SRTP_SUITE,
      "-srtp_out_params", srtpParams(session.audioSrtpKey, session.audioSrtpSalt),
      `srtp://${session.address}:${session.audioPort}?rtcpport=${session.audioPort}` +
        `&localrtcpport=${session.audioLocalPort}&pkt_size=188`,
    );
  }
  return args;
}

/** One JPEG frame to stdout. Skips the first frames, which are dark while auto-exposure settles. */
export function buildSnapshotArgs({ videoDevice, width, height }) {
  return [
    "-hide_banner", "-loglevel", "error",
    ...avfoundationInput({ videoDevice, audioDevice: null, width: 1280, height: 720, fps: 30 }),
    "-vf", `select=gte(n\\,20),scale=${width}:${height}`,
    "-frames:v", "1",
    "-fps_mode", "vfr",
    "-f", "mjpeg",
    "-q:v", "5",
    "pipe:1",
  ];
}
