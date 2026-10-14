import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { generateCode, networkKey, normalizeCode } from "./codes.js";

/**
 * Signaling-only relay for WebRTC pairing.
 *
 * This process never sees camera/mic media, recordings, or the encryption
 * fingerprint verification step (that happens client-side, see
 * packages/core/src/pairing.ts). It only shuttles opaque JSON messages
 * (SDP offer/answer, ICE candidates).
 *
 * Topology: a room is a hub. The camera that created it is the *host*;
 * any number of viewers (up to `maxViewers`) can join as *guests*. Every
 * viewer gets its own WebRTC connection to the camera, so signal messages
 * are routed per peer:
 *
 *   guest -> host : relayed with `from: <guestPeerId>`
 *   host  -> guest: must carry `to: <guestPeerId>`; without `to` it is
 *                   broadcast to every guest (the original 1:1 behaviour)
 *
 * Guests never talk to each other. A guest leaving only removes that
 * guest; the host leaving closes the whole room. Rooms are created with a
 * random, unguessable id and live as long as their host's socket does.
 */

export interface ServerOptions {
  port?: number;
  /** Max simultaneous viewers per camera room. */
  maxViewers?: number;
  /** Liveness ping interval; a socket that misses one pong is dropped. 0 disables. */
  heartbeatMs?: number;
  /** Failed code lookups allowed per network per minute before it is blocked for the rest of the minute. */
  maxCodeFailures?: number;
  /** Trust X-Forwarded-For (set when running behind a reverse proxy / PaaS) to tell networks apart. */
  trustProxy?: boolean;
}

interface Room {
  id: string;
  hostId: string;
  peers: Map<string, WebSocket>; // includes host
  createdAt: number;
  /** Short human-typeable code (XXXXXXXX) that resolves to this room while the camera is online. */
  code: string;
  name: string;
  /** The camera's DTLS fingerprint as claimed by the camera (untrusted: viewers confirm a safety number). */
  fingerprint: string;
  /** Listed to viewers on the same network. */
  discoverable: boolean;
  network: string;
}

export interface SignalingServer {
  httpServer: Server;
  port: number;
  roomCount(): number;
  close(): Promise<void>;
}

