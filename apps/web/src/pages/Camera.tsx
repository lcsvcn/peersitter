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
  parseIceServers,
} from "@peersitter/core";
import { loadSettings, saveSettings } from "../settings";
import { useMotionRecording } from "../hooks/useMotionRecording";
import ScreenHeader from "../components/ScreenHeader";
import { CopyIcon, LockIcon, UsersIcon } from "../components/Icon";

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
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(() => loadSettings().discoverable);
  const [safety, setSafety] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const linksRef = useRef(new Map<string, PeerLink>());
  const signalingRef = useRef<SignalingClient | null>(null);
  const nameRef = useRef(cameraName);
  nameRef.current = cameraName;
  const discoverableRef = useRef(discoverable);
  discoverableRef.current = discoverable;

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
      setSafety((prev) => {
        const { [peerId]: _gone, ...rest } = prev;
        return rest;
      });
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

      function scheduleReconnect() {
        if (cancelled || retryTimer) return; // one pending retry at a time
        setRelayLost(true);
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void openRoom();
        }, RECONNECT_DELAY_MS);
      }

      async function openRoom() {
        let signaling: SignalingClient | null = null;
        try {
          signaling = new SignalingClient(signalingUrl);
          const current = signaling;
          signalingRef.current = current;

          // Wired before createRoom so a socket that dies mid-handshake
          // still triggers a retry instead of hanging forever.
          current.onClose = () => {
            if (signalingRef.current === current) scheduleReconnect();
          };
          const { roomId, code: short } = await current.createRoomWithCode({
            name: nameRef.current,
            fingerprint,
            discoverable: discoverableRef.current,
          });
          if (cancelled) return current.close();
          setShortCode(short ? `${short.slice(0, 4)}-${short.slice(4)}` : null);

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

          current.onPeerJoined = async (peerId) => {
            if (!peerId) return;
            setViewerState(peerId, "connecting");
            const link = new PeerLink({
              signaling: current.channelFor(peerId),
              iceServers: parseIceServers(loadSettings().iceServers),
              certificate,
              events: {
                onStateChange: (state) => {
                  if (state === "failed" || state === "closed") dropViewer(peerId);
                  else setViewerState(peerId, state); // "disconnected" is often transient
                  if (state === "connected") {
                    void link.safetyNumber().then((n) => n && setSafety((prev) => ({ ...prev, [peerId]: n })));
                  }
                },
              },
            });
            links.set(peerId, link);
            await link.startAsCamera(localStream);
          };

          current.onPeerLeft = (_reason, peerId) => {
            if (peerId) dropViewer(peerId);
          };
        } catch {
          // Couldn't reach the relay (or it dropped mid-handshake). Existing
          // viewers keep streaming peer-to-peer; try again shortly.
          if (signaling && signalingRef.current === signaling) signaling.onClose = undefined;
          signaling?.close();
          scheduleReconnect();
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

  function toggleDiscoverable(on: boolean) {
    setDiscoverable(on);
    saveSettings({ ...loadSettings(), discoverable: on });
    void signalingRef.current?.updateRoom({ discoverable: on });
  }

  async function copyShortCode() {
    if (!shortCode) return;
    await navigator.clipboard?.writeText(shortCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const safetyNumbers = Object.values(safety);

  const pairing =
    qrDataUrl && !relayLost ? (
      <div className="pairing">
        {shortCode && (
          <div className="code-card">
            <span className="eyebrow">Pairing code</span>
            <div className="code-display" data-testid="pairing-short-code" aria-label={`Pairing code ${shortCode}`}>
              {shortCode}
            </div>
            <p className="field-hint">
              On the Viewer, choose <strong>Be a Viewer</strong> and type this code — no camera needed. It works
              from anywhere, as long as both devices use the same signaling server.
            </p>
            <button className="btn tonal" onClick={copyShortCode}>
              <CopyIcon size={18} /> {copied ? "Copied" : "Copy code"}
            </button>
            <label className="field toggle">
              <input type="checkbox" checked={discoverable} onChange={(e) => toggleDiscoverable(e.target.checked)} />
              Show this camera to viewers on my network
            </label>
          </div>
        )}
        <p>Or scan this on a Viewer device:</p>
        <div className="qr">
          <img src={qrDataUrl} alt="Pairing QR code" width={320} height={320} />
        </div>
        {pairingCode && (
          <details className="advanced">
            <summary>No camera on the other device? Copy the pairing code instead</summary>
            <textarea readOnly value={pairingCode} rows={4} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn tonal" onClick={() => void navigator.clipboard?.writeText(pairingCode)}>
              <CopyIcon size={18} /> Copy code
            </button>
          </details>
        )}
      </div>
    ) : null;

  return (
    <div className="screen">
      <ScreenHeader title={cameraName.trim() || "Camera"} onBack={onBack} />

      <div className="preview-frame">
        <video ref={videoRef} autoPlay muted playsInline className="preview" />
        {connectedCount > 0 && (
          <span className="overlay tl" aria-hidden>
            <span className="rec-dot" /> LIVE
          </span>
        )}
        <span className="overlay tr" aria-hidden>
          <UsersIcon size={14} /> {connectedCount}
        </span>
      </div>

      <div className="status-row">
        <p className="status pill" data-state={status}>
          Status: <strong>{status}</strong>
        </p>
        <p className="status pill" data-state={connectedCount > 0 ? "live" : "idle"}>
          Viewers watching: <strong data-testid="viewer-count">{connectedCount}</strong>
        </p>
      </div>

      {safetyNumbers.length > 0 && (
        <details className="advanced surface group" style={{ padding: "0 var(--space-3)" }}>
          <summary>
            <LockIcon size={16} /> Security — safety numbers
          </summary>
          <p className="field-hint" style={{ padding: "0 var(--space-2) var(--space-2)" }}>
            If a viewer joined with a code instead of scanning the QR, ask them to compare the number shown on
            their tile with the one here. They should match exactly.
          </p>
          <ul className="safety-list">
            {Object.entries(safety).map(([id, n], i) => (
              <li key={id}>
                Viewer {i + 1} <strong className="safety-number">{n}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}

      {relayLost && (
        <p className="error">Lost contact with the signaling server — reconnecting. Current viewers are unaffected.</p>
      )}
      {error && <p className="error">{error}</p>}

      {states.length === 0 ? (
        pairing
      ) : (
        <details className="advanced surface">
          <summary>Add another viewer</summary>
          {pairing}
        </details>
      )}

      <div className="surface group" style={{ padding: "var(--space-3) var(--space-4)" }}>
        <label className="field toggle">
          <input type="checkbox" checked={motionEnabled} onChange={(e) => setMotionEnabled(e.target.checked)} />
          Record automatically when this camera sees movement
        </label>
        {motionEnabled && (
          <p className="status pill" data-state={isRecording ? "error" : "idle"}>
            {isRecording ? "● Recording (motion detected)" : "Watching for motion…"}
          </p>
        )}
      </div>
    </div>
  );
}
