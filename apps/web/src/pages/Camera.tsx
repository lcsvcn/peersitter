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

interface Props {
  signalingUrl: string;
  storage: ClipStorage;
  motionSensitivity: number;
  onBack: () => void;
}

export default function Camera({ signalingUrl, storage, motionSensitivity, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peerLinkRef = useRef<PeerLink | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);

  const { isRecording } = useMotionRecording(stream, storage, motionEnabled, motionSensitivity, "camera");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = localStream;
        setStream(localStream);
        if (videoRef.current) videoRef.current.srcObject = localStream;

        const certificate = await generatePairingCertificate();
        const fingerprint = certificateFingerprint(certificate);

        const signaling = new SignalingClient(signalingUrl);
        signalingRef.current = signaling;
        const roomId = await signaling.createRoom();

        const payload = buildPairingPayload({ signalingUrl, roomId, fingerprint });
        const code = encodePairingPayload(payload);
        const qr = await QRCode.toDataURL(code, { margin: 1, width: 320 });
        if (cancelled) return;
        setQrDataUrl(qr);
        setPairingCode(code);
        setStatus("waiting-for-viewer");

        signaling.onPeerJoined = async () => {
          setStatus("connecting");
          const link = new PeerLink({
            signaling,
            certificate,
            events: {
              onStateChange: (state) => {
                if (state === "connected") setStatus("connected");
                else if (state === "failed" || state === "closed") setStatus("error");
              },
            },
          });
          peerLinkRef.current = link;
          await link.startAsCamera(localStream);
        };

        signaling.onPeerLeft = () => setStatus("waiting-for-viewer");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      peerLinkRef.current?.close();
      signalingRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [signalingUrl]);

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ← Back
      </button>
      <h2>Camera</h2>

      <video ref={videoRef} autoPlay muted playsInline className="preview" />

      {status === "waiting-for-viewer" && qrDataUrl && (
        <div className="pairing">
          <p>Scan this on the Viewer device:</p>
          <img src={qrDataUrl} alt="Pairing QR code" width={320} height={320} />
          {pairingCode && (
            <details className="advanced">
              <summary>No camera on the other device? Copy the pairing code instead</summary>
              <textarea readOnly value={pairingCode} rows={4} onFocus={(e) => e.currentTarget.select()} />
            </details>
          )}
        </div>
      )}

      <p className="status">
        Status: <strong>{status}</strong>
      </p>
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
