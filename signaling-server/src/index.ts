import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Signaling-only relay for WebRTC pairing.
 *
 * This process never sees camera/mic media, recordings, or the encryption
 * fingerprint verification step (that happens client-side, see
 * packages/core/src/pairing.ts). It only shuttles opaque JSON messages
 * (SDP offer/answer, ICE candidates) between the exactly-two peers who
 * joined the same room id. Rooms are created by the camera device with a
 * random, unguessable id and are torn down as soon as either peer leaves.
 */

const PORT = Number(process.env.PORT ?? 8787);
const MAX_ROOM_AGE_MS = 10 * 60 * 1000; // rooms with no viewer expire after 10 min

interface Room {
  id: string;
  peers: Map<string, WebSocket>;
  createdAt: number;
}

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

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function closeRoom(room: Room, reason: string) {
  for (const peer of room.peers.values()) {
    send(peer, { type: "peer-left", reason });
    peer.close();
  }
  rooms.delete(room.id);
}

wss.on("connection", (ws) => {
  let joinedRoom: Room | null = null;
  let peerId = randomUUID();

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed input
    }

    switch (msg.type) {
      case "create-room": {
        const roomId = randomUUID();
        const room: Room = { id: roomId, peers: new Map([[peerId, ws]]), createdAt: Date.now() };
        rooms.set(roomId, room);
        joinedRoom = room;
        send(ws, { type: "room-created", roomId });
        break;
      }

      case "join-room": {
        const room = rooms.get(msg.roomId);
        if (!room) {
          send(ws, { type: "error", message: "room-not-found" });
          return;
        }
        if (room.peers.size >= 2) {
          send(ws, { type: "error", message: "room-full" });
          return;
        }
        room.peers.set(peerId, ws);
        joinedRoom = room;
        send(ws, { type: "joined" });
        for (const [id, peer] of room.peers) {
          if (id !== peerId) send(peer, { type: "peer-joined" });
        }
        break;
      }

      // Opaque relay: SDP offers/answers and ICE candidates pass straight
      // through without inspection. Media itself never transits this server.
      case "signal": {
        if (!joinedRoom) return;
        for (const [id, peer] of joinedRoom.peers) {
          if (id !== peerId) send(peer, { type: "signal", data: msg.data });
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    if (joinedRoom) closeRoom(joinedRoom, "peer-disconnected");
  });
});

// Garbage-collect stale rooms (e.g. a camera generated a QR nobody scanned).
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.createdAt > MAX_ROOM_AGE_MS) closeRoom(room, "expired");
  }
}, 60_000).unref();

httpServer.listen(PORT, () => {
  console.log(`[signaling] listening on :${PORT}`);
});
