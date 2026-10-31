import { sql } from "drizzle-orm";
import type { DB } from "../db";
import { budgets, categories, potAdjustments, pots, savingPlans, settings, transactions, transfers } from "../db/schema";
import { splitLegacy, splitLegacyBudgets } from "../legacy";
import type { ImportData, ImportTx } from "./parse";

export type ImportResult = { categories: number; pots: number; transactions: number; transfers: number; budgets: number };

/**
 * Writes parsed spreadsheet data. The sheet's savings deposits and withdrawals become moves between kantong.
 * With replace=false it refuses to touch a database that already has data.
 */
export async function applyImport(db: DB, data: ImportData, replace: boolean): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions);
    if (n > 0 && !replace) throw new Error("Database sudah berisi data. Centang 'Hapus semua data lama' untuk menggantinya.");

    await tx.delete(potAdjustments);
    await tx.delete(transactions);
    await tx.delete(transfers);
    await tx.delete(budgets);
    await tx.delete(savingPlans);
    await tx.delete(pots);
    await tx.delete(categories);
    await tx.delete(settings);

    const role = new Map(data.categories.map((c) => [`${c.kind}:${c.name}`, c.role]));
    const moved = splitLegacy<string, ImportTx & { potId: string | null }>(data.transactions.map((t) => ({ ...t, potId: t.pot })), (t) => role.get(`${t.kind}:${t.category}`) ?? null);
    const plan = splitLegacyBudgets(data.budgets, (b) => role.get(`expense:${b.category}`) === "saving_deposit");
    // Savings categories are only kept if a savings entry without a kantong still uses them.
    const used = new Set(moved.kept.map((t) => `${t.kind}:${t.category}`));
    const cats = data.categories.filter((c) => !c.role || used.has(`${c.kind}:${c.name}`));

    const catRows = await tx
      .insert(categories)
      .values(cats.map((c, i) => ({ name: c.name, kind: c.kind, group: c.group, sortOrder: i })))
      .returning({ id: categories.id, name: categories.name, kind: categories.kind });
    const catId = new Map(catRows.map((c) => [`${c.kind}:${c.name}`, c.id]));

    const potRows = data.pots.length
      ? await tx.insert(pots).values(data.pots.map((p, i) => ({ ...p, sortOrder: i }))).returning({ id: pots.id, name: pots.name })
      : [];
    const potId = new Map(potRows.map((p) => [p.name, p.id]));

    await tx.insert(settings).values({ id: 1, ...data.settings });

    if (plan.plans.length) await tx.insert(savingPlans).values(plan.plans.map((b) => ({ month: b.month + "-01", amount: b.amount })));
    if (plan.kept.length) {
      await tx.insert(budgets).values(
        plan.kept.map((b) => ({ month: b.month + "-01", categoryId: catId.get(`expense:${b.category}`)!, amount: b.amount })),
      );
    }

    const rows = moved.kept.map((t) => ({
      date: t.date,
      categoryId: catId.get(`${t.kind}:${t.category}`)!,
      potId: t.pot ? potId.get(t.pot) ?? null : null,
      description: t.description,
      amount: t.amount,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(transactions).values(rows.slice(i, i + 500));
    const moves = moved.transfers.map((t) => ({
      date: t.source.date,
      fromPotId: t.fromPotId === null ? null : potId.get(t.fromPotId)!,
      toPotId: t.toPotId === null ? null : potId.get(t.toPotId)!,
      amount: t.source.amount,
      note: t.source.description,
    }));
    for (let i = 0; i < moves.length; i += 500) await tx.insert(transfers).values(moves.slice(i, i + 500));

    return { categories: catRows.length, pots: potRows.length, transactions: rows.length, transfers: moves.length, budgets: plan.kept.length };
  });
}
