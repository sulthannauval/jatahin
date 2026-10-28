import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

// Where requireSession() sends a session that was ended elsewhere: drop the cookie, then sign in again.
export async function GET(request: NextRequest) {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login?expired=1", request.url));
}
