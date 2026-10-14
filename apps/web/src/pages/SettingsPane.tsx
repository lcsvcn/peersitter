import type { Settings } from "../settings";
import { MoonIcon, PaletteIcon, SunIcon } from "../components/Icon";
import SegmentedControl from "../components/SegmentedControl";
import { SEED_PRESETS, systemAccent } from "../dynamicColor";
import { resolveDesign } from "../theme";

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
}

export default function SettingsPane({ settings, onSettingsChange }: Props) {
  const material = resolveDesign(settings.design) === "material";
  const hasSystemAccent = systemAccent() !== null;
  return (
    <div className="pane-stack">
      <h2 className="pane-title">Settings</h2>

      <div className="surface group pane-group">
        <h3 className="group-title">Appearance</h3>
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

        {material && (
          <div className="field">
            <span id="accent-label">Material You colour</span>
            <span className="field-hint">
              The whole palette is generated from one colour.{" "}
              {hasSystemAccent
                ? "“System” follows your Android wallpaper."
                : "Android wallpaper colours are only available in the Android app."}
            </span>
            <div className="swatches" role="radiogroup" aria-labelledby="accent-label">
              {hasSystemAccent && (
                <button
                  className="swatch system"
                  role="radio"
                  aria-checked={settings.seedColor === "system"}
                  onClick={() => onSettingsChange({ seedColor: "system" })}
                >
                  System
                </button>
              )}
              {SEED_PRESETS.map((hex) => {
                const selected = settings.seedColor === hex || (settings.seedColor === "system" && !hasSystemAccent && hex === SEED_PRESETS[0]);
                return (
                  <button
                    key={hex}
                    className="swatch"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Colour ${hex}`}
                    style={{ background: hex }}
                    onClick={() => onSettingsChange({ seedColor: hex })}
                  />
                );
              })}
              <input
                className="swatch-picker"
                type="color"
                aria-label="Custom colour"
                value={/^#[0-9a-f]{6}$/i.test(settings.seedColor) ? settings.seedColor : SEED_PRESETS[0]}
                onChange={(e) => onSettingsChange({ seedColor: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="surface group pane-group">
        <h3 className="group-title">Camera &amp; detection</h3>
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
      </div>

      <div className="surface group pane-group">
        <h3 className="group-title">Connection</h3>
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
    </div>
  );
}
