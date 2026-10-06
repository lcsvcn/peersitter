import type { SignalChannel } from "./signalingClient";
import { fingerprintFromSdp } from "./pairing";
import type { ConnectionEvents } from "./types";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

/**
 * One end of a Camera<->Viewer WebRTC link. Media (and the data channel
 * used for remote controls like "start recording") flows directly between
 * the two devices, encrypted end-to-end via WebRTC's mandatory DTLS-SRTP.
 * `signaling` is only ever used to exchange the initial offer/answer/ICE
 * candidates — see docs/ARCHITECTURE.md.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  private signaling: SignalChannel;
  private events: ConnectionEvents;
  dataChannel?: RTCDataChannel;
  private signalQueue: Promise<void> = Promise.resolve();

  constructor(opts: {
    signaling: SignalChannel;
    certificate?: RTCCertificate;
    iceServers?: IceServerConfig[];
    events?: ConnectionEvents;
  }) {
    this.signaling = opts.signaling;
    this.events = opts.events ?? {};
    this.pc = new RTCPeerConnection({
      iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
      certificates: opts.certificate ? [opts.certificate] : undefined,
    });

    this.pc.addEventListener("icecandidate", (ev) => {
      if (ev.candidate) {
        this.signaling.sendSignal({ type: "ice-candidate", candidate: ev.candidate.toJSON() });
      }
    });

    this.pc.addEventListener("connectionstatechange", () => {
      this.events.onStateChange?.(this.pc.connectionState);
    });

    this.pc.addEventListener("track", (ev) => {
      const [stream] = ev.streams;
      if (stream) this.events.onRemoteStream?.(stream);
    });

    // Handle signals strictly in arrival order: an ICE candidate must not be
    // applied before the offer/answer it belongs to has finished applying,
    // or it's rejected and lost (likelier the more links share a device).
    this.signaling.onSignal = (data) => {
      this.signalQueue = this.signalQueue
        .then(() => this.handleSignal(data as any))
        .catch((err) => console.warn("[peer] signal handling failed", err));
    };
  }

  private async handleSignal(msg: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) {
    if (msg.type === "offer" && msg.sdp) {
      await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.signaling.sendSignal({ type: "answer", sdp: answer.sdp });
    } else if (msg.type === "answer" && msg.sdp) {
      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
    } else if (msg.type === "ice-candidate" && msg.candidate) {
      await this.pc.addIceCandidate(msg.candidate);
    }
  }

  /** Camera side: attach the local camera/mic stream and open the offer. */
  async startAsCamera(localStream: MediaStream) {
    for (const track of localStream.getTracks()) {
      this.pc.addTrack(track, localStream);
    }
    this.dataChannel = this.pc.createDataChannel("control");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.signaling.sendSignal({ type: "offer", sdp: offer.sdp });
  }

  /** Viewer side: just wait for the incoming offer (handled in handleSignal) and listen for the control channel. */
  waitForDataChannel(): Promise<RTCDataChannel> {
    return new Promise((resolve) => {
      this.pc.addEventListener("datachannel", (ev) => {
        this.dataChannel = ev.channel;
        resolve(ev.channel);
      });
    });
  }

  /**
   * Compares the DTLS fingerprint actually negotiated in this connection
   * against the one the Viewer scanned from the Camera's QR code. This is
   * the step that makes the connection trustworthy even though the
   * signaling relay is an untrusted third party: the relay can see SDP,
   * but it can't forge a fingerprint that matches what the operator
   * physically scanned off the Camera's screen.
   */
  verifyFingerprint(expected: string): boolean {
    const sdp = this.pc.remoteDescription?.sdp;
    if (!sdp) return false;
    const actual = fingerprintFromSdp(sdp);
    const verified = actual === expected.toLowerCase();
    this.events.onFingerprintCheck?.(verified, actual ?? "", expected);
    return verified;
  }

  close() {
    this.pc.close();
  }
}
