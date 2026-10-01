import { useEffect, useState } from "react";
import type { ClipStorage, ClipMeta } from "@peersitter/core";
import { saveBlob } from "@peersitter/core";

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

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ← Back
      </button>
      <h2>Recordings</h2>
      <p className="status">
        {formatBytes(used)} / {formatBytes(cap)} used locally · oldest clips are deleted automatically once
        this fills up
      </p>

      {playing && (
        <div className="pairing">
          <video src={playing.url} controls autoPlay className="preview" />
          <p className="status">{playing.name}</p>
        </div>
      )}

      {clips.length === 0 && <p className="subtitle">No clips yet — motion-triggered recording saves here.</p>}

      <div className="clip-list">
        {clips.map((clip) => (
          <div className="clip-row" key={clip.name}>
            <div>
              <div>{new Date(clip.createdAt).toLocaleString()}</div>
              <div className="subtitle">{formatBytes(clip.size)}</div>
            </div>
            <div className="clip-actions">
              <button onClick={() => play(clip)}>Play</button>
              <button onClick={() => download(clip)}>Export</button>
              <button onClick={() => remove(clip)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
