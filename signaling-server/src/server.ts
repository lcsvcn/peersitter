import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

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
}

interface Room {
  id: string;
  hostId: string;
  peers: Map<string, WebSocket>; // includes host
  createdAt: number;
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
  const rooms = new Map<string, Room>();

  const httpServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  function closeRoom(room: Room, reason: string) {
    rooms.delete(room.id);
    for (const [id, peer] of room.peers) {
      if (id === room.hostId) continue;
      send(peer, { type: "peer-left", reason });
      peer.close();
    }
  }

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (ws) => {
    let joinedRoom: Room | null = null;
    const peerId = randomUUID();
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));

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
          const room: Room = { id: roomId, hostId: peerId, peers: new Map([[peerId, ws]]), createdAt: Date.now() };
          rooms.set(roomId, room);
          joinedRoom = room;
          send(ws, { type: "room-created", roomId });
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
