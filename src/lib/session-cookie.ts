/**
 * Oturum çerezi sözleşmesi.
 *
 * Bu modül bilinçli olarak `next/*`, `node:*` ve `server-only` içermiyor:
 * hem route handler'lar hem de `src/proxy.ts` aynı saf fonksiyonları kullanır.
 */

export const DEFAULT_SESSION_COOKIE_NAME = "shivass_session";

/** Env değişkeni geçersiz/eksikse varsayılan ada düşer. */
export function resolveCookieName(envName: string | undefined): string {
  return envName && /^[a-zA-Z0-9_-]+$/.test(envName) ? envName : DEFAULT_SESSION_COOKIE_NAME;
}

export type CookieFlags = {
  secure: boolean;
  path: string;
  sameSite: "lax";
};

export function defaultCookieFlags(secure: boolean): CookieFlags {
  return { secure, path: "/", sameSite: "lax" };
}

/** Cookie security follows the canonical deployment URL, not NODE_ENV. */
export function cookieFlagsForSite(siteUrl: string): CookieFlags {
  try {
    return defaultCookieFlags(new URL(siteUrl).protocol === "https:");
  } catch {
    // public-env validates this first; fail secure if called independently.
    return defaultCookieFlags(true);
  }
}

/** `Set-Cookie` değeri üretir (route handler'lar için). */
export function buildSessionCookie(
  name: string,
  token: string,
  expiresAt: Date,
  flags: CookieFlags,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [
    `${name}=${encodeURIComponent(token)}`,
    `Path=${flags.path}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    flags.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Oturumu kapatmak için aynı bayraklarla temizleme değeri üretir. */
export function buildClearCookie(name: string, flags: CookieFlags): string {
  return [`${name}=`, `Path=${flags.path}`, "Max-Age=0", "HttpOnly", "SameSite=Lax", flags.secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}

/** Ham `Cookie` başlığını çözümleyerek tek çerezin değerini döndürür. */
export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  // Sadece ilk 8 KB başlığı tarar; devasa başlıkla CPU tüketilemez.
  const source = cookieHeader.length > 8192 ? cookieHeader.slice(0, 8192) : cookieHeader;
  for (const part of source.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Güvenli yönlendirme hedefi: yalnızca aynı origin için göreli yol. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  // "//evil.com" ve "https://evil.com" gibi hedefleri reddet.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return fallback;
  return value;
}
