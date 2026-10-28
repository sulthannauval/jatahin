// One-time email links. No Next.js imports (used by tests too).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { authTokens } from "../db/schema";

export type TokenPurpose = (typeof authTokens.$inferSelect)["purpose"];

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const live = (purpose: TokenPurpose) => and(eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, sql`now()`));

/** A fresh link token for `email`. Earlier unused links for the same purpose stop working. */
export async function issueToken(db: DB, purpose: TokenPurpose, email: string, ttlMinutes: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.update(authTokens).set({ usedAt: sql`now()` }).where(live(purpose));
  await db.insert(authTokens).values({
    purpose,
    tokenHash: hash(raw),
    email,
    expiresAt: sql`now() + make_interval(mins => ${ttlMinutes})`,
  });
  return raw;
}

/** The email a still-valid link was sent to, without using it up. */
export async function peekToken(db: DB, purpose: TokenPurpose, raw: string): Promise<string | null> {
  if (!raw) return null;
  const [row] = await db.select({ email: authTokens.email }).from(authTokens).where(and(live(purpose), eq(authTokens.tokenHash, hash(raw))));
  return row?.email ?? null;
}

/** Uses the link up (once only) and returns its email, or null when invalid, used or expired. */
export async function consumeToken(db: DB, purpose: TokenPurpose, raw: string): Promise<string | null> {
  if (!raw) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: sql`now()` })
    .where(and(live(purpose), eq(authTokens.tokenHash, hash(raw))))
    .returning({ email: authTokens.email });
  return row?.email ?? null;
}

/** Links of this purpose issued in the last `minutes` (to stop email floods). */
export async function recentTokens(db: DB, purpose: TokenPurpose, minutes: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(and(eq(authTokens.purpose, purpose), gte(authTokens.createdAt, sql`now() - make_interval(mins => ${minutes})`)));
  return row.n;
}

/** The address waiting for confirmation, if an email change is in progress. */
export async function pendingEmailChange(db: DB): Promise<string | null> {
  const [row] = await db.select({ email: authTokens.email }).from(authTokens).where(live("email_change")).orderBy(desc(authTokens.createdAt)).limit(1);
  return row?.email ?? null;
}

export async function cancelTokens(db: DB, purpose: TokenPurpose): Promise<void> {
  await db.update(authTokens).set({ usedAt: sql`now()` }).where(live(purpose));
}
