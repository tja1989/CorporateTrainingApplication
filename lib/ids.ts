import { randomUUID, randomBytes } from "crypto";

export function id(): string {
  return randomUUID();
}

/** Human-distributable one-time code, e.g. "K7QF-2MXX". Unambiguous alphabet. */
export function activationCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3) out += "-";
  }
  return out;
}

export function certificateSerial(): string {
  return `LL-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
