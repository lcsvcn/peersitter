import type { Settings } from "../settings";
import { homekitAvailable } from "../lib/homekit";
import HomeKitPanel from "./HomeKitPanel";

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onChooseCamera: () => void;
  onChooseViewer: () => void;
  onChooseGallery: () => void;
}

export default function Home({ settings, onSettingsChange, onChooseCamera, onChooseViewer, onChooseGallery }: Props) {
  return (
    <div className="screen centered">
      <h1>PeerSitter</h1>
      <p className="subtitle">
        Open-source, peer-to-peer camera monitoring. No account, no cloud, no server ever sees your
        video — it's encrypted end-to-end straight between your two devices, and only records when
        something moves.
      </p>

      <div className="card-row">
        <button className="card" onClick={onChooseCamera}>
          <span className="card-title">Be a Camera</span>
          <span className="card-desc">Turn this device into a monitoring camera and generate a pairing QR code.</span>
        </button>
        <button className="card" onClick={onChooseViewer}>
          <span className="card-title">Be a Viewer</span>
          <span className="card-desc">Scan a Camera's QR code to watch its live, encrypted feed.</span>
        </button>
      </div>

      <button className="card" style={{ width: "100%" }} onClick={onChooseGallery}>
        <span className="card-title">Recordings</span>
        <span className="card-desc">Browse motion-triggered clips saved on this device.</span>
      </button>

      {homekitAvailable() && <HomeKitPanel />}

      <details className="advanced">
        <summary>Settings</summary>

        <label className="field">
          Signaling server
          <span className="field-hint">
            Only used to introduce the two devices — it never sees audio, video, or recordings. Point it
            at your own self-hosted instance (see <code>signaling-server/</code>) for full independence.
          </span>
          <input
            type="text"
            value={settings.signalingUrl}
            onChange={(e) => onSettingsChange({ signalingUrl: e.target.value })}
            spellCheck={false}
          />
        </label>

        <label className="field">
          Motion sensitivity: {(settings.motionSensitivity * 100).toFixed(0)}% of frame must change
          <input
            type="range"
            min={0.02}
            max={0.2}
            step={0.01}
            value={settings.motionSensitivity}
            onChange={(e) => onSettingsChange({ motionSensitivity: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          Max local storage for recordings: {settings.maxStorageGB} GB
          <span className="field-hint">Oldest clips are deleted automatically once this fills up.</span>
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={settings.maxStorageGB}
            onChange={(e) => onSettingsChange({ maxStorageGB: Number(e.target.value) })}
          />
        </label>
      </details>
    </div>
  );
}
