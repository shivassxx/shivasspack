import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_SESSION_COOKIE_NAME, readCookieValue, safeNextPath } from "@/lib/session-cookie";

/**
 * İnce kademeli koruma: yalnızca çerez **varlığını** kontrol eder.
 * Gerçek oturum/izin doğrulaması ilgili route'un layout'u ve servis katmanında
 * yapılır; proxy DB'ye erişmez.
 */
const PROTECTED_PREFIXES = ["/settings", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Next may normalize nextUrl's hostname; browsers send the actual Host.
    const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin !== null && origin !== requestOrigin)) {
      return NextResponse.json(
        { error: { code: "forbidden_origin", message: "Geçersiz istek kaynağı." } },
        { status: 403 },
      );
    }
  }
  const cookieName = process.env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
  const token = readCookieValue(request.headers.get("cookie"), cookieName);

  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (!token) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", safeNextPath(pathname + request.nextUrl.search));
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/settings/:path*", "/admin/:path*"],
};
