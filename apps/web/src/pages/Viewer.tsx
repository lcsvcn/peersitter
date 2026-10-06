import { useState } from "react";
import type { ClipStorage, PairingPayload } from "@peersitter/core";
import CameraTile from "../components/CameraTile";
import PairingScanner from "../components/PairingScanner";
import ScreenHeader from "../components/ScreenHeader";
import { PlusIcon, EyeIcon } from "../components/Icon";

interface Props {
  storage: ClipStorage;
  motionSensitivity: number;
  onBack: () => void;
}

interface Entry {
  key: number;
  payload: PairingPayload;
  label: string;
}

/**
 * Viewer dashboard: any number of cameras at once, one tile each. Scan or
 * paste a code to add a camera; remove a tile to disconnect from it.
 */
export default function Viewer({ storage, motionSensitivity, onBack }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [adding, setAdding] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<number | null>(null);
  const [nextKey, setNextKey] = useState(1);

  function addCamera(payload: PairingPayload) {
    if (entries.some((e) => e.payload.roomId === payload.roomId)) {
      setNotice("That camera is already on your dashboard.");
      return;
    }
    setNotice(null);
    setEntries((prev) => [
      ...prev,
      { key: nextKey, payload, label: payload.name?.trim() || `Camera ${nextKey}` },
    ]);
    setNextKey((k) => k + 1);
    setAdding(false);
  }

  function removeCamera(key: number) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    setFocusedKey((f) => (f === key ? null : f));
  }

  const visible = focusedKey === null ? entries : entries.filter((e) => e.key === focusedKey);

  return (
    <div className={`screen${entries.length > 1 ? " wide" : ""}`}>
      <ScreenHeader title="Viewer" onBack={onBack} />

      {entries.length > 0 && (
        <p className="status pill count-chip" data-state="idle">
          <EyeIcon size={16} />
          Cameras: <strong data-testid="camera-count">{entries.length}</strong>
        </p>
      )}

      {notice && <p className="error">{notice}</p>}
      {adding ? (
        <PairingScanner onPayload={addCamera} />
      ) : (
        <button className="card add-camera" onClick={() => setAdding(true)}>
          <span className="card-icon" aria-hidden>
            <PlusIcon size={26} />
          </span>
          <span className="card-body">
            <span className="card-title">Add another camera</span>
          </span>
        </button>
      )}

      <div className="tiles">
        {visible.map((e) => (
          <CameraTile
            key={e.key}
            payload={e.payload}
            label={e.label}
            storage={storage}
            motionSensitivity={motionSensitivity}
            focused={focusedKey === e.key}
            onToggleFocus={() => setFocusedKey((f) => (f === e.key ? null : e.key))}
            onRemove={() => removeCamera(e.key)}
          />
        ))}
      </div>
    </div>
  );
}
