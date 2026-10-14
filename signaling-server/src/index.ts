import { startSignalingServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const maxViewers = Number(process.env.MAX_VIEWERS_PER_CAMERA ?? 8);

const trustProxy = process.env.TRUST_PROXY === "1";
const server = await startSignalingServer({ port, maxViewers, trustProxy });
console.log(`[signaling] listening on :${server.port} (max ${maxViewers} viewers per camera)`);
