import { applyDynamicColor, systemAccent, DEFAULT_SEED } from "./dynamicColor";

export type Appearance = "auto" | "light" | "dark";
export type DesignChoice = "auto" | "glass" | "material";
export type Design = "glass" | "material";

/**
 * Two platform-native design languages share one set of components:
 *  - "glass": Apple's Liquid Glass look (translucent, blurred surfaces,
 *    capsule controls, SF type) — default in the native macOS and iOS apps.
 *  - "material": Material 3 / Material You (tonal surfaces, filled and
 *    tonal buttons, Roboto) — default on Android, in any web browser, and on Windows/Linux.
 * Both support light and dark. Everything is driven by two attributes on
 * <html> (data-design, data-theme) that select CSS custom properties.
 */
export function detectDesign(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): Design {
  // Liquid Glass is the look of the native macOS app (Tauri) and the native
  // iOS app (Capacitor). Everything else — Android, and any web browser,
  // including Safari on a Mac or iPhone — gets Material You.
  const win = window as unknown as {
    __TAURI__?: unknown;
    Capacitor?: { getPlatform?: () => string };
  };
  const isMac = /Mac/i.test(nav.platform) || /Macintosh/.test(nav.userAgent);
  if (win.__TAURI__ && isMac) return "glass";
  if (win.Capacitor?.getPlatform?.() === "ios") return "glass";
  return "material";
}

export type Platform = "macos" | "ios" | "android" | "web";

/** Which native shell (if any) we're running in; drives density and chrome, not colours. */
export function detectPlatform(): Platform {
  const win = window as unknown as { __TAURI__?: unknown; Capacitor?: { getPlatform?: () => string } };
  if (win.__TAURI__ && /Mac/i.test(navigator.platform)) return "macos";
  const cap = win.Capacitor?.getPlatform?.();
  if (cap === "ios") return "ios";
  if (cap === "android") return "android";
  return "web";
}

export function resolveDesign(choice: DesignChoice): Design {
  return choice === "auto" ? detectDesign() : choice;
}

export function resolveTheme(appearance: Appearance, prefersDark: boolean): "light" | "dark" {
  return appearance === "auto" ? (prefersDark ? "dark" : "light") : appearance;
}

const THEME_COLOR: Record<Design, Record<"light" | "dark", string>> = {
  glass: { light: "#e9f0ff", dark: "#0a0f1f" },
  material: { light: "#f4fbfa", dark: "#0e1415" },
};

/**
 * @param seed  Material You seed colour: "system" follows the Android wallpaper
 *              accent when available, "" uses the stock palette, or a #rrggbb.
 */
export function applyTheme(appearance: Appearance, designChoice: DesignChoice, seed = "system") {
  const root = document.documentElement;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const theme = resolveTheme(appearance, dark);
  const design = resolveDesign(designChoice);
  root.dataset.theme = theme;
  root.dataset.design = design;
  root.style.colorScheme = theme;
  const resolvedSeed = seed === "system" ? (systemAccent() ?? DEFAULT_SEED) : seed || undefined;
  applyDynamicColor(root, design === "material" ? resolvedSeed : undefined, theme);
  // Inside the macOS desktop shell the window itself is translucent
  // (native vibrancy), so let the glass sample the desktop instead of a flat fill.
  root.dataset.nativeGlass = design === "glass" && isTauri() ? "true" : "false";
  root.dataset.platform = detectPlatform();
  root.dataset.desktop = isTauri() ? "true" : "false";
  if (isTauri()) ensureDragStrip();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[design][theme];
}

const isTauri = () => "__TAURI__" in window;

/** The desktop window has an overlay title bar, so give it a draggable strip under the traffic lights. */
function ensureDragStrip() {
  if (document.getElementById("drag-strip")) return;
  const strip = document.createElement("div");
  strip.id = "drag-strip";
  strip.setAttribute("data-tauri-drag-region", "");
  document.body.appendChild(strip);
}

/** Re-applies the theme when the OS switches between light and dark (only matters in "auto"). */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}
