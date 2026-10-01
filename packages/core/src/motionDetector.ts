export interface MotionDetectorOptions {
  /** Fraction (0-1) of sampled pixels that must change before it counts as motion. Lower = more sensitive. Default 0.06. */
  sensitivity?: number;
  /** How often to sample a frame, in ms. Default 500. */
  sampleIntervalMs?: number;
  /** How long motion must be absent before onMotionEnd fires, in ms. Keeps a clip going through brief pauses instead of chopping it into fragments. Default 5000. */
  quietPeriodMs?: number;
}

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const PER_PIXEL_CHANGE_THRESHOLD = 32; // summed |dR|+|dG|+|dB| needed to count one pixel as "changed"

/**
 * Cheap, dependency-free motion detection: downsamples the video to a
 * small canvas, diffs consecutive frames, and fires start/end events when
 * enough of the frame has changed. No ML model, runs entirely on-device.
 */
export class MotionDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private prevFrame: Uint8ClampedArray | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private motionActive = false;

  onMotionStart?: () => void;
  onMotionEnd?: () => void;

  constructor(
    stream: MediaStream,
    private opts: MotionDetectorOptions = {},
  ) {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
    void this.video.play();

    this.canvas = document.createElement("canvas");
    this.canvas.width = SAMPLE_WIDTH;
    this.canvas.height = SAMPLE_HEIGHT;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }

  start() {
    this.sampleTimer = setInterval(() => this.sample(), this.opts.sampleIntervalMs ?? 500);
  }

  stop() {
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.sampleTimer = null;
    this.quietTimer = null;
  }

  private sample() {
    if (this.video.readyState < this.video.HAVE_CURRENT_DATA) return;
    this.ctx.drawImage(this.video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const frame = this.ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;

    if (this.prevFrame && frameChanged(this.prevFrame, frame, this.opts.sensitivity ?? 0.06)) {
      this.registerMotion();
    }
    this.prevFrame = frame;
  }

  private registerMotion() {
    if (!this.motionActive) {
      this.motionActive = true;
      this.onMotionStart?.();
    }
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.motionActive = false;
      this.onMotionEnd?.();
    }, this.opts.quietPeriodMs ?? 5000);
  }
}

function frameChanged(prev: Uint8ClampedArray, next: Uint8ClampedArray, sensitivity: number): boolean {
  let changedPixels = 0;
  const pixelCount = prev.length / 4;
  for (let i = 0; i < prev.length; i += 4) {
    const delta =
      Math.abs(prev[i] - next[i]) + Math.abs(prev[i + 1] - next[i + 1]) + Math.abs(prev[i + 2] - next[i + 2]);
    if (delta > PER_PIXEL_CHANGE_THRESHOLD) changedPixels++;
  }
  return changedPixels / pixelCount > sensitivity;
}
