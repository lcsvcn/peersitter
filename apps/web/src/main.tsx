import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { loadSettings } from "./settings";
import { applyTheme } from "./theme";

// Set theme before first paint so there is no flash of the wrong palette.
const initial = loadSettings();
applyTheme(initial.appearance, initial.design, initial.seedColor);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable PWA: offline app shell for browsers. Native shells bundle their own assets.
const w = window as unknown as { Capacitor?: unknown; __TAURI__?: unknown };
if (import.meta.env.PROD && "serviceWorker" in navigator && !w.Capacitor && !w.__TAURI__) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
