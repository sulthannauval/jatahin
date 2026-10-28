// Applies SQL migrations in ./drizzle. Uses DATABASE_URL, or local PGlite when unset.
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });

const raw = process.env.DATABASE_URL;
const pgliteDir = raw?.startsWith("pglite:") ? raw.slice(7) : raw ? null : (process.env.PGLITE_DIR ?? "./.data/pglite");
const url = pgliteDir ? null : raw;
const folder = "./drizzle";

if (url) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { prepare: false, max: 1 });
  await migrate(drizzle(client), { migrationsFolder: folder });
  await client.end();
  console.log("✓ migrations applied (postgres)");
} else {
  if (process.env.VERCEL && !raw) {
    console.error("DATABASE_URL is not set on Vercel. Add a Postgres database first.");
    process.exit(1);
  }
  const { mkdirSync } = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  mkdirSync(".data", { recursive: true });
  const client = new PGlite(pgliteDir);
  await migrate(drizzle(client), { migrationsFolder: folder });
  await client.close();
  console.log("✓ migrations applied (local pglite)");
}
