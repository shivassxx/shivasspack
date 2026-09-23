import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque bearer-style secrets for session and reset cookies.
 * The database only ever stores the SHA-256 digest, so a database leak does not
 * expose usable tokens.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Compare two hex digests without early exit. */
export function tokensMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function hashIp(ip: string | null | undefined): string {
  // IPs are abuse signals, not personalisation data: hash before persisting.
  return createHash("sha256")
    .update(`shivass-ip:${ip && ip.length <= 64 ? ip : "unknown"}`)
    .digest("hex");
}