export function startSignalingServer(opts: ServerOptions = {}): Promise<SignalingServer> {
  const maxViewers = opts.maxViewers ?? 8;
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const maxCodeFailures = opts.maxCodeFailures ?? 12;
  const trustProxy = opts.trustProxy ?? false;
  const rooms = new Map<string, Room>();
  const roomsByCode = new Map<string, Room>();
  /** Sockets that asked to be told which cameras are nearby, per network. */
  const nearbyWatchers = new Map<string, Set<WebSocket>>();
  const codeFailures = new Map<string, { count: number; resetAt: number }>();

  const httpServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Signaling messages (SDP/ICE) are a few KB; refuse anything bigger than 64 KB
  // instead of letting a client make the relay buffer up to ws's 100 MB default.
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const FINGERPRINT_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){31}$/i;

  function nearbyList(network: string) {
    return [...rooms.values()]
      .filter((r) => r.network === network && r.discoverable)
      .map((r) => ({ code: r.code, name: r.name }));
  }

  function announceNearby(network: string) {
    const watchers = nearbyWatchers.get(network);
    if (!watchers?.size) return;
    const payload = { type: "nearby", cameras: nearbyList(network) };
    for (const w of watchers) send(w, payload);
  }

  function closeRoom(room: Room, reason: string) {
    rooms.delete(room.id);
    roomsByCode.delete(room.code);
    announceNearby(room.network);
    for (const [id, peer] of room.peers) {
      if (id === room.hostId) continue;
      send(peer, { type: "peer-left", reason });
      peer.close();
    }
  }

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (ws, req) => {
    const network = networkKey(req.socket.remoteAddress, req.headers["x-forwarded-for"] as string | undefined, trustProxy);
    let joinedRoom: Room | null = null;
    const peerId = randomUUID();
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    // Without a listener, a protocol error (oversized or malformed frame) from
    // one client is an uncaught exception that would take the relay down for
    // everyone. ws closes the offending socket itself; we just must not crash.
    ws.on("error", () => ws.terminate());

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed input
      }

      switch (msg.type) {
        case "create-room": {
          if (joinedRoom) return; // one room per socket
          const roomId = randomUUID();
          const room: Room = {
            id: roomId,
            hostId: peerId,
            peers: new Map([[peerId, ws]]),
            createdAt: Date.now(),
            code: generateCode((c) => roomsByCode.has(c)),
            name: typeof msg.name === "string" ? msg.name.trim().slice(0, 40) : "",
            fingerprint: typeof msg.fingerprint === "string" && FINGERPRINT_RE.test(msg.fingerprint) ? msg.fingerprint.toLowerCase() : "",
            discoverable: msg.discoverable === true,
            network,
          };
          rooms.set(roomId, room);
          roomsByCode.set(room.code, room);
          joinedRoom = room;
          send(ws, { type: "room-created", roomId, code: room.code });
          if (room.discoverable) announceNearby(network);
          break;
        }

        // Host changes what it advertises without re-creating the room.
        case "update-room": {
          if (!joinedRoom || joinedRoom.hostId !== peerId) return;
          if (typeof msg.discoverable === "boolean") joinedRoom.discoverable = msg.discoverable;
          if (typeof msg.name === "string") joinedRoom.name = msg.name.trim().slice(0, 40);
          announceNearby(joinedRoom.network);
          break;
        }

        // Viewer: "which cameras are on my network?" — also subscribes to changes.
        case "list-nearby": {
          let set = nearbyWatchers.get(network);
          if (!set) nearbyWatchers.set(network, (set = new Set()));
          set.add(ws);
          send(ws, { type: "nearby", cameras: nearbyList(network) });
          break;
        }

        // Viewer: turn a typed code into the room to join + the camera's claimed fingerprint.
        case "resolve-code": {
          const now = Date.now();
          const fails = codeFailures.get(network);
          if (fails && fails.resetAt > now && fails.count >= maxCodeFailures) {
            send(ws, { type: "error", message: "rate-limited" });
            return;
          }
          const code = normalizeCode(msg.code);
          const room = code ? roomsByCode.get(code) : undefined;
          if (!room) {
            const f = fails && fails.resetAt > now ? fails : { count: 0, resetAt: now + 60_000 };
            f.count++;
            codeFailures.set(network, f);
            send(ws, { type: "error", message: "code-not-found" });
            return;
          }
          send(ws, { type: "code-resolved", roomId: room.id, fingerprint: room.fingerprint, name: room.name });
          break;
        }

        case "join-room": {
          if (joinedRoom) return;
          const room = typeof msg.roomId === "string" ? rooms.get(msg.roomId) : undefined;
          if (!room) {
            send(ws, { type: "error", message: "room-not-found" });
            return;
          }
          if (room.peers.size - 1 >= maxViewers) {
            send(ws, { type: "error", message: "room-full" });
            return;
          }
          room.peers.set(peerId, ws);
          joinedRoom = room;
          send(ws, { type: "joined", peerId });
          const host = room.peers.get(room.hostId);
          if (host) send(host, { type: "peer-joined", peerId });
          break;
        }

        // Opaque relay: SDP offers/answers and ICE candidates pass straight
        // through without inspection. Media itself never transits this server.
        case "signal": {
          if (!joinedRoom) return;
          if (peerId === joinedRoom.hostId) {
            if (typeof msg.to === "string") {
              const target = joinedRoom.peers.get(msg.to);
              if (target && msg.to !== peerId) send(target, { type: "signal", data: msg.data, from: peerId });
            } else {
              for (const [id, peer] of joinedRoom.peers) {
                if (id !== peerId) send(peer, { type: "signal", data: msg.data });
              }
            }
          } else {
            const host = joinedRoom.peers.get(joinedRoom.hostId);
            if (host) send(host, { type: "signal", data: msg.data, from: peerId });
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      nearbyWatchers.get(network)?.delete(ws);
      if (!joinedRoom) return;
      const room = joinedRoom;
      if (peerId === room.hostId) {
        closeRoom(room, "peer-disconnected");
      } else if (room.peers.delete(peerId)) {
        const host = room.peers.get(room.hostId);
        if (host) send(host, { type: "peer-left", peerId, reason: "peer-disconnected" });
      }
    });
  });

  // Drop sockets whose device vanished without a clean close (phone lost
  // power / Wi-Fi), so a dead camera's room doesn't linger forever.
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const ws of wss.clients) {
            if (alive.get(ws) === false) {
              ws.terminate();
              continue;
            }
            alive.set(ws, false);
            ws.ping();
          }
        }, heartbeatMs)
      : null;
  heartbeat?.unref();

  return new Promise((resolve) => {
    httpServer.listen(opts.port ?? 0, () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : (opts.port ?? 0);
      resolve({
        httpServer,
        port,
        roomCount: () => rooms.size,
        close: () =>
          new Promise<void>((done) => {
            if (heartbeat) clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => httpServer.close(() => done()));
          }),
      });
    });
  });
}
