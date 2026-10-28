// The single account's data access. No Next.js imports, so it runs in server actions, scripts and tests alike.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DB } from "../db";
import { account, loginAttempts } from "../db/schema";

export type Account = typeof account.$inferSelect;

export async function getAccount(db: DB): Promise<Account | null> {
  const [row] = await db.select().from(account).where(eq(account.id, 1));
  return row ?? null;
}

/** Creates the one account. False when it already exists. */
export async function createAccount(db: DB, email: string, passwordHash: string): Promise<boolean> {
  const rows = await db.insert(account).values({ id: 1, email: email.trim().toLowerCase(), passwordHash }).onConflictDoNothing().returning({ id: account.id });
  return rows.length > 0;
}

export async function recordLogin(db: DB, ip: string): Promise<void> {
  await db.update(account).set({ lastLoginAt: sql`now()`, lastLoginIp: ip }).where(eq(account.id, 1));
}

/** Store a new password hash and end every existing session. Returns the new session version. */
export async function setPasswordHash(db: DB, passwordHash: string): Promise<number> {
  const [row] = await db
    .update(account)
    .set({ passwordHash, passwordChangedAt: sql`now()`, sessionVersion: sql`${account.sessionVersion} + 1` })
    .where(eq(account.id, 1))
    .returning({ v: account.sessionVersion });
  if (!row) throw new Error("Akun belum dibuat.");
  return row.v;
}

export async function setEmail(db: DB, email: string): Promise<void> {
  await db.update(account).set({ email: email.trim().toLowerCase() }).where(eq(account.id, 1));
}

/** End every session, including the current one. Returns the new session version. */
export async function bumpSessionVersion(db: DB): Promise<number> {
  const [row] = await db
    .update(account)
    .set({ sessionVersion: sql`${account.sessionVersion} + 1` })
    .where(eq(account.id, 1))
    .returning({ v: account.sessionVersion });
  if (!row) throw new Error("Akun belum dibuat.");
  return row.v;
}

// ── Failed attempts (sign-in and password checks share one limit) ──

export const LOCK_MINUTES = 15;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 30;

export async function isLockedOut(db: DB, ip: string): Promise<boolean> {
  const since = sql`now() - make_interval(mins => ${LOCK_MINUTES})`;
  const [[mine], [all]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.createdAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(gte(loginAttempts.createdAt, since)),
  ]);
  return mine.n >= MAX_PER_IP || all.n >= MAX_GLOBAL;
}

export async function recordFailure(db: DB, ip: string): Promise<void> {
  await db.insert(loginAttempts).values({ ip });
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '1 day'`));
}

/** Clears failures for one IP, or all of them (after a password reset). */
export async function clearFailures(db: DB, ip?: string): Promise<void> {
  await db.delete(loginAttempts).where(ip ? eq(loginAttempts.ip, ip) : sql`true`);
}

export async function failuresLastDay(db: DB): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(gte(loginAttempts.createdAt, sql`now() - interval '1 day'`));
  return row.n;
}
