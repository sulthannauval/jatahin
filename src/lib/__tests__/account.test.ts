import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { DB } from "../db";
import {
  bumpSessionVersion, clearFailures, createAccount, failuresLastDay, getAccount, isLockedOut, recordFailure, setEmail, setPasswordHash,
} from "../auth/account";
import { cancelTokens, consumeToken, issueToken, peekToken, pendingEmailChange, recentTokens } from "../auth/tokens";
import { normalizeEmail, passwordProblem } from "../auth/policy";
import { SignJWT } from "jose";
import { createSessionToken, readSessionToken, renewSessionToken, verifySessionToken } from "../auth/session";

async function freshDb(): Promise<DB> {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return drizzle(client, { schema }) as unknown as DB;
}

describe("account", () => {
  it("can be created only once", async () => {
    const db = await freshDb();
    expect(await getAccount(db)).toBeNull();
    expect(await createAccount(db, " Me@Example.com ", "scrypt:old")).toBe(true);
    expect(await createAccount(db, "other@example.com", "scrypt:x")).toBe(false);
    expect(await getAccount(db)).toMatchObject({ email: "me@example.com", passwordHash: "scrypt:old", sessionVersion: 1 });
    await setEmail(db, "New@Example.com");
    expect((await getAccount(db))!.email).toBe("new@example.com");
  });

  it("raises the session version on password change and sign-out everywhere", async () => {
    const db = await freshDb();
    await createAccount(db, "me@example.com", "scrypt:old");
    const before = (await getAccount(db))!.passwordChangedAt;
    expect(await setPasswordHash(db, "scrypt:new")).toBe(2);
    const acc = (await getAccount(db))!;
    expect(acc.passwordHash).toBe("scrypt:new");
    expect(acc.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(await bumpSessionVersion(db)).toBe(3);
  });

  it("locks an IP after 5 failures and unlocks on clear", async () => {
    const db = await freshDb();
    for (let i = 0; i < 4; i++) await recordFailure(db, "1.1.1.1");
    expect(await isLockedOut(db, "1.1.1.1")).toBe(false);
    await recordFailure(db, "1.1.1.1");
    expect(await isLockedOut(db, "1.1.1.1")).toBe(true);
    expect(await isLockedOut(db, "2.2.2.2")).toBe(false);
    expect(await failuresLastDay(db)).toBe(5);
    await clearFailures(db, "1.1.1.1");
    expect(await isLockedOut(db, "1.1.1.1")).toBe(false);
  });
});

describe("email links", () => {
  it("work once, expire, and are replaced by newer links", async () => {
    const db = await freshDb();
    const first = await issueToken(db, "reset", "me@example.com", 30);
    const second = await issueToken(db, "reset", "me@example.com", 30);
    expect(await peekToken(db, "reset", first)).toBeNull();
    expect(await peekToken(db, "reset", second)).toBe("me@example.com");
    expect(await consumeToken(db, "setup", second)).toBeNull(); // wrong purpose
    expect(await consumeToken(db, "reset", second)).toBe("me@example.com");
    expect(await consumeToken(db, "reset", second)).toBeNull(); // used
    const expired = await issueToken(db, "reset", "me@example.com", -1);
    expect(await consumeToken(db, "reset", expired)).toBeNull();
    expect(await recentTokens(db, "reset", 15)).toBe(3);
  });

  it("tracks a pending email change until it is cancelled", async () => {
    const db = await freshDb();
    expect(await pendingEmailChange(db)).toBeNull();
    await issueToken(db, "email_change", "new@example.com", 60);
    expect(await pendingEmailChange(db)).toBe("new@example.com");
    await cancelTokens(db, "email_change");
    expect(await pendingEmailChange(db)).toBeNull();
  });
});

describe("password and email rules", () => {
  it("checks length and repeat, normalizes email", () => {
    expect(passwordProblem("short", "short")).toMatch(/minimal 12/);
    expect(passwordProblem("long-enough-pass", "different-pass!")).toMatch(/tidak sama/);
    expect(passwordProblem("long-enough-pass", "long-enough-pass")).toBeNull();
    expect(normalizeEmail(" Me@Example.COM ")).toBe("me@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
});

describe("session token", () => {
  process.env.SESSION_SECRET ??= "x".repeat(40);
  const DAY = 60 * 60 * 24;
  const t0 = 1_800_000_000; // a fixed "now" in seconds

  it("carries the session version", async () => {
    expect(await verifySessionToken((await createSessionToken(7)).token)).toBe(7);
    expect(await verifySessionToken("nope")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("ends after 7 days without use", async () => {
    const { token, maxAge } = await createSessionToken(1, undefined, t0);
    expect(maxAge).toBe(7 * DAY);
    expect(await readSessionToken(token, t0 + 7 * DAY - 1)).toMatchObject({ version: 1, signedInAt: t0 });
    expect(await readSessionToken(token, t0 + 7 * DAY)).toBeNull();
  });

  it("is renewed at most once a day while in use, keeping the sign-in time", async () => {
    const first = await createSessionToken(1, undefined, t0);
    const s1 = (await readSessionToken(first.token, t0 + DAY - 1))!;
    expect(await renewSessionToken(s1, t0 + DAY - 1)).toBeNull();

    const renewed = (await renewSessionToken(s1, t0 + 6 * DAY))!;
    expect(renewed.maxAge).toBe(7 * DAY);
    // Still valid 12 days after sign-in, past the first token's expiry.
    expect(await readSessionToken(renewed.token, t0 + 12 * DAY)).toMatchObject({ version: 1, signedInAt: t0 });
  });

  it("never lasts past 90 days from sign-in, however often it is renewed", async () => {
    let { token } = await createSessionToken(1, undefined, t0);
    for (let day = 6; day < 90; day += 6) {
      const s = (await readSessionToken(token, t0 + day * DAY))!;
      expect(s).not.toBeNull();
      token = (await renewSessionToken(s, t0 + day * DAY))?.token ?? token;
    }
    const last = (await readSessionToken(token, t0 + 89 * DAY))!;
    expect(last.expiresAt).toBe(t0 + 90 * DAY);
    expect(await renewSessionToken(last, t0 + 89 * DAY)).toBeNull();
    expect(await readSessionToken(token, t0 + 90 * DAY)).toBeNull();
  });

  it("accepts tokens from before sliding sessions, counting from their issue time", async () => {
    const old = await new SignJWT({ sv: 3 }).setProtectedHeader({ alg: "HS256" }).setSubject("owner")
      .setIssuedAt(t0).setExpirationTime(t0 + 30 * DAY).sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const s = (await readSessionToken(old, t0 + 2 * DAY))!;
    expect(s).toMatchObject({ version: 3, signedInAt: t0 });
    const renewed = (await renewSessionToken(s, t0 + 2 * DAY))!;
    expect(await readSessionToken(renewed.token, t0 + 8 * DAY)).toMatchObject({ version: 3, signedInAt: t0 });
  });
});
