import { useEffect, useMemo, useState } from "react";
import { ClipStorage } from "@peersitter/core";
import Home from "./pages/Home";
import Camera from "./pages/Camera";
import Viewer from "./pages/Viewer";
import { applyTheme, watchSystemTheme } from "./theme";
import { loadSettings, saveSettings, gbToBytes, type Settings } from "./settings";

export type Screen = "home" | "camera" | "viewer";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const storage = useMemo(() => new ClipStorage(gbToBytes(settings.maxStorageGB)), []);
  storage.setMaxBytes(gbToBytes(settings.maxStorageGB));

  useEffect(() => {
    applyTheme(settings.appearance, settings.design, settings.seedColor);
    return watchSystemTheme(() => applyTheme(settings.appearance, settings.design, settings.seedColor));
  }, [settings.appearance, settings.design, settings.seedColor]);

  function updateSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  if (screen === "camera") {
    return (
      <Camera
        signalingUrl={settings.signalingUrl}
        cameraName={settings.cameraName}
        storage={storage}
        motionSensitivity={settings.motionSensitivity}
        onBack={() => setScreen("home")}
      />
    );
  }
  if (screen === "viewer") {
    return (
      <Viewer
        signalingUrl={settings.signalingUrl}
        storage={storage}
        motionSensitivity={settings.motionSensitivity}
        onBack={() => setScreen("home")}
      />
    );
  }
  return (
    <Home
      settings={settings}
      storage={storage}
      onSettingsChange={updateSettings}
      onChooseCamera={() => setScreen("camera")}
      onChooseViewer={() => setScreen("viewer")}
    />
  );
}
