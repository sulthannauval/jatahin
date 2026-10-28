"use server";

import { timingSafeEqual } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

const WINDOW_MIN = 15;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 30;

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function login(_: { error?: string; email?: string } | null, fd: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const expectedEmail = (process.env.APP_USER_EMAIL ?? "").trim().toLowerCase();
  const hash = process.env.APP_PASSWORD_HASH ?? "";
  if (!expectedEmail || !hash || !process.env.SESSION_SECRET) {
    return { error: "Server belum dikonfigurasi (APP_USER_EMAIL / APP_PASSWORD_HASH / SESSION_SECRET)." };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  const db = await getDb();
  const since = sql`now() - make_interval(mins => ${WINDOW_MIN})`;
  const [[mine], [all]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.createdAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(gte(loginAttempts.createdAt, since)),
  ]);
  if (mine.n >= MAX_PER_IP || all.n >= MAX_GLOBAL) {
    return { error: `Terlalu banyak percobaan gagal. Coba lagi ${WINDOW_MIN} menit lagi.`, email };
  }

  // Always run the hash check so timing doesn't reveal whether the email was right.
  const passOk = await verifyPassword(password, hash);
  const ok = safeEqual(email, expectedEmail) && passOk;
  if (!ok) {
    await db.insert(loginAttempts).values({ ip });
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '1 day'`));
    return { error: "Email atau password salah.", email };
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  redirect(safeNext(fd.get("next")));
}
