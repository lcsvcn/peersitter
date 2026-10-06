export type Appearance = "auto" | "light" | "dark";
export type DesignChoice = "auto" | "glass" | "material";
export type Design = "glass" | "material";

/**
 * Two platform-native design languages share one set of components:
 *  - "glass": Apple's Liquid Glass look (translucent, blurred surfaces,
 *    capsule controls, SF type) — default on iOS, iPadOS and macOS.
 *  - "material": Material 3 / Material You (tonal surfaces, filled and
 *    tonal buttons, Roboto) — default on Android, the web and Windows/Linux.
 * Both support light and dark. Everything is driven by two attributes on
 * <html> (data-design, data-theme) that select CSS custom properties.
 */
export function detectDesign(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): Design {
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "glass";
  // iPadOS 13+ reports itself as a Mac; touch support is the tell. Real Macs
  // (Safari, or the Tauri/WKWebView desktop app) are glass too.
  if (/Mac/i.test(nav.platform) || /Macintosh/.test(ua)) return "glass";
  return "material";
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

export function applyTheme(appearance: Appearance, designChoice: DesignChoice) {
  const root = document.documentElement;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const theme = resolveTheme(appearance, dark);
  const design = resolveDesign(designChoice);
  root.dataset.theme = theme;
  root.dataset.design = design;
  root.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[design][theme];
}

/** Re-applies the theme when the OS switches between light and dark (only matters in "auto"). */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}
