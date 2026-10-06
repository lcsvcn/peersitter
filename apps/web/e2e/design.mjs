// Visual + accessibility audit of every screen in every design/theme.
//
// Drives the real app (two live cameras with distinct feeds + one viewer)
// through: home, settings, viewer scanner, viewer dashboard with 2 tiles,
// camera, recordings, in {glass, material} x {light, dark} x {phone, desktop},
// takes a screenshot of each, and runs axe-core (WCAG 2 A/AA incl. colour
// contrast) on each. Fails on any serious/critical violation.
//
// Run: node e2e/design.mjs            (screenshots -> e2e/design-shots/)
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const SIGNAL_PORT = Number(process.env.SIGNAL_PORT ?? 8788);
const WEB_URL = "http://localhost:5173";
const OUT = new URL("./design-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const DESIGNS = (process.env.DESIGNS ?? "glass,material").split(",");
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 },
};
const FEEDS = [
  ["Nursery", [220, 40, 40]],
  ["Garage", [50, 90, 230]],
];

const root = new URL("../../..", import.meta.url).pathname;
const spawnGroup = (cmd, args, cwd, env = {}) =>
  spawn(cmd, args, { cwd, stdio: "ignore", detached: true, env: { ...process.env, ...env } });
const kill = (p) => {
  try {
    process.kill(-p.pid);
  } catch {
    p.kill();
  }
};
const signal = spawnGroup("npx", ["tsx", "src/index.ts"], `${root}signaling-server`, { PORT: String(SIGNAL_PORT) });
const vite = spawnGroup("npx", ["vite", "--port", "5173", "--strictPort"], new URL("..", import.meta.url).pathname);

async function waitFor(url, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${url}`);
}

const problems = [];
const summary = [];
async function audit(page, label) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of bad) {
    const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " — " + (n.any[0]?.message ?? n.failureSummary?.split("\n")[1] ?? "")).join(" | ");
    problems.push(`${label}: ${v.id} (${v.impact}) x${v.nodes.length}: ${nodes}`);
  }
  summary.push(`${label}: ${bad.length === 0 ? "axe clean" : bad.map((b) => b.id).join(",")}`);
}

try {
  await waitFor(`http://localhost:${SIGNAL_PORT}/healthz`);
  await waitFor(WEB_URL);
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  for (const design of DESIGNS)
    for (const theme of THEMES)
      for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        const tag = `${design}-${theme}-${vpName}`;
        const mk = async (feed, name) => {
          const ctx = await browser.newContext({ ...vp, colorScheme: theme });
          await ctx.grantPermissions(["camera", "microphone"]);
          await ctx.addInitScript(
            ([url, d, t, nm]) => {
              localStorage.setItem(
                "peersitter:settings",
                JSON.stringify({ signalingUrl: url, design: d, appearance: t, cameraName: nm }),
              );
            },
            [`ws://localhost:${SIGNAL_PORT}`, design, theme, name ?? ""],
          );
          if (feed) {
            await ctx.addInitScript((rgb) => {
              const c = document.createElement("canvas");
              c.width = 640;
              c.height = 360;
              const g = c.getContext("2d");
              let t = 0;
              setInterval(() => {
                const grad = g.createLinearGradient(0, 0, 640, 360);
                grad.addColorStop(0, `rgb(${rgb.join(",")})`);
                grad.addColorStop(1, `rgb(${rgb.map((x) => Math.round(x * 0.45)).join(",")})`);
                g.fillStyle = grad;
                g.fillRect(0, 0, 640, 360);
                g.fillStyle = "rgba(255,255,255,0.4)";
                g.fillRect((t * 11) % 560, 150, 70, 70);
                t++;
              }, 50);
              const v = c.captureStream(20);
              const a = new AudioContext().createMediaStreamDestination().stream;
              navigator.mediaDevices.getUserMedia = async (cs) => {
                const o = new MediaStream();
                if (cs?.video) v.getVideoTracks().forEach((x) => o.addTrack(x.clone()));
                if (cs?.audio) a.getAudioTracks().forEach((x) => o.addTrack(x.clone()));
                return o;
              };
            }, feed);
          }
          const page = await ctx.newPage();
          await page.goto(WEB_URL);
          return page;
        };
        const shot = async (page, name) => {
          await page.bringToFront();
          await sleep(350); // let transitions settle
          await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true });
          await audit(page, `${tag}/${name}`);
        };

        // cameras
        const cams = [];
        const codes = [];
        for (const [name, rgb] of FEEDS) {
          const cam = await mk(rgb, name);
          await cam.getByText("Be a Camera").click();
          await cam.waitForSelector(".pairing textarea", { state: "attached", timeout: 20000 });
          codes.push(await cam.locator(".pairing textarea").inputValue());
          cams.push(cam);
        }

        // viewer
        const viewer = await mk(null);
        await shot(viewer, "1-home");
        await viewer.getByText("Settings", { exact: true }).click();
        await shot(viewer, "2-settings");
        await viewer.getByText("Be a Viewer").click();
        await shot(viewer, "3-viewer-scan");
        for (const [i, code] of codes.entries()) {
          if (i > 0) await viewer.getByText("Add another camera").click();
          await viewer.getByText(/paste the code instead/i).click();
          await viewer.locator("textarea").fill(code);
        }
        for (const [name] of FEEDS) {
          await viewer.locator(`section[aria-label="${name}"] .status strong`).filter({ hasText: "connected" }).waitFor({ timeout: 40000 });
        }
        await sleep(1500);
        await shot(viewer, "4-viewer-tiles");
        await shot(cams[0], "5-camera");

        await viewer.getByRole("button", { name: "Back" }).click();
        await viewer.getByText("Recordings").first().click();
        await sleep(800);
        await shot(viewer, "6-recordings");
        await viewer.context().close();
        for (const c of cams) await c.context().close();
      }
  await browser.close();
} catch (e) {
  problems.push(`harness error: ${e.message}`);
} finally {
  kill(signal);
  kill(vite);
}

console.log(summary.join("\n"));
console.log(problems.length ? `\nDESIGN AUDIT FAILED (${problems.length})\n` + problems.join("\n") : "\nDESIGN AUDIT PASSED — no serious/critical a11y or contrast violations");
console.log(`screenshots: ${OUT}`);
process.exit(problems.length ? 1 : 0);
