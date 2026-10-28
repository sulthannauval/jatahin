import { sql } from "drizzle-orm";
import type { DB } from "../db";
import { budgets, categories, pots, settings, transactions } from "../db/schema";
import type { ImportData } from "./parse";

export type ImportResult = { categories: number; pots: number; transactions: number; budgets: number };

/** Writes parsed spreadsheet data. With replace=false it refuses to touch a database that already has data. */
export async function applyImport(db: DB, data: ImportData, replace: boolean): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions);
    if (n > 0 && !replace) throw new Error("Database sudah berisi data. Centang 'Hapus semua data lama' untuk menggantinya.");

    await tx.delete(transactions);
    await tx.delete(budgets);
    await tx.delete(pots);
    await tx.delete(categories);
    await tx.delete(settings);

    const catRows = await tx
      .insert(categories)
      .values(data.categories.map((c, i) => ({ ...c, sortOrder: i })))
      .returning({ id: categories.id, name: categories.name, kind: categories.kind });
    const catId = new Map(catRows.map((c) => [`${c.kind}:${c.name}`, c.id]));

    const potRows = data.pots.length
      ? await tx.insert(pots).values(data.pots.map((p, i) => ({ ...p, sortOrder: i }))).returning({ id: pots.id, name: pots.name })
      : [];
    const potId = new Map(potRows.map((p) => [p.name, p.id]));

    await tx.insert(settings).values({ id: 1, ...data.settings });

    if (data.budgets.length) {
      await tx.insert(budgets).values(
        data.budgets.map((b) => ({ month: b.month + "-01", categoryId: catId.get(`expense:${b.category}`)!, amount: b.amount })),
      );
    }

    const rows = data.transactions.map((t) => ({
      date: t.date,
      categoryId: catId.get(`${t.kind}:${t.category}`)!,
      potId: t.pot ? potId.get(t.pot) ?? null : null,
      description: t.description,
      amount: t.amount,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(transactions).values(rows.slice(i, i + 500));

    return { categories: catRows.length, pots: potRows.length, transactions: rows.length, budgets: data.budgets.length };
  });
}
