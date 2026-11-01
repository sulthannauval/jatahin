import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "./db";
import { budgets, categories, potAdjustments, pots, savingPlans, settings, transactions, transfers } from "./db/schema";
import { addMonths, monthStart, today as todayFn } from "./dates";
import { frequentEntries } from "./quick";
import {
  budgetLines,
  buildGoals,
  carryOver,
  monthlyNets,
  monthlyTotals,
  potDetails,
  potFlows,
  savingsOutByMonth,
  summarizeMonth,
  toMoves,
  trendTable,
  type CatInfo,
  type MonthCatSum,
  type PotInfo,
  type PotTx,
  type TransferInfo,
} from "./finance";

export async function getCategories(db: DB, includeArchived = false) {
  const rows = await db
    .select()
    .from(categories)
    .where(includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.id));
  return rows;
}

/** How many transactions use each category, all time. */
export async function categoryUsage(db: DB) {
  const rows = await db
    .select({ categoryId: transactions.categoryId, n: sql<number>`count(*)::int` })
    .from(transactions)
    .groupBy(transactions.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.n]));
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
  return row ?? { id: 1, carryStartMonth: null, carryStartBalance: 0, paydayDay: null, salaryCategoryId: null };
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

/** Every movement of money, per kantong: income and spending summed per day, and the moves between kantong. */
async function loadMoney(db: DB) {
  const [txRows, transferRows] = await Promise.all([
    db
      .select({ date: transactions.date, potId: transactions.potId, kind: categories.kind, amount: sql<string>`sum(${transactions.amount})` })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .groupBy(transactions.date, transactions.potId, categories.kind),
    db.select({ date: transfers.date, fromPotId: transfers.fromPotId, toPotId: transfers.toPotId, amount: transfers.amount }).from(transfers),
  ]);
  const txs: PotTx[] = txRows.map((r) => ({ ...r, amount: Number(r.amount) }));
  const moved: TransferInfo[] = transferRows;
  return { txs, transfers: moved, moves: toMoves(txs, moved) };
}
type Money = Awaited<ReturnType<typeof loadMoney>>;

async function firstMonth(db: DB): Promise<string | null> {
  const [r] = await db.select({ m: sql<string | null>`to_char(min(${transactions.date}), 'YYYY-MM')` }).from(transactions);
  return r?.m ?? null;
}

const toCatInfo = (c: typeof categories.$inferSelect): CatInfo => ({
  id: c.id, name: c.name, kind: c.kind, group: c.group,
});
const toPotInfo = (p: typeof pots.$inferSelect): PotInfo => ({
  id: p.id, name: p.name, kind: p.kind, openingBalance: p.openingBalance, openingDate: p.openingDate,
  target: p.target, targetDate: p.targetDate, priority: p.priority,
});

export async function getAdjustments(db: DB) {
  return db.select().from(potAdjustments).orderBy(desc(potAdjustments.date), desc(potAdjustments.id));
}

/**
 * Every kantong with its balance: Kantong Utama (the money to spend, carried month to month from the settings'
 * start) and the others, with goals and this month's flows.
 */
export async function getKantong(db: DB, todayDate = todayFn(), loaded?: Money) {
  const [potRows, money, adjustments, cfg] = await Promise.all([getPots(db), loaded ?? loadMoney(db), getAdjustments(db), getSettings(db)]);
  const infos = potRows.map(toPotInfo);
  const details = potDetails(infos, money.moves, adjustments);
  const balances = new Map(details.map((d) => [d.potId, d.balance]));
  const goals = buildGoals(infos, balances, money.moves, todayDate);
  const potList = potRows.map((p) => ({ ...p, balance: balances.get(p.id) ?? 0 }));
  const thisMonth = todayDate.slice(0, 7);
  const nets = monthlyNets(money.moves, null);
  const carry = carryOver(nets, cfg.carryStartMonth, cfg.carryStartBalance, thisMonth);
  // Without a carry-over set up, Kantong Utama only knows this month's change.
  const utama = carry ? carry.closing : nets.get(thisMonth) ?? 0;
  const flows = { month: thisMonth, cur: potFlows(money.moves, thisMonth), prev: potFlows(money.moves, addMonths(thisMonth, -1)) };
  const savingTotal = potList.filter((p) => p.kind === "saving").reduce((s, p) => s + p.balance, 0);
  return {
    utama,
    pots: potList,
    goals,
    details,
    adjustments,
    flows,
    savingTotal,
    /** Kantong Utama and every other kantong together. */
    total: utama + potList.reduce((s, p) => s + p.balance, 0),
  };
}

export type KantongData = Awaited<ReturnType<typeof getKantong>>;

