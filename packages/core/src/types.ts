/** Everything the Viewer needs to find and cryptographically verify the Camera, encoded in the QR code. */
export interface PairingPayload {
  v: 1;
  /** wss:// URL of the signaling relay both devices will use to exchange SDP/ICE. */
  signalingUrl: string;
  /** Random, unguessable id for this session's signaling room. */
  roomId: string;
  /**
   * SHA-256 fingerprint (hex, colon-separated, as WebRTC formats it) of the
   * Camera's DTLS certificate. The Viewer compares this — scanned directly
   * off the Camera's screen, never trusting the signaling server — against
   * the fingerprint actually negotiated in the WebRTC handshake. If the
   * signaling server (or anyone on the network) tries to swap in a
   * different peer, the fingerprints won't match and the Viewer refuses
   * the connection.
   */
  fingerprint: string;
}

export type Role = "camera" | "viewer";

export type SignalMessage =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

export interface ConnectionEvents {
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
  /** Fires once the handshake completes; `verified` is false if the fingerprint didn't match. */
  onFingerprintCheck?: (verified: boolean, actual: string, expected: string) => void;
}
