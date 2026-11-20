import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, clearedSessionCookie } from "@/lib/auth/session";

// Where requireSession() sends a session that was ended elsewhere: drop the cookie, then sign in again.
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?expired=1", request.url));
  res.cookies.set(SESSION_COOKIE, "", clearedSessionCookie);
  return res;
}
