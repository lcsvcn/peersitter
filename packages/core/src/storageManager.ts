export interface ClipMeta {
  name: string;
  size: number;
  createdAt: number;
}

const ROOT_DIR = "peersitter-clips";

/**
 * Stores recorded clips in the browser's Origin Private File System — real
 * on-disk storage, scoped to this app, that survives restarts but costs
 * nothing and needs no server. `saveClip` enforces a byte cap by deleting
 * the oldest clips first, so long-running motion recording never grows
 * without bound: it behaves like a dashcam's ring buffer.
 *
 * On the Capacitor/Tauri native wrappers, swap the OPFS calls below for
 * `@capacitor/filesystem` / `@tauri-apps/plugin-fs` to write into the
 * platform's app-private storage instead — the ring-buffer logic
 * (`enforceQuota`) stays the same either way.
 */
export class ClipStorage {
  private rootHandlePromise: Promise<FileSystemDirectoryHandle>;

  constructor(private maxBytes: number) {
    this.rootHandlePromise = (async () => {
      const opfsRoot = await navigator.storage.getDirectory();
      return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
    })();
  }

  setMaxBytes(bytes: number) {
    this.maxBytes = bytes;
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  async saveClip(blob: Blob, name: string): Promise<void> {
    const dir = await this.rootHandlePromise;
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    await this.enforceQuota();
  }

  async listClips(): Promise<ClipMeta[]> {
    const dir = await this.rootHandlePromise;
    const clips: ClipMeta[] = [];
    for await (const entry of (dir as any).values() as AsyncIterable<FileSystemHandle>) {
      if (entry.kind !== "file") continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      clips.push({ name: entry.name, size: file.size, createdAt: file.lastModified });
    }
    return clips.sort((a, b) => a.createdAt - b.createdAt); // oldest first
  }

  async totalBytesUsed(): Promise<number> {
    const clips = await this.listClips();
    return clips.reduce((sum, c) => sum + c.size, 0);
  }

  async getClipFile(name: string): Promise<File> {
    const dir = await this.rootHandlePromise;
    const handle = await dir.getFileHandle(name);
    return handle.getFile();
  }

  async deleteClip(name: string): Promise<void> {
    const dir = await this.rootHandlePromise;
    await dir.removeEntry(name).catch(() => {});
  }

  /** Deletes the oldest clips until total usage is back under the configured cap. */
  private async enforceQuota(): Promise<void> {
    const clips = await this.listClips();
    let total = clips.reduce((sum, c) => sum + c.size, 0);
    let i = 0;
    while (total > this.maxBytes && i < clips.length) {
      await this.deleteClip(clips[i].name);
      total -= clips[i].size;
      i++;
    }
  }
}
