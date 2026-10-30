import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "../db";
import { getAccount, type Account } from "./account";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, verifySessionToken } from "./session";

/** The account row (null before setup). Always read at request time, cached per request. */
export const loadAccount = cache(async (): Promise<Account | null> => {
  await connection();
  return getAccount(await getDb());
});

/** Signs this browser in with the account's current session version. */
export async function startSession(version: number): Promise<void> {
  const { token, maxAge } = await createSessionToken(version);
  (await cookies()).set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge });
}

/**
 * Call at the top of every page and server action that touches data. A token from before a password change or
 * "sign out everywhere" no longer matches the account's session version and is sent to sign in again.
 */
export const requireSession = cache(async (): Promise<Account> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const version = await verifySessionToken(token);
  if (version === null) redirect("/login");
  const acc = await loadAccount();
  // Pages can't delete cookies, so a route handler clears the stale one.
  if (!acc || acc.sessionVersion !== version) redirect("/auth/expired");
  return acc;
});

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
