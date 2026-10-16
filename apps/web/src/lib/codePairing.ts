import { SignalingClient, type PairingPayload } from "@peersitter/core";

export type CodeError = "code-not-found" | "rate-limited" | "unreachable" | "no-fingerprint";

export const CODE_ERROR_TEXT: Record<CodeError, string> = {
  "code-not-found": "No camera with that code. Check it and try again.",
  "rate-limited": "Too many wrong codes. Wait a minute and try again.",
  unreachable: "Couldn't reach the signaling server. Both devices must use the same one (Settings).",
  "no-fingerprint": "That camera is too old to pair by code. Scan its QR code instead.",
};

/**
 * Looks a short code up on the relay and builds the payload a tile connects with.
 * The fingerprint comes from the relay, which is untrusted, so the payload is
 * marked `unverified` and the tile asks the user to compare a safety number.
 */
export async function connectByCode(signalingUrl: string, code: string): Promise<PairingPayload> {
  let client: SignalingClient | null = null;
  try {
    client = new SignalingClient(signalingUrl);
    const resolved = await Promise.race([
      client.resolveCode(code),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("unreachable")), 8000)),
    ]);
    if (!resolved.fingerprint) throw new Error("no-fingerprint");
    return {
      v: 1,
      signalingUrl,
      roomId: resolved.roomId,
      fingerprint: resolved.fingerprint,
      name: resolved.name || undefined,
      unverified: true,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const known: CodeError[] = ["code-not-found", "rate-limited", "no-fingerprint"];
    throw new Error(known.includes(message as CodeError) ? message : "unreachable");
  } finally {
    client?.close();
  }
}
