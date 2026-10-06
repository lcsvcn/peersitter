import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { decodePairingPayload, type PairingPayload } from "@peersitter/core";

interface Props {
  onPayload: (payload: PairingPayload) => void;
}

/** Scans a Camera's QR code with this device's camera, or accepts a pasted pairing code. */
export default function PairingScanner({ onPayload }: Props) {
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pastedCode, setPastedCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        return; // no camera available — the paste-code fallback below still works
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = scanVideoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      const canvas = canvasRef.current;
      if (cancelled || !canvas) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const tick = () => {
        if (cancelled) return;
        const v = scanVideoRef.current;
        if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height);
          if (code) {
            try {
              const payload = decodePairingPayload(code.data);
              onPayloadRef.current(payload);
              return; // stop scanning; the parent unmounts or re-mounts us
            } catch {
              // not a pairing code, keep scanning
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
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function submitPastedCode(raw = pastedCode) {
    try {
      const payload = decodePairingPayload(raw.trim());
      setError(null);
      setPastedCode("");
      onPayload(payload);
    } catch {
      setError("That doesn't look like a valid pairing code.");
    }
  }

  // "Paste and go": as soon as the field holds a complete, valid code, connect —
  // no need to hunt for the Connect button behind the on-screen keyboard.
  function onCodeChange(value: string) {
    setPastedCode(value);
    try {
      decodePairingPayload(value.trim());
    } catch {
      return; // still incomplete or not a code; wait for more input
    }
    submitPastedCode(value);
  }

  return (
    <section className="scanner surface" aria-label="Add a camera">
      <p>Point this device's camera at a Camera's QR code.</p>
      <div className="scanner-view">
        <video ref={scanVideoRef} muted playsInline className="preview" />
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <details className="advanced">
        <summary>No camera, or pairing between two desktops? Paste the code instead</summary>
        <textarea
          id="pairing-code-input"
          value={pastedCode}
          onChange={(e) => onCodeChange(e.target.value)}
          rows={4}
          placeholder="Paste the pairing code shown under the Camera's QR code"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="btn" onClick={() => submitPastedCode()}>
          Connect
        </button>
      </details>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
