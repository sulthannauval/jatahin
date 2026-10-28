import { asc, sql } from "drizzle-orm";
import type { DB } from "../db";
import { budgets, categories, potAdjustments, pots, settings, transactions } from "../db/schema";
import type { BackupData } from "./format";

/** Reads every finance table. The account, sign-in attempts and email links are left out on purpose. */
export async function readBackup(db: DB): Promise<BackupData> {
  const [cats, potRows, txs, adjs, buds, [cfg]] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(pots).orderBy(asc(pots.id)),
    db.select().from(transactions).orderBy(asc(transactions.date), asc(transactions.id)),
    db.select().from(potAdjustments).orderBy(asc(potAdjustments.date), asc(potAdjustments.id)),
    db.select().from(budgets).orderBy(asc(budgets.month), asc(budgets.categoryId)),
    db.select().from(settings).limit(1),
  ]);
  return {
    categories: cats,
    pots: potRows,
    transactions: txs,
    adjustments: adjs,
    budgets: buds.map((b) => ({ ...b, month: b.month.slice(0, 7) })),
    settings: { carryStartMonth: cfg?.carryStartMonth ?? null, carryStartBalance: cfg?.carryStartBalance ?? 0 },
  };
}

export type RestoreResult = { categories: number; pots: number; transactions: number; adjustments: number; budgets: number };

/**
 * Replaces all finance data with the backup, keeping its IDs. Runs in one database transaction, so a failure
 * leaves the old data untouched. With replace=false it refuses to touch a database that already has transactions.
 */
export async function restoreBackup(db: DB, d: BackupData, replace: boolean): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions);
    if (n > 0 && !replace) throw new Error("Database sudah berisi data. Centang 'Hapus semua data lama' untuk menggantinya.");

    await tx.delete(potAdjustments);
    await tx.delete(transactions);
    await tx.delete(budgets);
    await tx.delete(pots);
    await tx.delete(categories);
    await tx.delete(settings);

    const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) => rows.slice(i * 500, i * 500 + 500));
    if (d.categories.length) await tx.insert(categories).values(d.categories);
    if (d.pots.length) await tx.insert(pots).values(d.pots);
    for (const rows of chunks(d.transactions)) await tx.insert(transactions).values(rows);
    for (const rows of chunks(d.adjustments)) await tx.insert(potAdjustments).values(rows);
    for (const rows of chunks(d.budgets)) await tx.insert(budgets).values(rows.map((b) => ({ ...b, month: b.month + "-01" })));
    await tx.insert(settings).values({ id: 1, ...d.settings });

    // Rows came in with their own IDs, so move each sequence past the highest one.
    for (const table of ["categories", "pots", "transactions", "pot_adjustments"]) {
      await tx.execute(
        sql.raw(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`),
      );
    }

    return {
      categories: d.categories.length, pots: d.pots.length, transactions: d.transactions.length,
      adjustments: d.adjustments.length, budgets: d.budgets.length,
    };
  });
}
