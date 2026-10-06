// Drives the actual app like a user pairing two devices: one browser
// context plays Camera, another plays Viewer, paired via the "paste code"
// fallback (Chrome's synthetic fake camera can't render a scannable QR
// code, so this also doubles as a real coverage check of that fallback
// path). Verifies: signaling handshake, WebRTC connect, fingerprint
// verification, motion-triggered recording, and ring-buffer clip storage.
//
// Run: node e2e/smoke.mjs   (from apps/web, after `npm run dev:signal` and
// `npm run dev:web` are already running — or let this script start them).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const SIGNAL_PORT = Number(process.env.SIGNAL_PORT ?? 8788); // not 8787, so a dev relay (or another project's) can keep running
const WEB_PORT = 5173;
const WEB_URL = `http://localhost:${WEB_PORT}`;

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

async function waitForPort(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnProcess(cmd, args, cwd, name, env = {}) {
  // detached: own process group, so killing it also reaps the child `npx` launched
  const proc = spawn(cmd, args, { cwd, stdio: "pipe", detached: true, env: { ...process.env, ...env } });
  proc.stdout.on("data", (d) => process.env.SMOKE_VERBOSE && console.log(`[${name}] ${d}`));
  proc.stderr.on("data", (d) => process.env.SMOKE_VERBOSE && console.error(`[${name}] ${d}`));
  return proc;
}

async function main() {
  const repoRoot = new URL("../../..", import.meta.url).pathname;
  const webRoot = new URL("..", import.meta.url).pathname;
  const signalRoot = `${repoRoot}signaling-server`;

  log("starting signaling server...");
  const signalProc = spawnProcess("npx", ["tsx", "src/index.ts"], signalRoot, "signal", { PORT: String(SIGNAL_PORT) });
  await waitForPort(`http://localhost:${SIGNAL_PORT}/healthz`);

  log("starting vite dev server...");
  const webProc = spawnProcess("npx", ["vite", "--port", String(WEB_PORT), "--strictPort"], webRoot, "web");
  await waitForPort(WEB_URL);

  const fakeDeviceArgs = [
    "--use-fake-device-for-media-stream", // synthetic, constantly-animating video + audio device
    "--use-fake-ui-for-media-stream", // auto-grant getUserMedia prompts
  ];

  log("launching Camera + Viewer browser contexts (fake camera devices)...");
  const browser = await chromium.launch({ channel: "chrome", args: fakeDeviceArgs });

  const cameraCtx = await browser.newContext();
  const viewerCtx = await browser.newContext();
  for (const ctx of [cameraCtx, viewerCtx]) {
    await ctx.addInitScript((url) => localStorage.setItem("peersitter:settings", JSON.stringify({ signalingUrl: url })), `ws://localhost:${SIGNAL_PORT}`);
  }
  await cameraCtx.grantPermissions(["camera", "microphone"]);
  await viewerCtx.grantPermissions(["camera", "microphone"]);

  const cameraPage = await cameraCtx.newPage();
  const viewerPage = await viewerCtx.newPage();

  let failed = false;
  const assert = (cond, msg) => {
    if (!cond) {
      failed = true;
      console.error(`[FAIL] ${msg}`);
    } else {
      log(`[ok] ${msg}`);
    }
  };

  cameraPage.on("console", (msg) => console.log(`[camera-console] ${msg.text()}`));
  cameraPage.on("pageerror", (err) => console.error(`[camera-pageerror] ${err}`));
  viewerPage.on("console", (msg) => console.log(`[viewer-console] ${msg.text()}`));
  viewerPage.on("pageerror", (err) => console.error(`[viewer-pageerror] ${err}`));

  try {
    // --- Camera role ---
    await cameraPage.goto(WEB_URL);
    await cameraPage.getByText("Be a Camera").click();
    try {
      await cameraPage.waitForSelector("text=Status: waiting-for-viewer", { timeout: 15000 });
    } catch (e) {
      console.error("[debug] camera page text:", await cameraPage.locator(".screen").innerText());
      throw e;
    }
    assert(true, "Camera reached waiting-for-viewer");

    await cameraPage.getByText(/Copy the pairing code instead/).click();
    const pairingCode = await cameraPage.locator("textarea").inputValue();
    assert(pairingCode.includes('"v":1'), "Camera produced a pairing code");

    // --- Viewer role ---
    await viewerPage.goto(WEB_URL);
    await viewerPage.getByText("Be a Viewer").click();
    await viewerPage.getByText(/paste the code instead/i).click();
    await viewerPage.locator("textarea").fill(pairingCode); // a complete code connects by itself

    await viewerPage.waitForSelector("text=Status: connected", { timeout: 20000 });
    assert(true, "Viewer connected and fingerprint verified");

    await cameraPage.waitForSelector("text=Status: connected", { timeout: 20000 });
    assert(true, "Camera side also reached connected");

    // --- Motion-triggered recording ---
    // Both roles default motion recording to ON; Chrome's synthetic fake
    // video is constantly animating, so the motion detector should trip
    // quickly on both ends.
    await viewerPage.waitForSelector("text=● Recording (motion detected)", { timeout: 15000 });
    assert(true, "Viewer started recording on detected motion");

    // Toggle motion recording off to force the in-progress clip to save
    // (exercises the save-on-cleanup fix) instead of waiting out a real
    // quiet period against a feed that never goes still.
    await viewerPage.locator('input[type="checkbox"]').click();
    await sleep(1000); // let the async stop()+saveClip() settle

    await viewerPage.getByRole("button", { name: "Back" }).click();
    await viewerPage.locator("button.card", { hasText: "Recordings" }).click();
    const clipRows = viewerPage.locator(".clip-row");
    await clipRows.first().waitFor({ timeout: 10000 });
    const clipCount = await clipRows.count();
    assert(clipCount >= 1, `Gallery shows ${clipCount} saved clip(s) from motion recording`);

    await viewerPage.screenshot({ path: "e2e/screenshot-viewer-gallery.png" });
    await cameraPage.screenshot({ path: "e2e/screenshot-camera-connected.png" });
    log("saved screenshots to apps/web/e2e/");
  } finally {
    await browser.close();
    for (const p of [signalProc, webProc]) {
      try {
        process.kill(-p.pid);
      } catch {
        p.kill();
      }
    }
  }

  if (failed) {
    console.error("\nSMOKE TEST FAILED");
    process.exit(1);
  }
  console.log("\nSMOKE TEST PASSED — pairing, encryption verification, motion recording, and local ring-buffer storage all work end-to-end.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
