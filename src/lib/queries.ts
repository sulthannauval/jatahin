import { and, asc, desc, eq, gte, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "./db";
import { budgets, categories, potAdjustments, pots, settings, transactions } from "./db/schema";
import { addMonths, monthStart, today as todayFn } from "./dates";
import {
  budgetLines,
  buildGoals,
  carryOver,
  monthlyTotals,
  potBalances,
  potDetails,
  savingFlows,
  summarizeMonth,
  trendTable,
  type CatInfo,
  type MonthCatSum,
  type PotInfo,
  type SavingTx,
} from "./finance";

export async function getCategories(db: DB, includeArchived = false) {
  const rows = await db
    .select()
    .from(categories)
    .where(includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.id));
  return rows;
}

export async function getPots(db: DB, includeArchived = false) {
  return db
    .select()
    .from(pots)
    .where(includeArchived ? undefined : eq(pots.archived, false))
    .orderBy(asc(pots.sortOrder), asc(pots.id));
}

export async function getSettings(db: DB) {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row ?? { id: 1, carryStartMonth: null, carryStartBalance: 0 };
}

async function monthCatSums(db: DB): Promise<MonthCatSum[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .groupBy(sql`1`, transactions.categoryId);
  return rows.map((r) => ({ month: r.month, categoryId: r.categoryId, total: Number(r.total) }));
}

async function savingTxs(db: DB): Promise<SavingTx[]> {
  const rows = await db
    .select({ date: transactions.date, potId: transactions.potId, amount: transactions.amount, role: categories.role })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(isNotNull(categories.role), isNotNull(transactions.potId)));
  return rows;
}

async function firstMonth(db: DB): Promise<string | null> {
  const [r] = await db.select({ m: sql<string | null>`to_char(min(${transactions.date}), 'YYYY-MM')` }).from(transactions);
  return r?.m ?? null;
}

const toCatInfo = (c: typeof categories.$inferSelect): CatInfo => ({
  id: c.id, name: c.name, kind: c.kind, group: c.group, role: c.role,
});
const toPotInfo = (p: typeof pots.$inferSelect): PotInfo => ({
  id: p.id, name: p.name, openingBalance: p.openingBalance, openingDate: p.openingDate,
  target: p.target, targetDate: p.targetDate, priority: p.priority,
});

export async function getAdjustments(db: DB) {
  return db.select().from(potAdjustments).orderBy(desc(potAdjustments.date), desc(potAdjustments.id));
}

export async function getSavings(db: DB, todayDate = todayFn()) {
  const [potRows, txs, adjustments] = await Promise.all([getPots(db), savingTxs(db), getAdjustments(db)]);
  const infos = potRows.map(toPotInfo);
  const balances = potBalances(infos, txs, adjustments);
  const goals = buildGoals(infos, balances, txs, todayDate);
  const potList = potRows.map((p) => ({ ...p, balance: balances.get(p.id) ?? 0 }));
  const details = potDetails(infos, txs, adjustments);
  const thisMonth = todayDate.slice(0, 7);
  const flows = { month: thisMonth, cur: savingFlows(txs, thisMonth), prev: savingFlows(txs, addMonths(thisMonth, -1)) };
  return { pots: potList, goals, details, adjustments, flows, total: potList.reduce((s, p) => s + p.balance, 0) };
}

export async function getMonthBudgets(db: DB, month: string) {
  const rows = await db.select().from(budgets).where(eq(budgets.month, monthStart(month)));
  return new Map(rows.map((r) => [r.categoryId, r.amount]));
}

