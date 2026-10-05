import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.peersitter.app",
  appName: "PeerSitter",
  // Points at the built web app; `npm run build --workspace=apps/web` before `cap sync`.
  webDir: "../web/dist",
  android: {
    // Lets the https:// app origin open a plain ws:// signaling connection
    // (self-hosted relay on the LAN or localhost). Signaling is untrusted by
    // design — see docs/ARCHITECTURE.md.
    allowMixedContent: true,
  },
};

export default config;
