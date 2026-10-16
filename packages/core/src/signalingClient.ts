export interface CreateRoomOptions {
  /** Shown to viewers (code lookup and the nearby list). */
  name?: string;
  /** The camera's DTLS fingerprint, handed to viewers who pair by code. */
  fingerprint?: string;
  /** List this camera to viewers on the same network. */
  discoverable?: boolean;
}

export interface NearbyCamera {
  code: string;
  name: string;
}

export interface ResolvedCode {
  roomId: string;
  fingerprint: string;
  name: string;
}

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
  /** Viewer side: cameras on this network changed (sent right after watchNearby and on every change). */
  onNearby?: (cameras: NearbyCamera[]) => void;

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
        case "nearby":
          this.onNearby?.(msg.cameras ?? []);
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

  /** Camera side: ask the relay for a fresh room; also returns the short code viewers can type. */
  async createRoomWithCode(opts: CreateRoomOptions = {}): Promise<{ roomId: string; code: string }> {
    await this.send({ type: "create-room", ...opts });
    return new Promise((resolve) => {
      const handler = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "room-created") {
          this.ws.removeEventListener("message", handler);
          resolve({ roomId: msg.roomId, code: msg.code ?? "" });
        }
      };
      this.ws.addEventListener("message", handler);
    });
  }

  /** Camera side: ask the relay to mint a fresh, random room id. */
  async createRoom(opts?: CreateRoomOptions): Promise<string> {
    return (await this.createRoomWithCode(opts)).roomId;
  }

  /** Camera side: change what the relay advertises (e.g. stop being listed on the network). */
  async updateRoom(patch: { discoverable?: boolean; name?: string }) {
    await this.send({ type: "update-room", ...patch });
  }

  /** Viewer side: turn a typed short code into the room to join. Rejects with the relay's reason ("code-not-found", "rate-limited"). */
  async resolveCode(code: string): Promise<ResolvedCode> {
    await this.send({ type: "resolve-code", code });
    return new Promise((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "code-resolved") {
          this.ws.removeEventListener("message", handler);
          resolve({ roomId: msg.roomId, fingerprint: msg.fingerprint ?? "", name: msg.name ?? "" });
        } else if (msg.type === "error" && (msg.message === "code-not-found" || msg.message === "rate-limited")) {
          this.ws.removeEventListener("message", handler);
          reject(new Error(msg.message));
        }
      };
      this.ws.addEventListener("message", handler);
    });
  }

  /** Viewer side: ask for the cameras on this network and keep getting updates through onNearby. */
  async watchNearby() {
    await this.send({ type: "list-nearby" });
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
