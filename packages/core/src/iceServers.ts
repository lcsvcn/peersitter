import type { IceServerConfig } from "./peerConnection";

/** Always kept so direct connections still work when no relay is configured. */
export const DEFAULT_STUN: IceServerConfig = { urls: "stun:stun.l.google.com:19302" };

/**
 * Parses the "ICE servers" setting: one server per line, either a bare URL
 * (STUN) or `url, username, credential` (TURN). Blank lines and `#` comments
 * are ignored; malformed lines are skipped rather than breaking connections.
 *
 *   stun:stun.example.org:3478
 *   turns:turn.example.org:443?transport=tcp, alice, s3cret
 */
export function parseIceServers(text: string): IceServerConfig[] {
  const servers: IceServerConfig[] = [DEFAULT_STUN];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [url, username, ...rest] = line.split(",").map((p) => p.trim());
    if (!/^(stun|stuns|turn|turns):/i.test(url)) continue;
    const isTurn = /^turns?:/i.test(url);
    if (isTurn && (!username || rest.length === 0)) continue; // TURN needs credentials
    servers.push(isTurn ? { urls: url, username, credential: rest.join(",") } : { urls: url });
  }
  return servers;
}
