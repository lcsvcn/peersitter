import { randomInt } from "node:crypto";

/**
 * Short pairing codes: 8 characters from a 32-symbol alphabet with the
 * look-alikes removed (no 0/O, 1/I), shown as XXXX-XXXX. 32^8 = 2^40
 * possibilities, so guessing is impractical once failed lookups are rate
 * limited (see server.ts) and codes only exist while a camera is online.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export function generateCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
}

/** "a5gf-75gh", "A5GF 75GH" and "A5GF75GH" are the same code. Returns null if it can't be one. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/**
 * Which devices count as "on the same network" from the relay's point of
 * view. Behind home NAT every device shares one public address; on a LAN relay
 * devices have distinct private addresses, so private IPv4 is grouped by /24.
 * This is a convenience for discovery, never a security boundary.
 */
export function networkKey(remoteAddress: string | undefined, forwardedFor?: string, trustProxy = false): string {
  let addr = (trustProxy && forwardedFor ? forwardedFor.split(",")[0] : remoteAddress) ?? "unknown";
  addr = addr.trim().replace(/^::ffff:/, "");
  if (addr === "::1" || addr.startsWith("127.")) return "loopback";
  const v4 = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
    return isPrivate ? `lan:${a}.${b}.${c}` : `ip:${addr}`;
  }
  if (addr.includes(":")) return `ip6:${addr.split(":").slice(0, 4).join(":")}`; // IPv6: group by /64
  return `ip:${addr}`;
}
