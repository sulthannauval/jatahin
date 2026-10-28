import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __mfDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  // "pglite:<dir>" (or no URL in dev) = embedded local Postgres, for running on your own machine.
  const pgliteDir = url?.startsWith("pglite:") ? url.slice(7) : !url && process.env.NODE_ENV !== "production" ? "./.data/pglite" : null;
  if (url && !pgliteDir) {
    // prepare:false keeps it compatible with transaction-mode poolers (Neon, Supabase).
    const client = postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
    return drizzle(client, { schema });
  }
  if (!pgliteDir) throw new Error("DATABASE_URL is not set");
  // Embedded Postgres (PGlite) stored on disk. Migrations run via `npm run db:migrate`.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const client = new PGlite(pgliteDir);
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  g.__mfDb ??= create();
  return g.__mfDb;
}
