// Recovery when the password (or email) is forgotten: sets a new one straight in the database
// (DATABASE_URL, or local PGlite when unset), ends every session and clears the sign-in lockout.
// Usage: npm run reset-password
import { createInterface } from "node:readline";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import type { DB } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { getAccount, setEmail, setPasswordHash } from "../src/lib/auth/account";

config({ path: ".env.local", quiet: true });

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}

async function connect(): Promise<{ db: DB; close: () => Promise<void>; where: string }> {
  const raw = process.env.DATABASE_URL;
  const pgliteDir = raw?.startsWith("pglite:") ? raw.slice(7) : raw ? null : "./.data/pglite";
  if (!pgliteDir) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(raw!, { prepare: false, max: 1 });
    return { db: drizzle(client, { schema }), close: () => client.end(), where: "DATABASE_URL" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(pgliteDir);
  return { db: drizzle(client, { schema }) as unknown as DB, close: () => client.close(), where: pgliteDir };
}

const conn = await connect();
try {
  const acc = await getAccount(conn.db);
  if (!acc) {
    console.error("Akun belum dibuat di database ini. Buat akun melalui halaman /daftar terlebih dahulu.");
    process.exit(1);
  }
  console.log(`Database: ${conn.where}\nEmail login saat ini: ${acc.email}\n`);
  const email = (await ask("Email baru (kosongkan bila tidak diubah): ")).trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Format email tidak valid."); process.exit(1); }
  const pw = await ask("Password baru: ", true);
  if (pw.length < 12) { console.error("Password minimal 12 karakter."); process.exit(1); }
  if (pw !== (await ask("Ulangi password baru: ", true))) { console.error("Ulangan password tidak sama."); process.exit(1); }

  if (email) await setEmail(conn.db, email);
  await setPasswordHash(conn.db, await hashPassword(pw));
  await conn.db.delete(schema.loginAttempts).where(sql`true`);
  console.log(`\n✓ Password diperbarui${email ? ` dan email diganti menjadi ${email}` : ""}. Semua sesi telah diakhiri.`);
} finally {
  await conn.close();
}
