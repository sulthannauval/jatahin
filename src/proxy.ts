import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken, renewSessionToken, sessionCookieOptions } from "@/lib/auth/session";

// Pages reachable without a session: recovery and email links must work signed out.
// The cron route checks its own secret instead.
const PUBLIC = new Set(["/auth/expired", "/daftar/buat-password", "/lupa-password", "/reset-password", "/verifikasi-email", "/api/cron/backup"]);

// Fast redirect for signed-out visitors. Real checks also happen in every page/action (lib/auth/dal.ts).
export async function proxy(request: NextRequest) {
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const ok = session !== null;
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname === "/daftar") {
    return ok ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (PUBLIC.has(pathname)) return NextResponse.next();
  if (!ok) {
    const url = new URL("/login", request.url);
    if (pathname !== "/" || search) url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // Using the app keeps the session alive: push the idle expiry forward (at most once a day).
  const res = NextResponse.next();
  const renewed = await renewSessionToken(session);
  if (renewed) res.cookies.set(SESSION_COOKIE, renewed.token, { ...sessionCookieOptions, maxAge: renewed.maxAge });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)"],
};
