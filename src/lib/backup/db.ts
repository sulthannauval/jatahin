import { asc, sql } from "drizzle-orm";
import type { DB } from "../db";
import { billPayments, bills, budgets, categories, potAdjustments, pots, savingPlans, settings, transactions, transfers } from "../db/schema";
import type { BackupData } from "./format";

/** Reads every finance table. The account, sign-in attempts and email links are left out on purpose. */
export async function readBackup(db: DB): Promise<BackupData> {
  const [cats, potRows, txs, moved, adjs, buds, plans, [cfg], billRows, pays] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(pots).orderBy(asc(pots.id)),
    db.select().from(transactions).orderBy(asc(transactions.date), asc(transactions.id)),
    db.select().from(transfers).orderBy(asc(transfers.date), asc(transfers.id)),
    db.select().from(potAdjustments).orderBy(asc(potAdjustments.date), asc(potAdjustments.id)),
    db.select().from(budgets).orderBy(asc(budgets.month), asc(budgets.categoryId)),
    db.select().from(savingPlans).orderBy(asc(savingPlans.month)),
    db.select().from(settings).limit(1),
    db.select().from(bills).orderBy(asc(bills.id)),
    db.select().from(billPayments).orderBy(asc(billPayments.billId), asc(billPayments.month)),
  ]);
  return {
    categories: cats,
    pots: potRows,
    transactions: txs,
    transfers: moved,
    adjustments: adjs,
    budgets: buds.map((b) => ({ ...b, month: b.month.slice(0, 7) })),
    savingPlans: plans.map((b) => ({ ...b, month: b.month.slice(0, 7) })),
    bills: billRows,
    billPayments: pays.map((p) => ({ billId: p.billId, month: p.month.slice(0, 7), transactionId: p.transactionId, createdAt: p.createdAt })),
    settings: {
      carryStartMonth: cfg?.carryStartMonth ?? null, carryStartBalance: cfg?.carryStartBalance ?? 0,
      paydayDay: cfg?.paydayDay ?? null, salaryCategoryId: cfg?.salaryCategoryId ?? null,
    },
  };
}

export type RestoreResult = { categories: number; pots: number; transactions: number; transfers: number; adjustments: number; budgets: number; bills: number };

/**
 * Replaces all finance data with the backup, keeping its IDs. Runs in one database transaction, so a failure
 * leaves the old data untouched. With replace=false it refuses to touch a database that already has transactions.
 */
export async function restoreBackup(db: DB, d: BackupData, replace: boolean): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions);
    if (n > 0 && !replace) throw new Error("Database sudah berisi data. Centang 'Hapus semua data lama' untuk menggantinya.");

    // Tagihan point at categories and transactions, so they go first.
    await tx.delete(billPayments);
    await tx.delete(bills);
    await tx.delete(potAdjustments);
    await tx.delete(transactions);
    await tx.delete(transfers);
    await tx.delete(budgets);
    await tx.delete(savingPlans);
    await tx.delete(pots);
    await tx.delete(categories);
    await tx.delete(settings);

    const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) => rows.slice(i * 500, i * 500 + 500));
    if (d.categories.length) await tx.insert(categories).values(d.categories);
    if (d.pots.length) await tx.insert(pots).values(d.pots);
    for (const rows of chunks(d.transactions)) await tx.insert(transactions).values(rows);
    for (const rows of chunks(d.transfers)) await tx.insert(transfers).values(rows);
    for (const rows of chunks(d.adjustments)) await tx.insert(potAdjustments).values(rows);
    for (const rows of chunks(d.budgets)) await tx.insert(budgets).values(rows.map((b) => ({ ...b, month: b.month + "-01" })));
    if (d.savingPlans.length) await tx.insert(savingPlans).values(d.savingPlans.map((b) => ({ ...b, month: b.month + "-01" })));
    if (d.bills.length) await tx.insert(bills).values(d.bills);
    for (const rows of chunks(d.billPayments)) await tx.insert(billPayments).values(rows.map((p) => ({ ...p, month: p.month + "-01" })));
    await tx.insert(settings).values({ id: 1, ...d.settings });

    // Rows came in with their own IDs, so move each sequence past the highest one.
    for (const table of ["categories", "pots", "transactions", "transfers", "pot_adjustments", "bills"]) {
      await tx.execute(
        sql.raw(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`),
      );
    }

    return {
      categories: d.categories.length, pots: d.pots.length, transactions: d.transactions.length, transfers: d.transfers.length,
      adjustments: d.adjustments.length, budgets: d.budgets.length, bills: d.bills.length,
    };
  });
}
