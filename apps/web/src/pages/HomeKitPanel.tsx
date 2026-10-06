import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  homekitStart,
  homekitStop,
  homekitStatus,
  type HomeKitStatus,
} from "../lib/homekit";
import { ChevronRightIcon, ShieldCheckIcon } from "../components/Icon";

export default function HomeKitPanel() {
  const [status, setStatus] = useState<HomeKitStatus>({ running: false });
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const s = await homekitStatus().catch(() => null);
      if (alive && s) setStatus(s);
    };
    void poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!status.setupURI || status.paired) return setQr(null);
    void QRCode.toDataURL(status.setupURI, { margin: 1, width: 180 }).then(setQr);
  }, [status.setupURI, status.paired]);

  async function toggle() {
    setError(null);
    try {
      if (status.running) await homekitStop();
      else await homekitStart();
      setStatus(await homekitStatus());
    } catch (e) {
      setError(String(e));
    }
  }

  const failure = error ?? status.error;
  const ready = status.running && !status.starting && status.pincode;

  return (
    <details className="settings surface" open={status.running}>
      <summary>
        <span className="card-icon" aria-hidden>
          <ShieldCheckIcon size={26} />
        </span>
        <span className="card-body">
          <span className="card-title">Apple Home (HomeKit)</span>
          <span className="card-desc">Show this Mac as a camera in the Home app</span>
        </span>
        <ChevronRightIcon className="card-chevron" size={20} />
      </summary>

      <div className="settings-body">
        <span className="field-hint">
          Show this Mac as a camera in the Home app, like a real HomeKit camera: live view, snapshots,
          and motion events. Runs locally — the stream goes straight to your Home hub, not through us.
        </span>

        <button className={`btn${status.running ? " tonal" : ""}`} onClick={toggle}>
          {status.running ? "Stop HomeKit camera" : "Enable HomeKit camera"}
        </button>
        {failure && <p className="error">{failure}</p>}
        {status.running && !ready && !failure && <p className="status">Starting…</p>}

        {ready && (
          <>
            <p className="status">
              {status.paired
                ? `✓ Added to Home${status.streaming ? " · streaming now" : ""}`
                : "In the Home app: + → Add Accessory → scan this code"}
            </p>
            {!status.paired && qr && (
              <div className="qr" style={{ alignSelf: "center" }}>
                <img src={qr} alt="HomeKit setup code" width={180} height={180} />
              </div>
            )}
            {!status.paired && (
              <p className="status">
                Or enter code <code>{status.pincode}</code>
              </p>
            )}
            <span className="field-hint">
              Video: {status.video}
              {status.audio ? ` · Mic: ${status.audio}` : " · no audio (microphone permission off)"}
            </span>
          </>
        )}
      </div>
    </details>
  );
}
