import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startSignalingServer, type SignalingServer } from "../src/server.js";
import { CODE_ALPHABET, networkKey, normalizeCode } from "../src/codes.js";

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 3).toString(16).padStart(2, "0")).join(":");
let server: SignalingServer;
const open: WebSocket[] = [];

before(async () => {
  server = await startSignalingServer({ port: 0, heartbeatMs: 0, maxCodeFailures: 3 });
});
after(async () => {
  for (const ws of open) ws.terminate();
  await server.close();
});

class Client {
  ws: WebSocket;
  inbox: any[] = [];
  private waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void }> = [];
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${server.port}`);
    open.push(this.ws);
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const i = this.waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(msg);
      else this.inbox.push(msg);
    });
  }
  ready() {
    return new Promise<void>((res) => (this.ws.readyState === WebSocket.OPEN ? res() : this.ws.once("open", () => res())));
  }
  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }
  next(type: string, timeoutMs = 2000): Promise<any> {
    const i = this.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred: (m) => m.type === type, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  async none(type: string, ms = 120) {
    await new Promise((r) => setTimeout(r, ms));
    assert.equal(this.inbox.filter((m) => m.type === type).length, 0, `unexpected ${type}`);
  }
}

async function camera(opts: Record<string, unknown> = {}) {
  const c = new Client();
  await c.ready();
  c.send({ type: "create-room", name: "Nursery", fingerprint: FP, discoverable: true, ...opts });
  const created = await c.next("room-created");
  return { c, ...created } as { c: Client; roomId: string; code: string };
}
async function viewer() {
  const v = new Client();
  await v.ready();
  return v;
}

test("codes look like XXXXXXXX from the unambiguous alphabet and are unique", async () => {
  const codes = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { c, code } = await camera();
    assert.match(code, /^[A-Z2-9]{8}$/);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
    assert.ok(!/[01OI]/.test(code));
    codes.add(code);
    c.ws.close();
  }
  assert.equal(codes.size, 40);
});

test("normalizeCode accepts any case, dashes and spaces; rejects junk", () => {
  assert.equal(normalizeCode("a5gf-75gh"), "A5GF75GH");
  assert.equal(normalizeCode(" A5GF 75GH "), "A5GF75GH");
  assert.equal(normalizeCode("A5GF75G"), null);
  assert.equal(normalizeCode("A5GF75G0"), null); // 0 isn't in the alphabet
  assert.equal(normalizeCode(12345678), null);
});

test("a typed code resolves to the room, name and fingerprint; the viewer can then join", async () => {
  const { c, roomId, code } = await camera({ name: "Garage" });
  const v = await viewer();
  v.send({ type: "resolve-code", code: code.slice(0, 4).toLowerCase() + "-" + code.slice(4) });
  const r = await v.next("code-resolved");
  assert.deepEqual([r.roomId, r.name, r.fingerprint], [roomId, "Garage", FP]);
  v.send({ type: "join-room", roomId: r.roomId });
  await v.next("joined");
  assert.ok((await c.next("peer-joined")).peerId);
});

test("an unknown code is refused, and repeated guessing is rate limited", async () => {
  const v = await viewer();
  for (let i = 0; i < 3; i++) {
    v.send({ type: "resolve-code", code: "ZZZZ-ZZZ" + i });
    assert.equal((await v.next("error")).message, "code-not-found");
  }
  const { code } = await camera(); // even a CORRECT code is refused while blocked
  v.send({ type: "resolve-code", code });
  assert.equal((await v.next("error")).message, "rate-limited");
});

test("a code stops working when the camera goes away", async () => {
  const fresh = await startSignalingServer({ port: 0, heartbeatMs: 0 });
  const ws = new WebSocket(`ws://localhost:${fresh.port}`);
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ type: "create-room", fingerprint: FP }));
  const code: string = await new Promise((r) => ws.once("message", (m) => r(JSON.parse(m.toString()).code)));
  ws.close();
  await new Promise((r) => setTimeout(r, 150));
  const v = new WebSocket(`ws://localhost:${fresh.port}`);
  await new Promise((r) => v.once("open", r));
  v.send(JSON.stringify({ type: "resolve-code", code }));
  const msg: any = await new Promise((r) => v.once("message", (m) => r(JSON.parse(m.toString()))));
  assert.equal(msg.message, "code-not-found");
  v.terminate();
  await fresh.close();
});

test("nearby lists only discoverable cameras on my network, and updates live", async () => {
  const hidden = await camera({ name: "Hidden", discoverable: false });
  const v = await viewer();
  v.send({ type: "list-nearby" });
  const first = await v.next("nearby");
  assert.ok(!first.cameras.some((x: any) => x.name === "Hidden"));

  const shown = await camera({ name: "Porch" });
  const pushed = await v.next("nearby");
  assert.ok(pushed.cameras.some((x: any) => x.name === "Porch" && x.code === shown.code));

  hidden.c.send({ type: "update-room", discoverable: true });
  const after = await v.next("nearby");
  assert.ok(after.cameras.some((x: any) => x.name === "Hidden"));

  shown.c.ws.close();
  const gone = await v.next("nearby");
  assert.ok(!gone.cameras.some((x: any) => x.name === "Porch"));
  hidden.c.ws.close();
});

test("only the host can update a room", async () => {
  const { roomId, code } = await camera({ name: "Attic", discoverable: false });
  const v = await viewer();
  v.send({ type: "join-room", roomId });
  await v.next("joined");
  v.send({ type: "update-room", discoverable: true, name: "Hacked" });
  const watcher = await viewer();
  watcher.send({ type: "list-nearby" });
  const list = await watcher.next("nearby");
  assert.ok(!list.cameras.some((x: any) => x.code === code));
});

test("networkKey groups LAN peers by /24, public peers by address, loopback together", () => {
  assert.equal(networkKey("192.168.1.20"), networkKey("192.168.1.99"));
  assert.notEqual(networkKey("192.168.1.20"), networkKey("192.168.2.20"));
  assert.equal(networkKey("::ffff:10.0.0.5"), networkKey("10.0.0.77"));
  assert.equal(networkKey("::1"), networkKey("127.0.0.1"));
  assert.equal(networkKey("203.0.113.9"), networkKey("203.0.113.9"));
  assert.notEqual(networkKey("203.0.113.9"), networkKey("203.0.113.10"));
  assert.equal(networkKey("10.0.0.1", "203.0.113.5, 10.0.0.1", true), "ip:203.0.113.5");
  assert.equal(networkKey("10.0.0.1", "203.0.113.5", false), "lan:10.0.0");
});
