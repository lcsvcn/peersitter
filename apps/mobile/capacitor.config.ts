import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.peersitter.app",
  appName: "PeerSitter",
  // Points at the built web app; `npm run build --workspace=apps/web` before `cap sync`.
  webDir: "../web/dist",
};

export default config;
