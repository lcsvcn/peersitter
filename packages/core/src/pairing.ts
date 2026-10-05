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
