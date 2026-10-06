import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startSignalingServer, type SignalingServer } from "../src/server.js";

let server: SignalingServer;
const open: WebSocket[] = [];

before(async () => {
  server = await startSignalingServer({ port: 0, maxViewers: 3, heartbeatMs: 0 });
});
after(async () => {
  for (const ws of open) ws.terminate();
  await server.close();
});

class Client {
  ws: WebSocket;
  inbox: any[] = [];
  private waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void }> = [];
  closed = false;

  constructor() {
    this.ws = new WebSocket(`ws://localhost:${server.port}`);
    open.push(this.ws);
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const i = this.waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(msg);
      else this.inbox.push(msg);
    });
    this.ws.on("close", () => (this.closed = true));
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
  async expectNothing(type: string, ms = 150) {
    await new Promise((r) => setTimeout(r, ms));
    assert.equal(this.inbox.filter((m) => m.type === type).length, 0, `unexpected ${type}`);
  }
}

async function camera() {
  const c = new Client();
  await c.ready();
  c.send({ type: "create-room" });
  const { roomId } = await c.next("room-created");
  return { c, roomId: roomId as string };
}
async function viewer(roomId: string) {
  const v = new Client();
  await v.ready();
  v.send({ type: "join-room", roomId });
  return v;
}

test("several viewers can join one camera and each gets its own peerId", async () => {
  const { c, roomId } = await camera();
  const v1 = await viewer(roomId);
  const v2 = await viewer(roomId);
  const [j1, j2] = [await v1.next("joined"), await v2.next("joined")];
  assert.notEqual(j1.peerId, j2.peerId);
  const ids = [(await c.next("peer-joined")).peerId, (await c.next("peer-joined")).peerId];
  assert.deepEqual(new Set(ids), new Set([j1.peerId, j2.peerId]));
});

test("viewer signals reach the host tagged with the sender", async () => {
  const { c, roomId } = await camera();
  const v1 = await viewer(roomId);
  const v2 = await viewer(roomId);
  const id1 = (await v1.next("joined")).peerId;
  const id2 = (await v2.next("joined")).peerId;
  v1.send({ type: "signal", data: { n: 1 } });
  v2.send({ type: "signal", data: { n: 2 } });
  const a = await c.next("signal");
  const b = await c.next("signal");
  const byFrom = Object.fromEntries([a, b].map((m) => [m.from, m.data.n]));
  assert.deepEqual(byFrom, { [id1]: 1, [id2]: 2 });
});

test("host signals with `to` reach only that viewer; viewers never see each other", async () => {
  const { c, roomId } = await camera();
  const v1 = await viewer(roomId);
  const v2 = await viewer(roomId);
  const id1 = (await v1.next("joined")).peerId;
  await v2.next("joined");
  c.send({ type: "signal", to: id1, data: "only-v1" });
  const got = await v1.next("signal");
  assert.equal(got.data, "only-v1");
  await v2.expectNothing("signal");
  v1.send({ type: "signal", data: "to-host" });
  await v2.expectNothing("signal");
});

test("host signal without `to` broadcasts (legacy 1:1 behaviour)", async () => {
  const { c, roomId } = await camera();
  const v = await viewer(roomId);
  await v.next("joined");
  c.send({ type: "signal", data: "hello" });
  const got = await v.next("signal");
  assert.equal(got.data, "hello");
  assert.equal(got.from, undefined);
});

test("room-full is enforced at maxViewers, and a freed slot is reusable", async () => {
  const { roomId } = await camera();
  const vs = [];
  for (let i = 0; i < 3; i++) {
    const v = await viewer(roomId);
    await v.next("joined");
    vs.push(v);
  }
  const extra = await viewer(roomId);
  assert.equal((await extra.next("error")).message, "room-full");
  vs[0].ws.close();
  await new Promise((r) => setTimeout(r, 100));
  const replacement = await viewer(roomId);
  await replacement.next("joined");
});

test("a viewer leaving notifies the host but keeps the room and other viewers", async () => {
  const { c, roomId } = await camera();
  const v1 = await viewer(roomId);
  const v2 = await viewer(roomId);
  const id1 = (await v1.next("joined")).peerId;
  await v2.next("joined");
  v1.ws.close();
  const left = await c.next("peer-left");
  assert.equal(left.peerId, id1);
  assert.equal(c.closed, false);
  assert.equal(v2.closed, false);
  c.send({ type: "signal", data: "still-works" }); // broadcast to remaining viewer
  assert.equal((await v2.next("signal")).data, "still-works");
});

test("host disconnect closes the room and tells every viewer", async () => {
  const { c, roomId } = await camera();
  const v1 = await viewer(roomId);
  const v2 = await viewer(roomId);
  await v1.next("joined");
  await v2.next("joined");
  c.ws.close();
  assert.equal((await v1.next("peer-left")).reason, "peer-disconnected");
  assert.equal((await v2.next("peer-left")).reason, "peer-disconnected");
  const late = await viewer(roomId);
  assert.equal((await late.next("error")).message, "room-not-found");
});

test("many cameras are isolated from each other", async () => {
  const cams = await Promise.all([camera(), camera(), camera(), camera()]);
  assert.equal(new Set(cams.map((x) => x.roomId)).size, 4);
  const vs = await Promise.all(cams.map((x) => viewer(x.roomId)));
  await Promise.all(vs.map((v) => v.next("joined")));
  vs.forEach((v, i) => v.send({ type: "signal", data: `cam-${i}` }));
  for (let i = 0; i < 4; i++) {
    assert.equal((await cams[i].c.next("signal")).data, `cam-${i}`);
    await cams[i].c.expectNothing("signal", 50);
  }
});

test("unknown rooms and garbage input are handled without crashing", async () => {
  const v = new Client();
  await v.ready();
  v.send({ type: "join-room", roomId: "nope" });
  assert.equal((await v.next("error")).message, "room-not-found");
  v.send({ type: "join-room", roomId: 123 });
  assert.equal((await v.next("error")).message, "room-not-found");
  v.ws.send("{not json");
  v.send({ type: "signal", data: 1 }); // not in a room: ignored
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(v.closed, false);
});

test("a socket can't create or join a second room", async () => {
  const a = await camera();
  const b = await camera();
  a.c.send({ type: "create-room" });
  a.c.send({ type: "join-room", roomId: b.roomId });
  await a.c.expectNothing("room-created");
  await a.c.expectNothing("joined");
});

test("heartbeat drops a camera that stops answering pings and frees its room", async () => {
  const s = await startSignalingServer({ port: 0, heartbeatMs: 100 });
  const ws = new WebSocket(`ws://localhost:${s.port}`, { autoPong: false });
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ type: "create-room" }));
  await new Promise((r) => ws.once("message", r));
  assert.equal(s.roomCount(), 1);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(s.roomCount(), 0);
  ws.terminate();
  await s.close();
});

test("oversized messages are refused and the connection dropped, not buffered", async () => {
  const v = new Client();
  await v.ready();
  const closed = new Promise<number>((res) => v.ws.once("close", (code) => res(code)));
  v.ws.send(JSON.stringify({ type: "signal", data: "x".repeat(200 * 1024) }));
  assert.equal(await closed, 1009); // "message too big"
  // ...and the relay is still healthy for everyone else.
  const { c, roomId } = await camera();
  const ok = await viewer(roomId);
  await ok.next("joined");
  assert.ok((await c.next("peer-joined")).peerId);
});
