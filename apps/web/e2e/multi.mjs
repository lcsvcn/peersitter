// Multi-device topology test: several Cameras and several Viewers against
// ONE signaling server, e.g. 4 old phones as cameras and 4 phones as
// clients that each watch every camera. Each browser context is an isolated
// "device" with its own fake camera and storage.
//
// Covers: full-mesh pairing (N cameras x M viewers = N*M live links), real
// video frames flowing on every tile, camera names, duplicate-add guard,
// per-camera viewer cap, viewer leave/late join, one camera dropping out
// without disturbing the rest, and signaling-server restart recovery.
//
// Run: node e2e/multi.mjs [CAMERAS=4] [VIEWERS=4]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CAMERAS = Number(process.argv[2] ?? 4);
const VIEWERS = Number(process.argv[3] ?? 4);
const SIGNAL_PORT = Number(process.env.SIGNAL_PORT ?? 8788); // not 8787, so a dev relay can keep running
const WEB_URL = "http://localhost:5173";
// Each camera broadcasts a solid, unique colour (with a moving square so motion
// detection still fires), so a viewer tile can be checked for showing *its*
// camera and not just "some video".
const COLORS = [
  [220, 40, 40],
  [40, 190, 60],
  [50, 90, 230],
  [235, 200, 30],
  [170, 60, 200],
  [30, 190, 200],
  [240, 130, 30],
  [140, 140, 140],
];
const NAMES = ["Nursery", "Garage", "Porch", "Attic", "Kitchen", "Basement", "Shed", "Hall"];

const log = (m) => console.log(`[multi] ${m}`);
let failed = false;
const check = (cond, msg) => {
  if (!cond) failed = true;
  log(`${cond ? "[ok]" : "[FAIL]"} ${msg}`);
  return cond;
};