export async function getMonthBudgets(db: DB, month: string) {
  const rows = await db.select().from(budgets).where(eq(budgets.month, monthStart(month)));
  return new Map(rows.map((r) => [r.categoryId, r.amount]));
}

/** How much is meant to go into saving kantong this month, or null when no plan is set. */
export async function getSavingPlan(db: DB, month: string): Promise<number | null> {
  const [row] = await db.select({ amount: savingPlans.amount }).from(savingPlans).where(eq(savingPlans.month, monthStart(month)));
  return row?.amount ?? null;
}

export async function getDashboard(db: DB, month: string, todayDate = todayFn()) {
  const money = await loadMoney(db);
  const [cats, sums, cfg, budgetMap, kantong, first, savingPlan] = await Promise.all([
    getCategories(db, true),
    monthCatSums(db),
    getSettings(db),
    getMonthBudgets(db, month),
    getKantong(db, todayDate, money),
    firstMonth(db),
    getSavingPlan(db, month),
  ]);
  const infos = cats.map(toCatInfo);
  const savingIds = new Set(kantong.pots.filter((p) => p.kind === "saving").map((p) => p.id));
  const out = savingsOutByMonth(money.txs, money.transfers, savingIds);
  const summary = summarizeMonth(sums, infos, month, out.get(month) ?? 0);
  // Last month, for "vs bulan lalu" changes.
  const prev = summarizeMonth(sums, infos, addMonths(month, -1), out.get(addMonths(month, -1)) ?? 0);
  const nets = monthlyNets(money.moves, null);
  const carry = carryOver(nets, cfg.carryStartMonth, cfg.carryStartBalance, month);
  // Money put into saving kantong this month, against the plan.
  const saved = money.transfers
    .filter((t) => t.date.slice(0, 7) === month)
    .reduce((s, t) => s + (t.toPotId !== null && savingIds.has(t.toPotId) && !(t.fromPotId !== null && savingIds.has(t.fromPotId)) ? t.amount : 0), 0);
  const trendFrom = first && first > addMonths(month, -5) ? first : addMonths(month, -5);
  // `net` is income minus spending; money taken out of savings is shown on its own.
  const trend = monthlyTotals(sums, infos, trendFrom, month).map((t) => ({ ...t, withdraw: out.get(t.month) ?? 0 }));
  const expenseCats = cats.filter((c) => c.kind === "expense" && (!c.archived || summary.byCategory.has(c.id)));
  const lines = budgetLines(expenseCats.map(toCatInfo), budgetMap, summary);
  const budgetTotal = [...budgetMap.values()].reduce((a, b) => a + b, 0);
  const now = todayDate.slice(0, 7);
  const tableTo = month > now ? month : now;
  const table = trendTable(sums, infos, nets, cfg.carryStartMonth, cfg.carryStartBalance, first && first < month ? first : month, tableTo);
  // Kantong Utama's change this month that isn't income or spending (moves, spending from other kantong).
  const moved = (nets.get(month) ?? 0) - summary.net;
  // What stayed saved: money in, less what was taken back out of saving kantong this month (moved or spent).
  const savedNet = saved - summary.savingsOut;
  return { cats, summary, prev, carry, moved, trend, table, lines, budgetTotal, kantong, savingPlan, saved, savedNet, settings: cfg };
}

export type TxFilter = { month: string; q?: string; categoryId?: number };

const txColumns = {
  id: transactions.id,
  date: transactions.date,
  amount: transactions.amount,
  description: transactions.description,
  categoryId: transactions.categoryId,
  potId: transactions.potId,
  categoryName: categories.name,
  group: categories.group,
  kind: categories.kind,
  potName: pots.name,
  createdAt: transactions.createdAt,
};
const fromPot = alias(pots, "from_pot");
const toPot = alias(pots, "to_pot");
const transferColumns = {
  id: transfers.id,
  date: transfers.date,
  amount: transfers.amount,
  note: transfers.note,
  fromPotId: transfers.fromPotId,
  toPotId: transfers.toPotId,
  fromName: fromPot.name,
  toName: toPot.name,
  createdAt: transfers.createdAt,
};

export type TxRow = { type: "tx" } & Awaited<ReturnType<typeof txQuery>>[number];
export type TransferRow = { type: "transfer" } & Awaited<ReturnType<typeof transferQuery>>[number];
/** One line in a list of what happened: income or spending, or money moved between kantong. */
export type ActivityRow = TxRow | TransferRow;

function txQuery(db: DB) {
  return db.select(txColumns).from(transactions).innerJoin(categories, eq(categories.id, transactions.categoryId)).leftJoin(pots, eq(pots.id, transactions.potId)).$dynamic();
}
function transferQuery(db: DB) {
  return db.select(transferColumns).from(transfers).leftJoin(fromPot, eq(fromPot.id, transfers.fromPotId)).leftJoin(toPot, eq(toPot.id, transfers.toPotId)).$dynamic();
}