export async function getDashboard(db: DB, month: string, todayDate = todayFn()) {
  const [cats, sums, cfg, budgetMap, savings, first] = await Promise.all([
    getCategories(db, true),
    monthCatSums(db),
    getSettings(db),
    getMonthBudgets(db, month),
    getSavings(db, todayDate),
    firstMonth(db),
  ]);
  const infos = cats.map(toCatInfo);
  const summary = summarizeMonth(sums, infos, month);
  // Last month, for "vs bulan lalu" changes and to sanity-check the budget total against real income.
  const prev = summarizeMonth(sums, infos, addMonths(month, -1));
  const prevRealIncome = prev.realIncome;
  const carry = carryOver(sums, infos, cfg.carryStartMonth, cfg.carryStartBalance, month);
  const trendFrom = first && first > addMonths(month, -5) ? first : addMonths(month, -5);
  // Trend income is real income (without savings withdrawals), the same definition the KPI figures use.
  // `net` stays the cash difference (it matches Selisih and the carried balance); withdrawals are shown on their own.
  const trend = monthlyTotals(sums, infos, trendFrom, month).map((t) => {
    const m = summarizeMonth(sums, infos, t.month);
    return { ...t, income: m.realIncome, withdraw: m.withdraw };
  });
  const expenseCats = cats.filter((c) => c.kind === "expense" && (!c.archived || summary.byCategory.has(c.id)));
  const lines = budgetLines(expenseCats.map(toCatInfo), budgetMap, summary);
  const budgetTotal = [...budgetMap.values()].reduce((a, b) => a + b, 0);
  const now = todayDate.slice(0, 7);
  const tableTo = month > now ? month : now;
  const table = trendTable(sums, infos, cfg.carryStartMonth, cfg.carryStartBalance, first && first < month ? first : month, tableTo);
  return { cats, summary, prev, carry, trend, table, lines, budgetTotal, prevRealIncome, savings, settings: cfg };
}

export type TxFilter = { month: string; q?: string; categoryId?: number };

export async function getTransactions(db: DB, f: TxFilter) {
  const from = monthStart(f.month);
  const to = monthStart(addMonths(f.month, 1));
  const conds = [gte(transactions.date, from), lt(transactions.date, to)];
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(transactions.description, like), ilike(categories.name, like), ilike(pots.name, like))!);
  }
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      categoryId: transactions.categoryId,
      potId: transactions.potId,
      categoryName: categories.name,
      group: categories.group,
      kind: categories.kind,
      role: categories.role,
      potName: pots.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(pots, eq(pots.id, transactions.potId))
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.id));
}

export type TxRow = Awaited<ReturnType<typeof getTransactions>>[number];

export async function getRecentTransactions(db: DB, limit = 6, savingsOnly = false) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      categoryId: transactions.categoryId,
      potId: transactions.potId,
      categoryName: categories.name,
      group: categories.group,
      kind: categories.kind,
      role: categories.role,
      potName: pots.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(pots, eq(pots.id, transactions.potId))
    .where(savingsOnly ? isNotNull(categories.role) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit);
}

/** Everything the "add transaction" form needs: categories sorted by how often they're used, pots, past descriptions. */
export async function getFormOptions(db: DB) {
  const [cats, potRows, usage, descs] = await Promise.all([
    getCategories(db),
    getPots(db),
    db
      .select({ categoryId: transactions.categoryId, n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(gte(transactions.date, sql`current_date - interval '90 days'`))
      .groupBy(transactions.categoryId),
    db
      .select({ categoryId: transactions.categoryId, description: transactions.description, n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(sql`${transactions.description} <> ''`)
      .groupBy(transactions.categoryId, transactions.description)
      .orderBy(desc(sql`count(*)`))
      .limit(400),
  ]);
  const uses = new Map(usage.map((u) => [u.categoryId, u.n]));
  const sorted = [...cats].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
  const suggestions: Record<number, string[]> = {};
  for (const d of descs) {
    const list = (suggestions[d.categoryId] ??= []);
    if (list.length < 8) list.push(d.description);
  }
  return {
    categories: sorted.map((c) => ({ id: c.id, name: c.name, kind: c.kind, role: c.role, group: c.group })),
    pots: potRows.map((p) => ({ id: p.id, name: p.name })),
    suggestions,
  };
}

export type FormOptions = Awaited<ReturnType<typeof getFormOptions>>;

export async function countTransactions(db: DB) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions);
  return r.n;
}