async function waitFor(url, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${url}`);
}

const root = new URL("../../..", import.meta.url).pathname;
const startSignal = () =>
  spawn("npx", ["tsx", "src/index.ts"], {
    cwd: `${root}signaling-server`,
    stdio: "ignore",
    detached: true, // own process group, so killTree also reaps the tsx child
    env: { ...process.env, PORT: String(SIGNAL_PORT), MAX_VIEWERS_PER_CAMERA: String(VIEWERS) },
  });
const killTree = (p) => {
  try {
    process.kill(-p.pid);
  } catch {
    p.kill();
  }
};
let signal = startSignal();
const vite = spawn("npx", ["vite", "--port", "5173", "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: "ignore",
  detached: true,
});

/** Polls `fn` until it returns truthy; returns that value or false on timeout. */
async function until(fn, ms = 30000, every = 250) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* retry */
    }
    await sleep(every);
  }
  return false;
}

try {
  await waitFor(`http://localhost:${SIGNAL_PORT}/healthz`);
  await waitFor(WEB_URL);
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  const newDevice = async (settings = {}, feedColor = null) => {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(["camera", "microphone"]);
    // Test-only hook: remember every RTCPeerConnection so we can read real
    // decoded-frame counters (video element timing is unreliable in
    // background tabs, which is where most of these "devices" live).
    await ctx.addInitScript(() => {
      window.__pcs = [];
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(target, args) {
          const pc = new target(...args);
          window.__pcs.push(pc);
          return pc;
        },
      });
    });
    if (feedColor) {
      await ctx.addInitScript((rgb) => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const g = canvas.getContext("2d");
        let t = 0;
        // setInterval, not rAF: background pages throttle rAF to nothing.
        setInterval(() => {
          g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          g.fillRect(0, 0, 320, 240);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect((t * 9) % 280, 100, 40, 40);
          t++;
        }, 50);
        const video = canvas.captureStream(20);
        const audio = new AudioContext().createMediaStreamDestination().stream;
        navigator.mediaDevices.getUserMedia = async (c) => {
          const out = new MediaStream();
          if (c?.video) video.getVideoTracks().forEach((tr) => out.addTrack(tr.clone()));
          if (c?.audio) audio.getAudioTracks().forEach((tr) => out.addTrack(tr.clone()));
          return out;
        };
      }, feedColor);
    }
    await ctx.addInitScript((s) => {
      localStorage.setItem("peersitter:settings", JSON.stringify(s));
    }, { signalingUrl: `ws://localhost:${SIGNAL_PORT}`, ...settings });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[pageerror] ${e}`));
    return page;
  };

  // ---------- cameras ----------
  const cameras = await Promise.all(
    Array.from({ length: CAMERAS }, (_, i) => newDevice({ cameraName: NAMES[i] }, COLORS[i])),
  );
  const readCode = async (cam) => {
    await cam.waitForSelector(".pairing textarea", { state: "attached", timeout: 20000 });
    return cam.locator(".pairing textarea").inputValue();
  };
  let codes = await Promise.all(
    cameras.map(async (cam) => {
      await cam.goto(WEB_URL);
      await cam.getByText("Be a Camera").click();
      await cam.waitForSelector("text=Status: waiting-for-viewer", { timeout: 20000 });
      return readCode(cam);
    }),
  );
  check(new Set(codes).size === CAMERAS, `${CAMERAS} cameras each hold a distinct room`);
  check(
    codes.every((c, i) => JSON.parse(c).name === NAMES[i]),
    "pairing codes carry each camera's name",
  );

  // ---------- viewers ----------
  const addCamera = async (viewer, code, first) => {
    if (!first) await viewer.getByText("Add another camera").click();
    await viewer.getByText(/paste the code instead/i).click();
    await viewer.locator("textarea").fill(code); // a complete code connects by itself
  };
  const tile = (viewer, name) => viewer.locator(`section[aria-label="${name}"]`);
  const tileStatus = async (viewer, name) =>
    (await tile(viewer, name).locator(".status strong").first().innerText().catch(() => "")).trim();
  const camViewerCount = async (cam) => Number(await cam.getByTestId("viewer-count").innerText());

  /** Number of connected peer links on this device whose decoded video frame counter is advancing. */
  const liveLinks = async (page) => {
    const sample = () =>
      page.evaluate(async () => {
        const out = {};
        for (const [i, pc] of window.__pcs.entries()) {
          if (pc.connectionState !== "connected") continue;
          (await pc.getStats()).forEach((r) => {
            if (r.type === "inbound-rtp" && r.kind === "video") out[i] = r.framesDecoded;
          });
        }
        return out;
      });
    // Chrome stops decoding video in occluded/background pages, so bring the page forward first.
    await page.bringToFront();
    await sleep(500);
    const a = await sample();
    await sleep(1200);
    const b = await sample();
    return Object.keys(b).filter((k) => a[k] !== undefined && b[k] > a[k]).length;
  };

  /** Polls until `n` links are decoding (slow CI machines, many tiles), returns the best count seen. */
  const expectLive = async (page, n, ms = 20000) => {
    let best = 0;
    await until(async () => {
      best = Math.max(best, await liveLinks(page));
      return best >= n;
    }, ms, 100);
    return best;
  };

  const viewers = await Promise.all(Array.from({ length: VIEWERS }, () => newDevice()));
  await Promise.all(viewers.map(async (v) => (await v.goto(WEB_URL), v.getByText("Be a Viewer").click())));

  // Each viewer adds every camera (sequentially per viewer, all viewers in parallel).
  await Promise.all(
    viewers.map(async (v) => {
      for (let i = 0; i < CAMERAS; i++) await addCamera(v, codes[i], i === 0);
    }),
  );

  const allConnected = await until(async () => {
    for (const v of viewers)
      for (let i = 0; i < CAMERAS; i++) if ((await tileStatus(v, NAMES[i])) !== "connected") return false;
    return true;
  }, 60000);
  check(allConnected, `${VIEWERS} viewers x ${CAMERAS} cameras = ${VIEWERS * CAMERAS} links all connected`);

  const tileCounts = await Promise.all(viewers.map((v) => v.getByTestId("camera-tile").count()));
  check(tileCounts.every((n) => n === CAMERAS), `every viewer shows ${CAMERAS} tiles, titled by camera name`);

  const live = [];
  for (const v of viewers) live.push(await expectLive(v, CAMERAS));
  check(live.every((n) => n === CAMERAS), `decoded video frames advance on every link (${live} of ${CAMERAS} per viewer)`);

  /** Average colour of a tile's currently displayed frame. */
  const tileColor = (viewer, name) =>
    tile(viewer, name)
      .locator("video")
      .evaluate((v) => {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const g = c.getContext("2d");
        g.drawImage(v, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let r = 0, gr = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) (r += d[i]), (gr += d[i + 1]), (b += d[i + 2]);
        const n = d.length / 4;
        return [r / n, gr / n, b / n];
      });
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 70; // 35% white overlay shifts a little

  let seen = 0;
  const wrong = [];
  for (const [vi, v] of viewers.entries()) {
    await v.bringToFront();
    // Enlarge nothing; sample every tile where it is. Allow a moment for frames to render.
    for (let i = 0; i < CAMERAS; i++) {
      let ok = false;
      let got = null;
      // Browsers don't paint a <video> that's below the fold, so scroll to it like a user would.
      await tile(v, NAMES[i]).scrollIntoViewIfNeeded();
      for (let attempt = 0; attempt < 20 && !ok; attempt++) {
        got = await tileColor(v, NAMES[i]).catch(() => null);
        ok = !!got && near(got, COLORS[i]);
        if (!ok) await sleep(300);
      }
      if (ok) seen++;
      else wrong.push(`viewer${vi + 1}/${NAMES[i]} got ${got?.map(Math.round)} want ${COLORS[i]}`);
    }
  }
  check(
    seen === VIEWERS * CAMERAS,
    `every viewer SEES every camera's own picture: ${seen}/${VIEWERS * CAMERAS} tiles show the right colour${wrong.length ? " — " + wrong.slice(0, 3).join("; ") : ""}`,
  );
  await viewers[0].bringToFront();
  await viewers[0].screenshot({ path: "e2e/screenshot-multi-viewer.png", fullPage: true });
  log("saved viewer dashboard screenshot to apps/web/e2e/screenshot-multi-viewer.png");

  const camCounts = await Promise.all(cameras.map(camViewerCount));
  check(camCounts.every((n) => n === VIEWERS), `every camera reports ${VIEWERS} viewers watching (${camCounts})`);

  // ---------- guards ----------
  await viewers[0].getByText("Add another camera").click();
  await viewers[0].getByText(/paste the code instead/i).click();
  await viewers[0].locator("textarea").fill(codes[0]);
  check(
    await until(() => viewers[0].getByText("already on your dashboard").isVisible(), 5000),
    "adding the same camera twice is refused with a message",
  );
  check((await viewers[0].getByTestId("camera-tile").count()) === CAMERAS, "…and no duplicate tile appears");

  // Camera 0 is at its viewer cap (== VIEWERS); one more client must be told so.
  const extra = await newDevice();
  await extra.goto(WEB_URL);
  await extra.getByText("Be a Viewer").click();
  await addCamera(extra, codes[0], true);
  check(
    await until(() => extra.getByText(/reached its viewer limit/).isVisible(), 10000),
    `a ${VIEWERS + 1}th viewer on a full camera is told it's at its limit`,
  );

  // ---------- viewer leaves / late joiner ----------
  await tile(viewers[1], NAMES[0]).getByRole("button", { name: /Remove/ }).click();
  check(
    await until(async () => (await camViewerCount(cameras[0])) === VIEWERS - 1, 10000),
    "removing a tile frees that camera's slot (camera count drops by one)",
  );
  check(
    (await camViewerCount(cameras[1])) === VIEWERS,
    "…while the other cameras still see all their viewers",
  );
  check((await expectLive(viewers[0], CAMERAS)) === CAMERAS, "…and other viewers keep receiving all their feeds");

  const late = await newDevice();
  await late.goto(WEB_URL);
  await late.getByText("Be a Viewer").click();
  await addCamera(late, codes[0], true);
  check(
    await until(async () => (await tileStatus(late, NAMES[0])) === "connected", 30000),
    "a late viewer joins the camera after others came and went",
  );
  check((await expectLive(late, 1)) === 1, "…and receives live video");

  // ---------- one camera drops out ----------
  const lost = CAMERAS - 1;
  await cameras[lost].close();
  const offlineEverywhere = await until(async () => {
    for (const v of viewers) if ((await tileStatus(v, NAMES[lost])) !== "offline") return false;
    return true;
  }, 20000);
  check(offlineEverywhere, `${NAMES[lost]} going dark shows "offline" on all ${VIEWERS} viewers`);
  let othersFine = true;
  for (const v of viewers)
    for (let i = 0; i < CAMERAS - 1; i++) {
      const removedByViewer1 = v === viewers[1] && i === 0; // viewer 1 deliberately removed this tile
      if (!removedByViewer1 && (await tileStatus(v, NAMES[i])) !== "connected") othersFine = false;
    }
  check(othersFine, "the remaining cameras are unaffected on every viewer");

  // ---------- signaling server restart ----------
  const oldCode = codes[1];
  killTree(signal);
  await until(async () => !(await fetch(`http://localhost:${SIGNAL_PORT}/healthz`).then(() => true, () => false)), 15000, 100);
  await sleep(1000);
  const liveDuringOutage = await expectLive(viewers[0], CAMERAS - 1);
  if (process.env.DEBUG_PCS)
    console.log(
      "[debug]",
      JSON.stringify(await viewers[0].evaluate(() => window.__pcs.map((pc) => [pc.connectionState, pc.iceConnectionState]))),
    );
  check(
    liveDuringOutage === CAMERAS - 1,
    `live streams keep flowing on every remaining camera while the signaling server is down (${liveDuringOutage}/${CAMERAS - 1})`,
  );
  signal = startSignal();
  await waitFor(`http://localhost:${SIGNAL_PORT}/healthz`);
  const newCode = await until(async () => {
    const c = await readCode(cameras[1]);
    return c !== oldCode ? c : false;
  }, 30000);
  check(!!newCode, "a camera re-registers with the restarted server and shows a fresh pairing code");
  if (newCode) {
    const fresh = await newDevice();
    await fresh.goto(WEB_URL);
    await fresh.getByText("Be a Viewer").click();
    await addCamera(fresh, newCode, true);
    check(
      await until(async () => (await tileStatus(fresh, NAMES[1])) === "connected", 30000),
      "a brand-new viewer pairs with the camera through the restarted server",
    );
  }

  await browser.close();
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  killTree(signal);
  killTree(vite);
}
console.log(failed ? "\nMULTI TEST FAILED" : "\nMULTI TEST PASSED");
process.exit(failed ? 1 : 0);