/** Newest first: by date, then by when it was entered. */
function merge(txs: Awaited<ReturnType<typeof txQuery>>, moved: Awaited<ReturnType<typeof transferQuery>>): ActivityRow[] {
  const rows: ActivityRow[] = [...txs.map((r) => ({ type: "tx" as const, ...r })), ...moved.map((r) => ({ type: "transfer" as const, ...r }))];
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
}

/** A month of income, spending and moves between kantong. A category filter leaves the moves out. */
export async function getActivity(db: DB, f: TxFilter): Promise<ActivityRow[]> {
  const from = monthStart(f.month);
  const to = monthStart(addMonths(f.month, 1));
  const conds = [gte(transactions.date, from), lt(transactions.date, to)];
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (m) => "\\" + m)}%` : null;
  if (like) conds.push(or(ilike(transactions.description, like), ilike(categories.name, like), ilike(pots.name, like))!);
  const moveConds = [gte(transfers.date, from), lt(transfers.date, to)];
  // Kantong Utama has no row, so its name is matched here.
  if (like) moveConds.push(or(ilike(transfers.note, like), ilike(fromPot.name, like), ilike(toPot.name, like), ...("kantong utama".includes(f.q!.toLowerCase().trim()) ? [isNull(transfers.fromPotId), isNull(transfers.toPotId)] : []))!);
  const [txs, moved] = await Promise.all([
    txQuery(db).where(and(...conds)),
    f.categoryId ? Promise.resolve([]) : transferQuery(db).where(and(...moveConds)),
  ]);
  return merge(txs, moved);
}

/** The latest entries. With `kantongOnly`, only what touched a kantong other than Kantong Utama. */
export async function getRecentActivity(db: DB, limit = 6, kantongOnly = false): Promise<ActivityRow[]> {
  const [txs, moved] = await Promise.all([
    txQuery(db).where(kantongOnly ? isNotNull(transactions.potId) : undefined).orderBy(desc(transactions.date), desc(transactions.createdAt)).limit(limit),
    transferQuery(db).orderBy(desc(transfers.date), desc(transfers.createdAt)).limit(limit),
  ]);
  return merge(txs, moved).slice(0, limit);
}

/** What happened in one kantong: moves in and out, and income or spending in it. Newest first. */
export async function getPotActivity(db: DB, potId: number, limit = 30): Promise<ActivityRow[]> {
  const [txs, moved] = await Promise.all([
    txQuery(db).where(eq(transactions.potId, potId)).orderBy(desc(transactions.date), desc(transactions.createdAt)).limit(limit),
    transferQuery(db).where(or(eq(transfers.fromPotId, potId), eq(transfers.toPotId, potId))).orderBy(desc(transfers.date), desc(transfers.createdAt)).limit(limit),
  ]);
  return merge(txs, moved).slice(0, limit);
}

/** Everything the "add transaction" form needs: categories sorted by how often they're used, pots, past descriptions. */
export async function getFormOptions(db: DB) {
  const [cats, kantong, usage, descs, recent] = await Promise.all([
    getCategories(db),
    getKantong(db),
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
    db
      .select({
        id: transactions.id, categoryId: transactions.categoryId, potId: transactions.potId,
        description: transactions.description, amount: transactions.amount, date: transactions.date,
      })
      .from(transactions)
      .where(gte(transactions.date, sql`current_date - interval '90 days'`))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(2000),
  ]);
  const liveCats = new Set(cats.map((c) => c.id));
  const livePots = new Set(kantong.pots.map((p) => p.id));
  const uses = new Map(usage.map((u) => [u.categoryId, u.n]));
  const sorted = [...cats].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
  const suggestions: Record<number, string[]> = {};
  for (const d of descs) {
    const list = (suggestions[d.categoryId] ??= []);
    if (list.length < 8) list.push(d.description);
  }
  return {
    categories: sorted.map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.group })),
    pots: kantong.pots.map((p) => ({ id: p.id, name: p.name, kind: p.kind, balance: p.balance })),
    utama: kantong.utama,
    suggestions,
    // For the "Sering dicatat" buttons and for picking the category from the note.
    frequent: frequentEntries(recent, 12).filter((e) => liveCats.has(e.categoryId) && (e.potId === null || livePots.has(e.potId))),
    history: descs.filter((d) => liveCats.has(d.categoryId)),
  };
}

export type FormOptions = Awaited<ReturnType<typeof getFormOptions>>;

export async function countTransactions(db: DB) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions);
  return r.n;
}
