import type { PairingPayload } from "./types";

/**
 * Generates a DTLS certificate up front so we can hand its fingerprint to
 * the Camera UI (for the QR code) before any signaling or offer/answer
 * exchange happens.
 */
export async function generatePairingCertificate(): Promise<RTCCertificate> {
  return RTCPeerConnection.generateCertificate({
    name: "ECDSA",
    namedCurve: "P-256",
  } as EcKeyGenParams);
}

export function certificateFingerprint(cert: RTCCertificate): string {
  const fp = cert.getFingerprints?.()[0];
  if (!fp?.value) throw new Error("Could not read certificate fingerprint");
  return fp.value.toLowerCase();
}

export function buildPairingPayload(opts: {
  signalingUrl: string;
  roomId: string;
  fingerprint: string;
  name?: string;
}): PairingPayload {
  const { name, ...rest } = opts;
  return { v: 1, ...rest, ...(name?.trim() ? { name: name.trim().slice(0, 40) } : {}) };
}

export function encodePairingPayload(payload: PairingPayload): string {
  return JSON.stringify(payload);
}

export function decodePairingPayload(raw: string): PairingPayload {
  const parsed = JSON.parse(raw);
  if (parsed?.v !== 1 || !parsed.signalingUrl || !parsed.roomId || !parsed.fingerprint) {
    throw new Error("Invalid or unsupported pairing code");
  }
  return parsed as PairingPayload;
}

/** Extracts the sha-256 DTLS fingerprint from a negotiated SDP, for comparison against the QR value. */
export function fingerprintFromSdp(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/);
  return match ? match[1].toLowerCase() : null;
}

// ---- short pairing codes (A5GF-75GH) ----

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I; must match the relay
export const PAIRING_CODE_LENGTH = 8;

/** Keeps only valid code characters (uppercased, at most 8) and shows them as XXXX-XXXX while typing. */
export function formatPairingCode(input: string): string {
  const chars = [...input.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).slice(0, PAIRING_CODE_LENGTH);
  const raw = chars.join("");
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export function isCompletePairingCode(input: string): boolean {
  return formatPairingCode(input).replace("-", "").length === PAIRING_CODE_LENGTH;
}

/**
 * A short number both people can compare out loud to confirm nobody sits in
 * the middle of a code-paired connection: derived from BOTH ends' DTLS
 * fingerprints, so a relay that swapped either one shows two different
 * numbers. Eight digits, shown as "4829 1357".
 */
export async function safetyNumber(fingerprintA: string, fingerprintB: string): Promise<string> {
  const joined = [fingerprintA, fingerprintB].map((f) => f.toLowerCase()).sort().join("|");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joined)));
  const n = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  const digits = String(n % 100_000_000).padStart(8, "0");
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}
