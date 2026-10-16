import { useEffect, useRef, useState } from "react";
import {
  SignalingClient,
  formatPairingCode,
  isCompletePairingCode,
  type NearbyCamera,
  type PairingPayload,
} from "@peersitter/core";
import { CODE_ERROR_TEXT, connectByCode, type CodeError } from "../lib/codePairing";
import { CameraIcon, ChevronRightIcon, WifiOffIcon } from "./Icon";

interface Props {
  signalingUrl: string;
  /** Codes already on the dashboard, so they aren't offered twice. */
  addedCodes: string[];
  onPayload: (payload: PairingPayload, code: string) => void;
}

/**
 * Two ways to add a camera without a QR code:
 *  - "On your network": cameras that opted in and share this network show up by name — one tap.
 *  - "Enter a code": type the XXXX-XXXX shown on the camera; works from anywhere.
 */
export default function NearbyAndCode({ signalingUrl, addedCodes, onPayload }: Props) {
  const [nearby, setNearby] = useState<NearbyCamera[] | null>(null);
  const [relayDown, setRelayDown] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CodeError | null>(null);
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  // Live list of cameras on this network.
  useEffect(() => {
    let closed = false;
    let client: SignalingClient | null = null;
    try {
      client = new SignalingClient(signalingUrl);
      client.onNearby = (cams) => {
        if (closed) return;
        setNearby(cams);
        setRelayDown(false);
      };
      client.onClose = () => !closed && setRelayDown(true);
      client.watchNearby().catch(() => !closed && setRelayDown(true));
    } catch {
      setRelayDown(true);
    }
    return () => {
      closed = true;
      client?.close();
    };
  }, [signalingUrl]);

  async function connect(code: string) {
    setBusy(code);
    setError(null);
    try {
      const payload = await connectByCode(signalingUrl, code);
      onPayloadRef.current(payload, code.replace("-", ""));
      setTyped("");
    } catch (e) {
      setError((e instanceof Error ? e.message : "unreachable") as CodeError);
    } finally {
      setBusy(null);
    }
  }

  function onType(value: string) {
    const formatted = formatPairingCode(value);
    setTyped(formatted);
    setError(null);
    if (isCompletePairingCode(formatted)) void connect(formatted); // connects by itself, like paste-and-go
  }

  const visible = (nearby ?? []).filter((c) => !addedCodes.includes(c.code));

  return (
    <>
      <section className="scanner surface" aria-label="Cameras on your network">
        <p>Cameras on your network</p>
        {relayDown ? (
          <p className="field-hint">
            <WifiOffIcon size={16} style={{ verticalAlign: "-3px" }} /> Can't reach the signaling server, so
            nearby cameras can't be listed.
          </p>
        ) : visible.length === 0 ? (
          <p className="field-hint">
            {nearby === null ? "Looking…" : "None found yet. Open the Camera on a device that's on the same Wi-Fi."}
          </p>
        ) : (
          <div className="nearby-list">
            {visible.map((c) => (
              <div className="nearby-row" key={c.code} data-testid="nearby-camera">
                <span className="card-icon" aria-hidden style={{ width: 44, height: 44 }}>
                  <CameraIcon size={22} />
                </span>
                <span className="card-body">
                  <span className="card-title">{c.name || "Camera"}</span>
                  <span className="card-desc">On this network</span>
                </span>
                <button
                  className="btn small"
                  disabled={busy !== null}
                  onClick={() => void connect(c.code)}
                  aria-label={`Connect to ${c.name || "Camera"}`}
                >
                  Connect <ChevronRightIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="scanner surface" aria-label="Enter a camera code">
        <p>Enter a camera code</p>
        <input
          id="camera-code-input"
          className="code-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="A5GF-75GH"
          aria-label="Camera code"
          value={typed}
          disabled={busy !== null}
          onChange={(e) => onType(e.target.value)}
        />
        <p className="field-hint">
          Shown on the Camera screen. Use this when the camera is far away or has no screen nearby — it works over
          the internet too.
        </p>
        {busy && <p className="status">Connecting…</p>}
        {error && <p className="error">{CODE_ERROR_TEXT[error]}</p>}
      </section>
    </>
  );
}
