export interface Settings {
  signalingUrl: string;
  /** Ring-buffer cap for locally stored clips. */
  maxStorageGB: number;
  /** 0-1: lower = trips on smaller movements. */
  motionSensitivity: number;
}

const KEY = "peersitter:settings";

const DEFAULTS: Settings = {
  signalingUrl: (import.meta.env.VITE_SIGNALING_URL as string | undefined) ?? "ws://localhost:8787",
  maxStorageGB: 2,
  motionSensitivity: 0.06,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

export function gbToBytes(gb: number): number {
  return Math.round(gb * 1024 * 1024 * 1024);
}
