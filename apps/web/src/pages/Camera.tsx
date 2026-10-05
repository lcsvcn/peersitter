import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  SignalingClient,
  PeerLink,
  generatePairingCertificate,
  certificateFingerprint,
  buildPairingPayload,
  encodePairingPayload,
  type ClipStorage,
} from "@peersitter/core";
import { useMotionRecording } from "../hooks/useMotionRecording";

type Status = "starting" | "waiting-for-viewer" | "connecting" | "connected" | "error";

const RECONNECT_DELAY_MS = 3000;

interface Props {
  signalingUrl: string;
  cameraName: string;
  storage: ClipStorage;
  motionSensitivity: number;
  onBack: () => void;
}

/**
 * A camera is a hub: it keeps one signaling room open and runs an
 * independent WebRTC connection per viewer, so any number of viewers
 * (up to the relay's cap) can watch at once and come and go freely.
 */
export default function Camera({ signalingUrl, cameraName, storage, motionSensitivity, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [relayLost, setRelayLost] = useState(false);
  const [viewerStates, setViewerStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const linksRef = useRef(new Map<string, PeerLink>());
  const signalingRef = useRef<SignalingClient | null>(null);
  const nameRef = useRef(cameraName);
  nameRef.current = cameraName;

  const { isRecording } = useMotionRecording(stream, storage, motionEnabled, motionSensitivity, "camera");

  const states = Object.values(viewerStates);
  const connectedCount = states.filter((s) => s === "connected").length;
  const status: Status = error
    ? "error"
    : connectedCount > 0
      ? "connected"
      : states.length > 0
        ? "connecting"
        : started
          ? "waiting-for-viewer"
          : "starting";

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const links = linksRef.current;

    function setViewerState(peerId: string, state: RTCPeerConnectionState | null) {
      setViewerStates((prev) => {
        const next = { ...prev };
        if (state === null) delete next[peerId];
        else next[peerId] = state;
        return next;
      });
    }

    function dropViewer(peerId: string) {
      links.get(peerId)?.close();
      links.delete(peerId);
      setViewerState(peerId, null);
    }

    (async () => {
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (cancelled) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = localStream;
      setStream(localStream);
      if (videoRef.current) videoRef.current.srcObject = localStream;

      // One certificate for the camera's lifetime: its fingerprint is what
      // every viewer verifies against the pairing code.
      const certificate = await generatePairingCertificate();
      const fingerprint = certificateFingerprint(certificate);

      async function openRoom() {
        try {
          const signaling = new SignalingClient(signalingUrl);
          signalingRef.current = signaling;
          const roomId = await signaling.createRoom();
          if (cancelled) return signaling.close();

          const code = encodePairingPayload(
            buildPairingPayload({ signalingUrl, roomId, fingerprint, name: nameRef.current }),
          );
          const qr = await QRCode.toDataURL(code, { margin: 1, width: 320 });
          if (cancelled) return;
          setQrDataUrl(qr);
          setPairingCode(code);
          setStarted(true);
          setRelayLost(false);
          setError(null);

          signaling.onPeerJoined = async (peerId) => {
            if (!peerId) return;
            setViewerState(peerId, "connecting");
            const link = new PeerLink({
              signaling: signaling.channelFor(peerId),
              certificate,
              events: {
                onStateChange: (state) => {
                  if (state === "failed" || state === "closed" || state === "disconnected") {
                    if (state !== "disconnected") dropViewer(peerId);
                    else setViewerState(peerId, state);
                  } else {
                    setViewerState(peerId, state);
                  }
                },
              },
            });
            links.set(peerId, link);
            await link.startAsCamera(localStream);
          };

          signaling.onPeerLeft = (_reason, peerId) => {
            if (peerId) dropViewer(peerId);
          };

          // The relay dropped us (restart, Wi-Fi blip). Existing viewers keep
          // streaming peer-to-peer; open a fresh room so new viewers can join.
          signaling.onClose = () => {
            if (cancelled) return;
            setRelayLost(true);
            retryTimer = setTimeout(() => void openRoom(), RECONNECT_DELAY_MS);
          };
        } catch {
          if (cancelled) return;
          setRelayLost(true);
          retryTimer = setTimeout(() => void openRoom(), RECONNECT_DELAY_MS);
        }
      }
      await openRoom();
    })();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (signalingRef.current) signalingRef.current.onClose = undefined;
      links.forEach((l) => l.close());
      links.clear();
      signalingRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [signalingUrl]);

  const pairing =
    qrDataUrl && !relayLost ? (
      <div className="pairing">
        <p>Scan this on a Viewer device:</p>
        <img src={qrDataUrl} alt="Pairing QR code" width={320} height={320} />
        {pairingCode && (
          <details className="advanced">
            <summary>No camera on the other device? Copy the pairing code instead</summary>
            <textarea readOnly value={pairingCode} rows={4} onFocus={(e) => e.currentTarget.select()} />
          </details>
        )}
      </div>
    ) : null;

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ← Back
      </button>
      <h2>{cameraName.trim() || "Camera"}</h2>

      <video ref={videoRef} autoPlay muted playsInline className="preview" />

      {states.length === 0 ? (
        pairing
      ) : (
        <details className="advanced">
          <summary>Add another viewer</summary>
          {pairing}
        </details>
      )}

      <p className="status">
        Status: <strong>{status}</strong>
      </p>
      <p className="status">
        Viewers watching: <strong data-testid="viewer-count">{connectedCount}</strong>
      </p>
      {relayLost && (
        <p className="error">Lost contact with the signaling server — reconnecting. Current viewers are unaffected.</p>
      )}
      {error && <p className="error">{error}</p>}

      <label className="field toggle">
        <input type="checkbox" checked={motionEnabled} onChange={(e) => setMotionEnabled(e.target.checked)} />
        Record automatically when this camera sees movement
      </label>
      {motionEnabled && (
        <p className="status">{isRecording ? "● Recording (motion detected)" : "Watching for motion…"}</p>
      )}
    </div>
  );
}
