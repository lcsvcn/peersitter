import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** Where HomeKit pairing state lives; override with PEERSITTER_HOMEKIT_DIR. */
export function stateDir() {
  return (
    process.env.PEERSITTER_HOMEKIT_DIR ??
    path.join(os.homedir(), "Library", "Application Support", "PeerSitter", "homekit")
  );
}

// HomeKit rejects trivially guessable setup codes.
const BANNED = new Set([
  "000-00-000", "111-11-111", "222-22-222", "333-33-333", "444-44-444",
  "555-55-555", "666-66-666", "777-77-777", "888-88-888", "999-99-999",
  "123-45-678", "876-54-321",
]);

function randomPincode() {
  for (;;) {
    const digits = String(crypto.randomInt(0, 100_000_000)).padStart(8, "0");
    const code = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (!BANNED.has(code)) return code;
  }
}

function randomMac() {
  const b = crypto.randomBytes(6);
  b[0] = (b[0] | 0x02) & 0xfe; // locally administered, unicast
  return [...b].map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

/**
 * The accessory's identity (MAC-style id + setup code) must survive restarts,
 * otherwise the Home app would see a brand-new camera every launch and the
 * existing pairing would break.
 */
export function loadIdentity(dir = stateDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "identity.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.username && saved.pincode) return saved;
  } catch {}
  const identity = { username: randomMac(), pincode: randomPincode() };
  fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}
