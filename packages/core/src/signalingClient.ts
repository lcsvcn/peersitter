/** One logical signaling conversation: either the whole socket (viewer side) or one viewer as seen by a camera. */
export interface SignalChannel {
  sendSignal(data: unknown): Promise<void>;
  onSignal?: (data: unknown) => void;
}

/**
 * Thin wrapper around the signaling WebSocket. Carries only room
 * bootstrapping and opaque SDP/ICE payloads — never media.
 */
export class SignalingClient implements SignalChannel {
  private ws: WebSocket;
  private openPromise: Promise<void>;
  private channels = new Map<string, PeerChannel>();

  /** Camera side: a viewer joined. `peerId` identifies it for per-viewer channels. */
  onPeerJoined?: (peerId?: string) => void;
  /** Camera side: `peerId` is the viewer that left. Viewer side: the camera went away (no peerId). */
  onPeerLeft?: (reason: string, peerId?: string) => void;
  onSignal?: (data: unknown) => void;
  onError?: (message: string) => void;
  /** The socket to the relay closed (server restart, network loss). */
  onClose?: () => void;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("signaling-connect-failed")), { once: true });
    });
    this.ws.addEventListener("close", () => this.onClose?.());
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "peer-joined":
          this.onPeerJoined?.(msg.peerId);
          break;
        case "peer-left":
          if (msg.peerId) this.channels.delete(msg.peerId);
          this.onPeerLeft?.(msg.reason ?? "unknown", msg.peerId);
          break;
        case "signal":
          if (msg.from && this.channels.has(msg.from)) this.channels.get(msg.from)!.onSignal?.(msg.data);
          else this.onSignal?.(msg.data);
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

  async sendSignal(data: unknown, to?: string) {
    await this.send(to ? { type: "signal", data, to } : { type: "signal", data });
  }

  /**
   * Camera side: a channel that only talks to one viewer, so each viewer
   * can have its own PeerLink over the same signaling socket.
   */
  channelFor(peerId: string): SignalChannel {
    let channel = this.channels.get(peerId);
    if (!channel) {
      channel = new PeerChannel(this, peerId);
      this.channels.set(peerId, channel);
    }
    return channel;
  }

  close() {
    this.ws.close();
  }
}

class PeerChannel implements SignalChannel {
  onSignal?: (data: unknown) => void;
  constructor(
    private client: SignalingClient,
    private peerId: string,
  ) {}
  sendSignal(data: unknown) {
    return this.client.sendSignal(data, this.peerId);
  }
}
