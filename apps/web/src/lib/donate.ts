import { detectPlatform } from "../theme";

/** Where "Support development" goes. Change this to your own Sponsors / Ko-fi / Pix / PayPal page. */
export const DONATE_URL = "https://github.com/sponsors/lcsvcn";

/**
 * Hidden in the native iOS and Android apps: App Store and Google Play rules
 * restrict in-app links to external payments for anything but registered
 * nonprofits. Shown on macOS (distributed outside the Mac App Store) and the web.
 */
export const donationAvailable = () => {
  const p = detectPlatform();
  return p === "macos" || p === "web";
};

/** Opens in the system browser; inside the desktop shell a plain link would navigate the app window itself. */
export function openDonationPage() {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: (c: string, a: object) => Promise<void> } } }).__TAURI__;
  if (tauri?.core?.invoke) void tauri.core.invoke("open_external", { url: DONATE_URL });
  else window.open(DONATE_URL, "_blank", "noopener,noreferrer");
}
