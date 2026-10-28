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
import { createSessionToken, verifySessionToken } from "../auth/session";

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
  it("carries the session version", async () => {
    process.env.SESSION_SECRET ??= "x".repeat(40);
    expect(await verifySessionToken(await createSessionToken(7))).toBe(7);
    expect(await verifySessionToken("nope")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });
});
