import type { Settings } from "../settings";
import { homekitAvailable } from "../lib/homekit";
import HomeKitPanel from "./HomeKitPanel";
import {
  ActivityIcon,
  CameraIcon,
  ChevronRightIcon,
  EyeIcon,
  FilmIcon,
  GearIcon,
  LockIcon,
  MoonIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SunIcon,
} from "../components/Icon";
import SegmentedControl from "../components/SegmentedControl";

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
      <section className="hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <CameraIcon size={30} />
          </span>
          <h1 className="title">PeerSitter</h1>
        </div>
        <p className="subtitle">
          Turn spare phones into private cameras and watch them from anywhere. No account, no cloud — your
          video goes straight between your devices.
        </p>
        <div className="chips" aria-label="Privacy">
          <span className="chip">
            <LockIcon size={16} /> End-to-end encrypted
          </span>
          <span className="chip">
            <ShieldCheckIcon size={16} /> No account
          </span>
          <span className="chip">
            <ActivityIcon size={16} /> Records on motion
          </span>
        </div>
      </section>

      <div className="role-grid">
        <button className="card" onClick={onChooseCamera}>
          <span className="card-icon" aria-hidden>
            <CameraIcon size={28} />
          </span>
          <span className="card-body">
            <span className="card-title">Be a Camera</span>
            <span className="card-desc">Turn this device into a camera. Several viewers can watch at once.</span>
          </span>
          <ChevronRightIcon className="card-chevron" size={20} />
        </button>
        <button className="card" onClick={onChooseViewer}>
          <span className="card-icon" aria-hidden>
            <EyeIcon size={28} />
          </span>
          <span className="card-body">
            <span className="card-title">Be a Viewer</span>
            <span className="card-desc">Scan camera QR codes to watch one or many live feeds at once.</span>
          </span>
          <ChevronRightIcon className="card-chevron" size={20} />
        </button>
      </div>

      <button className="card" onClick={onChooseGallery}>
        <span className="card-icon" aria-hidden>
          <FilmIcon size={26} />
        </span>
        <span className="card-body">
          <span className="card-title">Recordings</span>
          <span className="card-desc">Browse motion-triggered clips saved on this device.</span>
        </span>
        <ChevronRightIcon className="card-chevron" size={20} />
      </button>

      {homekitAvailable() && <HomeKitPanel />}

      <details className="settings surface">
        <summary>
          <span className="card-icon" aria-hidden>
            <GearIcon size={26} />
          </span>
          <span className="card-body">
            <span className="card-title">Settings</span>
            <span className="card-desc">Appearance, camera name, detection and storage</span>
          </span>
          <ChevronRightIcon className="card-chevron" size={20} />
        </summary>

        <div className="settings-body">
          <div className="field">
            <span id="theme-label">Theme</span>
            <SegmentedControl
              label="Theme"
              value={settings.appearance}
              onChange={(appearance) => onSettingsChange({ appearance })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "light", label: "Light", icon: <SunIcon size={18} /> },
                { value: "dark", label: "Dark", icon: <MoonIcon size={18} /> },
              ]}
            />
          </div>

          <div className="field">
            <span id="style-label">
              <PaletteIcon size={16} style={{ verticalAlign: "-3px" }} /> Design style
            </span>
            <span className="field-hint">
              Auto uses Liquid Glass on iPhone, iPad and Mac, and Material You everywhere else.
            </span>
            <SegmentedControl
              label="Design style"
              value={settings.design}
              onChange={(design) => onSettingsChange({ design })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "glass", label: "Glass" },
                { value: "material", label: "Material" },
              ]}
            />
          </div>

          <label className="field">
            Camera name
            <span className="field-hint">
              Shown on each viewer's tile when this device is a Camera, so you can tell several cameras apart
              (e.g. "Nursery", "Garage").
            </span>
            <input
              type="text"
              value={settings.cameraName}
              maxLength={40}
              placeholder="Camera"
              onChange={(e) => onSettingsChange({ cameraName: e.target.value })}
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

          <label className="field">
            Signaling server
            <span className="field-hint">
              Only used to introduce the devices — it never sees audio, video, or recordings. Point it at your
              own self-hosted instance (see <code>signaling-server/</code>) for full independence.
            </span>
            <input
              type="text"
              value={settings.signalingUrl}
              onChange={(e) => onSettingsChange({ signalingUrl: e.target.value })}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
        </div>
      </details>

      <p className="footer">Open source · MIT · Peer-to-peer</p>
    </div>
  );
}
