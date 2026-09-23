import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt cost parameters. N=16384/r=8/p=1 is the OWASP-recommended baseline.
 * The parameters are embedded in the stored hash so they can be raised later
 * without invalidating existing credentials (verify reads them from the hash).
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs 128 * N * r bytes; give it headroom over the required minimum.
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export class PasswordError extends Error {
  readonly code = "PASSWORD_INVALID";
}

/**
 * Returns a self-describing hash: `scrypt$N$r$p$saltB64$hashB64`.
 * Never logs or returns the plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    // Guard against a multi-megabyte payload forcing expensive CPU work.
    throw new PasswordError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** Constant-time verification. Returns false for malformed or unknown hashes. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored || typeof password !== "string" || password.length === 0) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters so a tampered row cannot exhaust server memory.
  if (N < 1024 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  // scrypt needs ~128 * N * r bytes; reject anything above our fixed budget.
  if (128 * N * r > MAX_MEM) return false;
  if (password.length > PASSWORD_MAX_LENGTH) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    // Malformed salt/hash lengths or OpenSSL rejections must not surface.
    return false;
  }
}

/** Rejects passwords that are only whitespace or a trivially repeated character. */
export function isAcceptablePassword(password: string): boolean {
  const value = typeof password === "string" ? password.normalize("NFKC") : "";
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false;
  if (value.trim().length !== value.length) return false;
  const unique = new Set(value).size;
  return unique >= 5;
}
