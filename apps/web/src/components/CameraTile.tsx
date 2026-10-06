import { useEffect, useRef, useState } from "react";
import { SignalingClient, PeerLink, type ClipStorage, type PairingPayload } from "@peersitter/core";
import { useMotionRecording } from "../hooks/useMotionRecording";
import { ExpandIcon, ShrinkIcon, XIcon } from "./Icon";

export type TileStatus = "connecting" | "verifying" | "connected" | "fingerprint-mismatch" | "offline" | "error";

interface Props {
  payload: PairingPayload;
  label: string;
  storage: ClipStorage;
  motionSensitivity: number;
  focused: boolean;
  onToggleFocus: () => void;
  onRemove: () => void;
}

/** One live camera on the viewer dashboard: owns its own signaling socket and WebRTC link. */
export default function CameraTile({
  payload,
  label,
  storage,
  motionSensitivity,
  focused,
  onToggleFocus,
  onRemove,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<TileStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);

  const { isRecording } = useMotionRecording(
    remoteStream,
    storage,
    motionEnabled,
    motionSensitivity,
    `viewer-${label.replace(/[^\w-]+/g, "_")}`,
  );

  useEffect(() => {
    let closed = false;
    const signaling = new SignalingClient(payload.signalingUrl);
    let link: PeerLink | null = null;

    const fail = (message: string, next: TileStatus = "error") => {
      if (closed) return;
      setError(message);
      setStatus(next);
    };

    signaling.onError = (message) =>
      fail(
        message === "room-full"
          ? "This camera has reached its viewer limit."
          : message === "room-not-found"
            ? "That camera isn't available anymore. Ask it to show a new code."
            : message,
      );
    // The camera left the relay: it was closed or lost power.
    signaling.onPeerLeft = () => fail("This camera went offline.", "offline");

    signaling
      .joinRoom(payload.roomId)
      .then(() => {
        if (closed) return;
        const peer = new PeerLink({
          signaling,
          events: {
            onRemoteStream: (stream) => {
              setRemoteStream(stream);
              if (videoRef.current) videoRef.current.srcObject = stream;
            },
            onStateChange: (state) => {
              if (closed) return;
              if (state === "connected") {
                setStatus("verifying");
                const verified = peer.verifyFingerprint(payload.fingerprint);
                setStatus(verified ? "connected" : "fingerprint-mismatch");
                if (!verified) peer.close();
              } else if (state === "failed" || state === "closed") {
                setStatus((s) => (s === "connected" || s === "verifying" ? "offline" : s));
              }
            },
          },
        });
        link = peer;
      })
      .catch((err) => fail(err instanceof Error ? err.message : String(err)));

    return () => {
      closed = true;
      link?.close();
      signaling.close();
    };
  }, [payload]);

  // The <video> can mount after the stream arrives; (re)attach it.
  useEffect(() => {
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream, focused]);

  return (
    <section className={`tile${focused ? " focused" : ""}`} data-testid="camera-tile" aria-label={label}>
      <header className="tile-header">
        <h3>{label}</h3>
        <button
          className="icon-btn"
          onClick={onToggleFocus}
          aria-label={focused ? "Show all cameras" : `Enlarge ${label}`}
          title={focused ? "Show all cameras" : "Enlarge (plays sound)"}
        >
          {focused ? <ShrinkIcon size={20} /> : <ExpandIcon size={20} />}
        </button>
        <button className="icon-btn danger" onClick={onRemove} aria-label={`Remove ${label}`} title="Remove camera">
          <XIcon size={20} />
        </button>
      </header>

      <div className="preview-frame">
        {/* Only the enlarged tile plays sound, so a wall of cameras isn't a wall of noise. */}
        <video ref={videoRef} autoPlay playsInline muted={!focused} className="preview" />
        {isRecording && (
          <span className="overlay tl" aria-hidden>
            <span className="rec-dot" /> REC
          </span>
        )}
      </div>

      <p className="status pill" data-state={status}>
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
            <p className="status pill" data-state={isRecording ? "error" : "idle"}>
              {isRecording ? "● Recording (motion detected)" : "Watching for motion…"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
