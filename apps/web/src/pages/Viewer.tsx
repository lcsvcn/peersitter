import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  SignalingClient,
  PeerLink,
  decodePairingPayload,
  type ClipStorage,
  type PairingPayload,
} from "@peersitter/core";
import { useMotionRecording } from "../hooks/useMotionRecording";

type Status =
  | "scanning"
  | "connecting"
  | "verifying"
  | "connected"
  | "fingerprint-mismatch"
  | "error";

interface Props {
  storage: ClipStorage;
  motionSensitivity: number;
  onBack: () => void;
}

export default function Viewer({ storage, motionSensitivity, onBack }: Props) {
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [status, setStatus] = useState<Status>("scanning");
  const [error, setError] = useState<string | null>(null);
  const [pastedCode, setPastedCode] = useState("");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerLinkRef = useRef<PeerLink | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);

  const { isRecording } = useMotionRecording(remoteStream, storage, motionEnabled, motionSensitivity, "viewer");

  // Phase 1: scan the Camera's QR code (or accept a pasted code instead).
  useEffect(() => {
    if (status !== "scanning") return;
    let cancelled = false;
    let rafId: number;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        return; // no camera available — user can still use the paste-code fallback below
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      scanStreamRef.current = stream;
      if (scanVideoRef.current) {
        scanVideoRef.current.srcObject = stream;
        await scanVideoRef.current.play();
      }

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;

      const tick = () => {
        const video = scanVideoRef.current;
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            try {
              const payload = decodePairingPayload(code.data);
              scanStreamRef.current?.getTracks().forEach((t) => t.stop());
              void connect(payload);
              return; // stop scanning loop
            } catch {
              // not a valid pairing code, keep scanning
            }
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      scanStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function submitPastedCode() {
    try {
      const payload = decodePairingPayload(pastedCode.trim());
      scanStreamRef.current?.getTracks().forEach((t) => t.stop());
      void connect(payload);
    } catch {
      setError("That doesn't look like a valid pairing code.");
    }
  }

  async function connect(payload: PairingPayload) {
    setStatus("connecting");
    try {
      const signaling = new SignalingClient(payload.signalingUrl);
      signalingRef.current = signaling;
      await signaling.joinRoom(payload.roomId);

      const link = new PeerLink({
        signaling,
        events: {
          onRemoteStream: (stream) => {
            setRemoteStream(stream);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
          },
          onStateChange: (state) => {
            if (state === "connected") {
              setStatus("verifying");
              const verified = link.verifyFingerprint(payload.fingerprint);
              setStatus(verified ? "connected" : "fingerprint-mismatch");
              if (!verified) link.close();
            } else if (state === "failed" || state === "closed") {
              setStatus((s) => (s === "connected" ? "error" : s));
            }
          },
        },
      });
      peerLinkRef.current = link;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  useEffect(() => {
    return () => {
      peerLinkRef.current?.close();
      signalingRef.current?.close();
    };
  }, []);

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ← Back
      </button>
      <h2>Viewer</h2>

      {status === "scanning" && (
        <>
          <p>Point this device's camera at the Camera's QR code.</p>
          <video ref={scanVideoRef} muted playsInline className="preview" />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          <details className="advanced">
            <summary>No camera, or pairing between two desktops? Paste the code instead</summary>
            <textarea
              value={pastedCode}
              onChange={(e) => setPastedCode(e.target.value)}
              rows={4}
              placeholder="Paste the pairing code shown under the Camera's QR code"
            />
            <button onClick={submitPastedCode}>Connect</button>
          </details>
        </>
      )}

      {status !== "scanning" && <video ref={remoteVideoRef} autoPlay playsInline className="preview" />}

      <p className="status">
        Status: <strong>{status}</strong>
      </p>

      {status === "fingerprint-mismatch" && (
        <p className="error">
          ⚠️ Security check failed: the connection's encryption fingerprint didn't match the one in the
          pairing code. This can mean the signaling server was tampered with. The connection was refused.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {status === "connected" && (
        <>
          <label className="field toggle">
            <input type="checkbox" checked={motionEnabled} onChange={(e) => setMotionEnabled(e.target.checked)} />
            Record automatically when the feed shows movement
          </label>
          {motionEnabled && (
            <p className="status">{isRecording ? "● Recording (motion detected)" : "Watching for motion…"}</p>
          )}
        </>
      )}
    </div>
  );
}
