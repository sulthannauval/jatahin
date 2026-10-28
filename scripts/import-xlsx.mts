// Import a MoneyFlows .xlsx into the database (DATABASE_URL, or local PGlite when unset).
// Usage: npm run import -- path/to/MoneyFlows.xlsx [--replace]
import { config } from "dotenv";
import readExcelFile from "read-excel-file/node";
import { parseWorkbook, type Sheet } from "../src/lib/import/parse";
import { applyImport } from "../src/lib/import/apply";
import type { DB } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";

config({ path: ".env.local", quiet: true });

const file = process.argv[2];
const replace = process.argv.includes("--replace");
if (!file) {
  console.error("Usage: npm run import -- path/to/MoneyFlows.xlsx [--replace]");
  process.exit(1);
}

async function connect(): Promise<{ db: DB; close: () => Promise<void> }> {
  const raw = process.env.DATABASE_URL;
  const pgliteDir = raw?.startsWith("pglite:") ? raw.slice(7) : raw ? null : "./.data/pglite";
  const url = pgliteDir ? null : raw;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { prepare: false, max: 1 });
    return { db: drizzle(client, { schema }), close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(pgliteDir!);
  return { db: drizzle(client, { schema }) as unknown as DB, close: () => client.close() };
}

const data = parseWorkbook((await readExcelFile(file)) as Sheet[]);
const conn = await connect();
try {
  const res = await applyImport(conn.db, data, replace);
  console.log(`✓ ${res.transactions} transaksi, ${res.categories} kategori, ${res.pots} pos, ${res.budgets} budget`);
  for (const w of data.warnings) console.log("  ! " + w);
} finally {
  await conn.close();
}
