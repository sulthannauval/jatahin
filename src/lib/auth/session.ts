import { SignJWT, jwtVerify } from "jose";

// Shared by proxy.ts and server code. No Node-only imports here.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mf_session" : "mf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** `version` is the account's session version; raising it in the database ends older sessions. */
export async function createSessionToken(version: number): Promise<string> {
  return new SignJWT({ sv: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** The session version inside a valid token, or null. Only checks the signature and expiry, not the database. */
export async function verifySessionToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub === "owner" && typeof payload.sv === "number" ? payload.sv : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
