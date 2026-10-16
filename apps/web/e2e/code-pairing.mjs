// Pairing without a QR code: type the short code, or pick the camera from
// "Cameras on your network", then verify the safety number matches on both ends.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.SIGNAL_PORT ?? 8788);
const WEB = "http://localhost:5173";
const root = new URL("../../..", import.meta.url).pathname;
const group = (cmd, args, cwd, env = {}) => spawn(cmd, args, { cwd, stdio: "ignore", detached: true, env: { ...process.env, ...env } });
const kill = (p) => { try { process.kill(-p.pid); } catch { p.kill(); } };
const signal = group("npx", ["tsx", "src/index.ts"], `${root}signaling-server`, { PORT: String(PORT) });
const vite = group("npx", ["vite", "--port", "5173", "--strictPort"], new URL("..", import.meta.url).pathname);

let failed = false;
const check = (c, m) => { if (!c) failed = true; console.log(`[code] ${c ? "[ok]" : "[FAIL]"} ${m}`); return c; };
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(250); } return false; };
async function waitFor(url) { await until(async () => (await fetch(url)).status < 500, 20000); }

try {
  await waitFor(`http://localhost:${PORT}/healthz`);
  await waitFor(WEB);
  const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const device = async (settings = {}) => {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(["camera", "microphone"]);
    await ctx.addInitScript((s) => localStorage.setItem("peersitter:settings", JSON.stringify(s)), { signalingUrl: `ws://localhost:${PORT}`, ...settings });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    await page.goto(WEB);
    return page;
  };

  const cam = await device({ cameraName: "Nursery" });
  await cam.getByText("Be a Camera").click();
  const codeEl = cam.getByTestId("pairing-short-code");
  await codeEl.waitFor({ timeout: 20000 });
  const code = (await codeEl.innerText()).trim();
  check(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), `camera shows a code like XXXX-XXXX (${code})`);

  // 1. viewer types the code lowercase, no dash
  const v1 = await device();
  await v1.getByText("Be a Viewer").click();
  await v1.locator("#camera-code-input").pressSequentially(code.replace("-", "").toLowerCase());
  const tile1 = v1.locator('section[aria-label="Nursery"]');
  check(await until(async () => (await tile1.locator(".status strong").first().innerText()) === "connected"), "typing the code (lowercase, no dash) connects");
  check(await tile1.getByTestId("trust").innerText().then((t) => /not verified/i.test(t)), "a code-paired tile is marked not verified");

  // 2. safety numbers match on both ends
  await tile1.getByRole("button", { name: "Verify" }).click();
  const viewerSafety = (await tile1.getByTestId("safety-number").innerText()).trim();
  const camSafety = await until(async () => (await cam.locator(".safety-number").first().textContent())?.trim());
  check(/^\d{4} \d{4}$/.test(viewerSafety) && viewerSafety === camSafety, `viewer and camera show the same safety number (${viewerSafety} / ${camSafety})`);
  await tile1.getByRole("button", { name: "It matches" }).click();
  check(await tile1.getByTestId("trust").innerText().then((t) => /^\s*Verified\s*$/i.test(t)), "confirming the number marks the tile Verified");

  // 3. wrong code
  const v2 = await device();
  await v2.getByText("Be a Viewer").click();
  await v2.locator("#camera-code-input").pressSequentially("ZZZZZZZZ");
  check(await until(() => v2.getByText(/No camera with that code/).isVisible(), 8000), "a wrong code gets a clear error");

  // 4. nearby list (same network = loopback here)
  await v2.reload();
  await v2.getByText("Be a Viewer").click();
  const row = v2.getByTestId("nearby-camera").filter({ hasText: "Nursery" });
  check(await until(() => row.isVisible(), 10000), "the camera is listed under Cameras on your network");
  await row.getByRole("button", { name: /Connect to Nursery/ }).click();
  check(await until(async () => (await v2.locator('section[aria-label="Nursery"] .status strong').first().innerText()) === "connected"), "one tap on the nearby camera connects");
  check((await cam.getByTestId("viewer-count").innerText()) === "2", "camera now has 2 viewers");

  // 5. opt out of the network list
  const v3 = await device();
  await cam.getByText("Add another viewer").click().catch(() => {});
  await cam.getByLabel("Show this camera to viewers on my network").uncheck();
  await v3.getByText("Be a Viewer").click();
  await sleep(1500);
  check((await v3.getByTestId("nearby-camera").count()) === 0, "with 'show on my network' off, the camera is not listed");
  await v3.locator("#camera-code-input").pressSequentially(code.replace("-", ""));
  check(await until(async () => (await v3.locator('section[aria-label="Nursery"] .status strong').first().innerText()) === "connected"), "…but its code still works");

  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  kill(signal);
  kill(vite);
}
console.log(failed ? "\nCODE PAIRING TEST FAILED" : "\nCODE PAIRING TEST PASSED");
process.exit(failed ? 1 : 0);
