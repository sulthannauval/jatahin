import { SignJWT, jwtVerify } from "jose";

// Shared by proxy.ts and server code. No Node-only imports here.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mf_session" : "mf_session";

// A session ends after 7 days without opening the app, and 90 days after signing in no matter what.
// While the app is in use the proxy renews the token, at most once a day.
export const SESSION_IDLE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_MAX_SECONDS = 60 * 60 * 24 * 90;
const RENEW_AFTER_SECONDS = 60 * 60 * 24;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** `version`: the account's session version (raising it ends older sessions). `signedInAt`: when the password was entered. */
export type SessionClaims = { version: number; signedInAt: number; issuedAt: number; expiresAt: number };

/** A token valid for the idle period, but never past `signedInAt` + the maximum. */
export async function createSessionToken(version: number, signedInAt?: number, now = nowSeconds()): Promise<{ token: string; maxAge: number }> {
  const at = signedInAt ?? now;
  const exp = Math.min(now + SESSION_IDLE_SECONDS, at + SESSION_MAX_SECONDS);
  const token = await new SignJWT({ sv: version, at })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());
  return { token, maxAge: exp - now };
}

/** The claims of a valid token, or null. Only checks the signature and expiry, not the database. */
export async function readSessionToken(token: string | undefined, now = nowSeconds()): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], currentDate: new Date(now * 1000) });
    if (p.sub !== "owner" || typeof p.sv !== "number" || typeof p.iat !== "number" || typeof p.exp !== "number") return null;
    // Tokens from before sliding sessions carry no sign-in time; their issue time is the closest thing.
    const signedInAt = typeof p.at === "number" ? p.at : p.iat;
    return { version: p.sv, signedInAt, issuedAt: p.iat, expiresAt: p.exp };
  } catch {
    return null;
  }
}

/** The session version inside a valid token, or null. */
export async function verifySessionToken(token: string | undefined): Promise<number | null> {
  return (await readSessionToken(token))?.version ?? null;
}

/** A fresh token for a session in use, or null when the current one is recent enough (or can't be extended). */
export async function renewSessionToken(s: SessionClaims, now = nowSeconds()): Promise<{ token: string; maxAge: number } | null> {
  if (now - s.issuedAt < RENEW_AFTER_SECONDS) return null;
  if (s.expiresAt >= s.signedInAt + SESSION_MAX_SECONDS) return null;
  return createSessionToken(s.version, s.signedInAt, now);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
