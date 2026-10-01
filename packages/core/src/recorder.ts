/**
 * Records a MediaStream (local camera feed or the remote stream received
 * over WebRTC) straight to a Blob using the browser's MediaRecorder — no
 * server, no upload, no storage bill. `saveBlob` writes it to the device
 * the code is running on:
 *  - plain web: triggers a browser download into the user's Downloads folder
 *  - Capacitor (mobile) / Tauri (desktop) wrappers: swap `saveBlob`'s body
 *    for the platform's native filesystem API (see apps/mobile, apps/desktop)
 *    so recordings land in app-private storage instead.
 */
export class LocalRecorder {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  start(stream: MediaStream, mimeType = "video/webm;codecs=vp9,opus") {
    if (this.isRecording) return;
    this.chunks = [];
    const type = MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
    this.recorder = new MediaRecorder(stream, { mimeType: type });
    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.recorder.start(1000); // 1s timeslice so a crash doesn't lose the whole clip
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error("not-recording"));
        return;
      }
      this.recorder.addEventListener(
        "stop",
        () => resolve(new Blob(this.chunks, { type: this.recorder!.mimeType })),
        { once: true },
      );
      this.recorder.stop();
    });
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function recordingFilename(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}.webm`;
}
