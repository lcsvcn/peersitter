import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@peersitter/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  server: {
    // WebRTC camera/mic access requires a secure context; `vite dev --host`
    // over plain HTTP only works on localhost. For testing across devices
    // on your LAN, run with HTTPS (see README) or use a tunnel.
    host: true,
  },
});
