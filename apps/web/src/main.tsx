import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { loadSettings } from "./settings";
import { applyTheme } from "./theme";

// Set theme before first paint so there is no flash of the wrong palette.
const initial = loadSettings();
applyTheme(initial.appearance, initial.design);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
