// Multi-device topology test: N Cameras + N Viewers against ONE signaling
// server (stand-ins for e.g. 4 old Android phones as cameras and 4 phones
// as clients). Each context is an isolated device with its own fake camera.
//
// Part A (asserted): N concurrent, independent Camera<->Viewer pairs all
// reach "connected" through the same relay without cross-talk.
// Part B (reported): a 2nd Viewer scanning an already-paired Camera's code.
// The relay rooms are strictly 1:1, so this documents the real limit.
//
// Run: node e2e/multi.mjs [N=4]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const N = Number(process.argv[2] ?? 4);
const WEB_URL = "http://localhost:5173";
const log = (m) => console.log(`[multi] ${m}`);

async function waitFor(url, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch {}
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${url}`);
}

const root = new URL("../../..", import.meta.url).pathname;
const procs = [
  spawn("npx", ["tsx", "src/index.ts"], { cwd: `${root}signaling-server`, stdio: "ignore" }),
  spawn("npx", ["vite", "--port", "5173", "--strictPort"], { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" }),
];
let failed = false;
const check = (c, m) => { if (!c) failed = true; log(`${c ? "[ok]" : "[FAIL]"} ${m}`); };

try {
  await waitFor("http://localhost:8787/healthz");
  await waitFor(WEB_URL);
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const newPage = async () => {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(["camera", "microphone"]);
    return ctx.newPage();
  };

  // Bring up N cameras concurrently, collect their pairing codes.
  const cameras = await Promise.all(Array.from({ length: N }, newPage));
  const codes = await Promise.all(cameras.map(async (p) => {
    await p.goto(WEB_URL);
    await p.getByText("Be a Camera").click();
    await p.waitForSelector("text=Status: waiting-for-viewer", { timeout: 20000 });
    await p.getByText(/Copy the pairing code instead/).click();
    return p.locator("textarea").inputValue();
  }));
  check(new Set(codes).size === N, `${N} cameras hold ${new Set(codes).size} distinct rooms`);

  // Part A: N viewers each pair with their own camera, all at once.
  const connect = async (viewer, code) => {
    await viewer.goto(WEB_URL);
    await viewer.getByText("Be a Viewer").click();
    await viewer.getByText(/paste the code instead/i).click();
    await viewer.locator("textarea").fill(code);
    await viewer.getByRole("button", { name: "Connect" }).click();
  };
  const viewers = await Promise.all(Array.from({ length: N }, newPage));
  await Promise.all(viewers.map((v, i) => connect(v, codes[i])));
  const results = await Promise.allSettled([
    ...viewers.map((v) => v.waitForSelector("text=Status: connected", { timeout: 30000 })),
    ...cameras.map((c) => c.waitForSelector("text=Status: connected", { timeout: 30000 })),
  ]);
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  check(okCount === 2 * N, `${okCount}/${2 * N} endpoints connected across ${N} concurrent pairs`);

  // Part B: extra client tries to watch camera 0, which already has a viewer.
  const extra = await newPage();
  await connect(extra, codes[0]);
  await sleep(8000);
  const extraStatus = await extra.locator(".status strong").first().innerText().catch(() => "?");
  const extraErr = await extra.locator(".error").first().innerText().catch(() => "");
  log(`[finding] 2nd viewer on an occupied camera: status=${extraStatus} ${extraErr ? `error="${extraErr}"` : ""}`);
  check(extraStatus === "error" && /already has a viewer/.test(extraErr), "2nd viewer is told the camera is occupied instead of hanging");
  const first = await viewers[0].locator(".status strong").first().innerText();
  check(first === "connected", `original viewer still connected after intruder attempt (${first})`);

  await browser.close();
} finally {
  procs.forEach((p) => p.kill());
}
console.log(failed ? "\nMULTI TEST FAILED" : "\nMULTI TEST PASSED");
process.exit(failed ? 1 : 0);
