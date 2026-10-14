import { useState, type ReactNode } from "react";
import type { ClipStorage } from "@peersitter/core";
import type { Settings } from "../settings";
import { homekitAvailable } from "../lib/homekit";
import HomeKitPanel from "./HomeKitPanel";
import SettingsPane from "./SettingsPane";
import Gallery from "./Gallery";
import {
  ActivityIcon,
  CameraIcon,
  EyeIcon,
  FilmIcon,
  GearIcon,
  GridIcon,
  HouseIcon,
  LockIcon,
  ShieldCheckIcon,
} from "../components/Icon";

type Section = "start" | "recordings" | "homekit" | "settings";

interface Props {
  settings: Settings;
  storage: ClipStorage;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onChooseCamera: () => void;
  onChooseViewer: () => void;
}

export default function Home({ settings, storage, onSettingsChange, onChooseCamera, onChooseViewer }: Props) {
  const [section, setSection] = useState<Section>("start");

  const items: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "start", label: "Start", icon: <GridIcon size={22} /> },
    { id: "recordings", label: "Recordings", icon: <FilmIcon size={22} /> },
    ...(homekitAvailable() ? [{ id: "homekit" as const, label: "Apple Home", icon: <HouseIcon size={22} /> }] : []),
    { id: "settings", label: "Settings", icon: <GearIcon size={22} /> },
  ];

  return (
    <div className="shell">
      <nav className="nav" aria-label="Sections">
        <div className="nav-brand">
          <span className="brand-mark small" aria-hidden>
            <CameraIcon size={20} />
          </span>
          <span className="nav-brand-name">PeerSitter</span>
        </div>
        <div className="nav-items">
          {items.map((item) => (
            <button
              key={item.id}
              className="nav-item"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
        <p className="nav-footer">Open source · MIT</p>
      </nav>

      <main className="content">
        {section === "start" && (
          <div className="pane-stack">
            <section className="hero">
              <h1 className="title">PeerSitter</h1>
              <p className="subtitle">
                Turn spare phones into private cameras and watch them from anywhere. No account, no cloud —
                your video goes straight between your devices.
              </p>
              <div className="chips" aria-label="Privacy">
                <span className="chip">
                  <LockIcon size={16} /> End-to-end encrypted
                </span>
                <span className="chip">
                  <ShieldCheckIcon size={16} /> No account
                </span>
                <span className="chip">
                  <ActivityIcon size={16} /> Records on motion
                </span>
              </div>
            </section>

            <div className="role-grid">
              <button className="card action" onClick={onChooseCamera}>
                <span className="card-icon" aria-hidden>
                  <CameraIcon size={28} />
                </span>
                <span className="card-body">
                  <span className="card-title">Be a Camera</span>
                  <span className="card-desc">Turn this device into a camera. Several viewers can watch at once.</span>
                </span>
                <span className="cta" aria-hidden>
                  Start
                </span>
              </button>
              <button className="card action" onClick={onChooseViewer}>
                <span className="card-icon" aria-hidden>
                  <EyeIcon size={28} />
                </span>
                <span className="card-body">
                  <span className="card-title">Be a Viewer</span>
                  <span className="card-desc">Scan camera QR codes to watch one or many live feeds at once.</span>
                </span>
                <span className="cta" aria-hidden>
                  Scan
                </span>
              </button>
            </div>
          </div>
        )}

        {section === "recordings" && <Gallery storage={storage} />}
        {section === "homekit" && <HomeKitPanel />}
        {section === "settings" && <SettingsPane settings={settings} onSettingsChange={onSettingsChange} />}
      </main>
    </div>
  );
}
