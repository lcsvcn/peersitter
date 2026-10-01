/**
 * Thin wrapper around the signaling WebSocket. Carries only room
 * bootstrapping and opaque SDP/ICE payloads — never media.
 */
export class SignalingClient {
  private ws: WebSocket;
  private openPromise: Promise<void>;

  onPeerJoined?: () => void;
  onPeerLeft?: (reason: string) => void;
  onSignal?: (data: unknown) => void;
  onError?: (message: string) => void;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("signaling-connect-failed")), { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "peer-joined":
          this.onPeerJoined?.();
          break;
        case "peer-left":
          this.onPeerLeft?.(msg.reason ?? "unknown");
          break;
        case "signal":
          this.onSignal?.(msg.data);
          break;
        case "error":
          this.onError?.(msg.message);
          break;
      }
    });
  }

  private async send(msg: unknown) {
    await this.openPromise;
    this.ws.send(JSON.stringify(msg));
  }

  /** Camera side: ask the relay to mint a fresh, random room id. */
  async createRoom(): Promise<string> {
    await this.send({ type: "create-room" });
    return new Promise((resolve) => {
      const handler = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "room-created") {
          this.ws.removeEventListener("message", handler);
          resolve(msg.roomId);
        }
      };
      this.ws.addEventListener("message", handler);
    });
  }

  /** Viewer side: join the room id scanned from the Camera's QR code. */
  async joinRoom(roomId: string) {
    await this.send({ type: "join-room", roomId });
  }

  async sendSignal(data: unknown) {
    await this.send({ type: "signal", data });
  }

  close() {
    this.ws.close();
  }
}
