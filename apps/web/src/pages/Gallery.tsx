import { useEffect, useState } from "react";
import type { ClipStorage, ClipMeta } from "@peersitter/core";
import { saveBlob } from "@peersitter/core";
import ScreenHeader from "../components/ScreenHeader";
import { DownloadIcon, FilmIcon, HardDriveIcon, PlayIcon, TrashIcon } from "../components/Icon";

interface Props {
  storage: ClipStorage;
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

export default function Gallery({ storage, onBack }: Props) {
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [used, setUsed] = useState(0);
  const [playing, setPlaying] = useState<{ name: string; url: string } | null>(null);

  async function refresh() {
    const list = await storage.listClips();
    setClips(list.reverse()); // newest first for display
    setUsed(list.reduce((sum, c) => sum + c.size, 0));
  }

  useEffect(() => {
    void refresh();
  }, [storage]);

  async function play(clip: ClipMeta) {
    const file = await storage.getClipFile(clip.name);
    setPlaying({ name: clip.name, url: URL.createObjectURL(file) });
  }

  async function download(clip: ClipMeta) {
    const file = await storage.getClipFile(clip.name);
    saveBlob(file, clip.name);
  }

  async function remove(clip: ClipMeta) {
    await storage.deleteClip(clip.name);
    if (playing?.name === clip.name) setPlaying(null);
    await refresh();
  }

  const cap = storage.getMaxBytes();
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <div className="screen">
      <ScreenHeader title="Recordings" onBack={onBack} />

      <div className="surface group" style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
        <div className="meter" role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="status">
          <HardDriveIcon size={18} />
          {formatBytes(used)} / {formatBytes(cap)} used locally · oldest clips are deleted automatically once
          this fills up
        </p>
      </div>

      {playing && (
        <div className="pairing">
          <div className="preview-frame" style={{ width: "100%" }}>
            <video src={playing.url} controls autoPlay className="preview" />
          </div>
          <p className="status">{playing.name}</p>
        </div>
      )}

      {clips.length === 0 && (
        <div className="empty surface">
          <span className="card-icon" aria-hidden>
            <FilmIcon size={34} />
          </span>
          <p className="subtitle">No clips yet — motion-triggered recording saves here.</p>
        </div>
      )}

      <div className="clip-list">
        {clips.map((clip) => (
          <div className="clip-row" key={clip.name}>
            <span className="clip-thumb" aria-hidden>
              <FilmIcon size={24} />
            </span>
            <div className="clip-meta">
              <div>{new Date(clip.createdAt).toLocaleString()}</div>
              <div className="subtitle">{formatBytes(clip.size)}</div>
            </div>
            <div className="clip-actions">
              <button onClick={() => play(clip)}>
                <PlayIcon size={18} /> Play
              </button>
              <button onClick={() => download(clip)}>
                <DownloadIcon size={18} /> Export
              </button>
              <button className="danger" onClick={() => remove(clip)}>
                <TrashIcon size={18} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
