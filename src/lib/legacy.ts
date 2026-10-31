// Older data kept savings as income and spending in two special categories ("roles"): a deposit was spending in a
// Saving category with a kantong, a withdrawal was income in a "Bukan Income" category with a kantong.
// These turn that shape into moves between kantong. Used for old backups and the MoneyFlows spreadsheet;
// drizzle/0005_kantong.sql does the same for the database. No DB access here.

export type LegacyRole = "saving_deposit" | "saving_withdraw" | null;

type LegacyTx<P> = { potId: P | null; date: string; amount: number; description: string };
export type LegacyTransfer<P, T> = { source: T; fromPotId: P | null; toPotId: P | null };

/**
 * Splits transactions into the ones that stay and the savings entries that become transfers.
 * A deposit moves money from Kantong Utama (null) to its kantong; a withdrawal moves it back.
 * A savings entry without a kantong stays as ordinary income or spending.
 */
export function splitLegacy<P, T extends LegacyTx<P>>(txs: T[], roleOf: (t: T) => LegacyRole): { kept: T[]; transfers: LegacyTransfer<P, T>[] } {
  const kept: T[] = [];
  const transfers: LegacyTransfer<P, T>[] = [];
  for (const t of txs) {
    const role = roleOf(t);
    if (!role || t.potId === null) kept.push(t);
    else if (role === "saving_deposit") transfers.push({ source: t, fromPotId: null, toPotId: t.potId });
    else transfers.push({ source: t, fromPotId: t.potId, toPotId: null });
  }
  return { kept, transfers };
}

/** Budgets for the deposit categories become the month's saving plan; the other budgets stay. */
export function splitLegacyBudgets<B extends { month: string; amount: number }>(budgets: B[], isDeposit: (b: B) => boolean): { kept: B[]; plans: { month: string; amount: number }[] } {
  const kept: B[] = [];
  const plans = new Map<string, number>();
  for (const b of budgets) {
    if (!isDeposit(b)) kept.push(b);
    else if (b.amount > 0) plans.set(b.month, (plans.get(b.month) ?? 0) + b.amount);
  }
  return { kept, plans: [...plans].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)) };
}
