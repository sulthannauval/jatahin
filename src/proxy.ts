import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Fast redirect for signed-out visitors. Real checks also happen in every page/action (lib/auth/dal.ts).
export async function proxy(request: NextRequest) {
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") {
    return ok ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!ok) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)"],
};
