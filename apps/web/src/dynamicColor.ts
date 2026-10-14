import { argbFromHex, hexFromArgb, themeFromSourceColor } from "@material/material-color-utilities";

/**
 * Material You "dynamic color": derive the whole tonal palette from one seed
 * colour, exactly like Android 12+ does from the wallpaper. Android's own
 * pipeline (monet) is the same HCT/tonal-palette maths; here we run the
 * reference implementation so the web, Android WebView and Windows/Linux all
 * get a coherent, accessible scheme.
 *
 * Tone choices follow the M3 baseline scheme: primary 40/80, containers
 * 90/30, surfaces from the neutral palette (light 98/94/92/90, dark 6/12/17/22).
 */
export const DEFAULT_SEED = "#00696b";

export const SEED_PRESETS = ["#00696b", "#4f5bd5", "#a8344b", "#8a5100", "#3b6a1e", "#7a4fa3"];

const TOKEN_KEYS = [
  "--bg", "--surface", "--surface-2", "--surface-hover", "--outline", "--outline-soft",
  "--text", "--text-2", "--accent", "--on-accent", "--accent-container", "--on-accent-container",
  "--danger", "--danger-container", "--on-danger-container",
] as const;

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function materialTokens(seedHex: string, theme: "light" | "dark"): Record<(typeof TOKEN_KEYS)[number], string> {
  const { palettes: p } = themeFromSourceColor(argbFromHex(seedHex));
  const light = theme === "light";
  const t = (palette: { tone(n: number): number }, tone: number) => hexFromArgb(palette.tone(tone));
  return {
    "--bg": t(p.neutral, light ? 98 : 6),
    "--surface": t(p.neutral, light ? 94 : 12),
    "--surface-2": t(p.neutral, light ? 92 : 17),
    "--surface-hover": t(p.neutral, light ? 90 : 22),
    "--outline": t(p.neutralVariant, light ? 50 : 60),
    "--outline-soft": t(p.neutralVariant, light ? 80 : 30),
    "--text": t(p.neutral, light ? 10 : 90),
    "--text-2": t(p.neutralVariant, light ? 30 : 80),
    "--accent": t(p.primary, light ? 40 : 80),
    "--on-accent": t(p.primary, light ? 100 : 20),
    "--accent-container": t(p.primary, light ? 90 : 30),
    "--on-accent-container": t(p.primary, light ? 10 : 90),
    "--danger": t(p.error, light ? 40 : 80),
    "--danger-container": t(p.error, light ? 90 : 30),
    "--on-danger-container": t(p.error, light ? 10 : 90),
  };
}

/** Writes the derived palette onto <html>; with `seed` undefined it removes the overrides (static palette applies). */
export function applyDynamicColor(root: HTMLElement, seed: string | undefined, theme: "light" | "dark") {
  if (!seed || !isHexColor(seed)) {
    for (const k of TOKEN_KEYS) root.style.removeProperty(k);
    return;
  }
  const tokens = materialTokens(seed, theme);
  for (const k of TOKEN_KEYS) root.style.setProperty(k, tokens[k]);
}

/**
 * On Android 12+ the Capacitor shell exposes the wallpaper-derived system
 * accent (see MainActivity.java). Returns it as #rrggbb, or null elsewhere.
 */
export function systemAccent(): string | null {
  try {
    const bridge = (window as unknown as { PeerSitterAndroid?: { systemAccent?: () => string } }).PeerSitterAndroid;
    const hex = bridge?.systemAccent?.();
    return hex && isHexColor(hex) ? hex : null;
  } catch {
    return null;
  }
}
