// Pure money math. Mirrors the formulas from the old MoneyFlows spreadsheet, with money kept in kantong.
import { addMonths, monthOf, monthsBetween } from "./dates";

export type Kind = "income" | "expense";
export type PotKind = "saving" | "spending";

export type CatInfo = { id: number; name: string; kind: Kind; group: string };
/** Total per category per month ("YYYY-MM"). */
export type MonthCatSum = { month: string; categoryId: number; total: number };

export const EXPENSE_GROUPS = ["Wajib", "Kebutuhan", "Keinginan", "Lainnya"] as const;
export const INCOME_GROUPS = ["Rutin", "Tidak Rutin", "Lainnya"] as const;

export type MonthSummary = {
  income: number;
  expense: number;
  net: number;
  /** Money taken out of saving kantong for spending this month (moved out, or spent straight from them). */
  savingsOut: number;
  /** Spending paid for with that money (never more than the spending itself). */
  fromSavings: number;
  /** Share of income that was kept: (income − (expense − fromSavings)) / income. null without income. */
  savingRate: number | null;
  byCategory: Map<number, number>;
  byGroup: Map<string, number>;
};

export function summarizeMonth(sums: MonthCatSum[], cats: CatInfo[], month: string, savingsOut = 0): MonthSummary {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const s: MonthSummary = {
    income: 0, expense: 0, net: 0, savingsOut, fromSavings: 0, savingRate: null,
    byCategory: new Map(), byGroup: new Map(),
  };
  for (const row of sums) {
    if (row.month !== month) continue;
    const c = catById.get(row.categoryId);
    if (!c) continue;
    s.byCategory.set(c.id, (s.byCategory.get(c.id) ?? 0) + row.total);
    if (c.kind === "income") s.income += row.total;
    else {
      s.expense += row.total;
      s.byGroup.set(c.group, (s.byGroup.get(c.group) ?? 0) + row.total);
    }
  }
  s.net = s.income - s.expense;
  // Money taken out of savings is assumed to pay for that month's (usually unplanned) spending.
  s.fromSavings = Math.min(savingsOut, s.expense);
  s.savingRate = s.income > 0 ? (s.income - (s.expense - s.fromSavings)) / s.income : null;
  return s;
}

export type MonthTotals = { month: string; income: number; expense: number; net: number };

/** Income/expense per month for every month from `from` to `to` inclusive (gaps filled with 0). */
export function monthlyTotals(sums: MonthCatSum[], cats: CatInfo[], from: string, to: string): MonthTotals[] {
  const kind = new Map(cats.map((c) => [c.id, c.kind]));
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of sums) {
    const k = kind.get(r.categoryId);
    if (!k) continue;
    const m = byMonth.get(r.month) ?? { income: 0, expense: 0 };
    m[k] += r.total;
    byMonth.set(r.month, m);
  }
  const out: MonthTotals[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) {
    const v = byMonth.get(m) ?? { income: 0, expense: 0 };
    out.push({ month: m, ...v, net: v.income - v.expense });
  }
  return out;
}

// ── Kantong ───────────────────────────────────────────────────

/** Income or spending on a day, in the kantong it arrived in or left (null: Kantong Utama). */
export type PotTx = { date: string; potId: number | null; kind: Kind; amount: number };
/** Money moved between kantong. Null: Kantong Utama. */
export type TransferInfo = { date: string; fromPotId: number | null; toPotId: number | null; amount: number };
/** Money entering (+) or leaving (−) one kantong on a day. potId null: Kantong Utama. */
export type Move = { date: string; potId: number | null; amount: number };

export function toMoves(txs: PotTx[], transfers: TransferInfo[]): Move[] {
  const out: Move[] = txs.map((t) => ({ date: t.date, potId: t.potId, amount: t.kind === "income" ? t.amount : -t.amount }));
  for (const t of transfers) {
    out.push({ date: t.date, potId: t.fromPotId, amount: -t.amount }, { date: t.date, potId: t.toPotId, amount: t.amount });
  }
  return out;
}

/** How much one kantong grew or shrank in each month ("YYYY-MM"). Null: Kantong Utama. */
export function monthlyNets(moves: Move[], potId: number | null = null): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of moves) {
    if (m.potId !== potId) continue;
    const k = monthOf(m.date);
    out.set(k, (out.get(k) ?? 0) + m.amount);
  }
  return out;
}

/**
 * Money taken out of saving kantong per month for spending: moved to Kantong Utama or to a spending kantong,
 * or spent straight from the saving kantong. Moves between saving kantong don't count.
 */
export function savingsOutByMonth(txs: PotTx[], transfers: TransferInfo[], savingIds: ReadonlySet<number>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (date: string, amount: number) => out.set(monthOf(date), (out.get(monthOf(date)) ?? 0) + amount);
  const saving = (id: number | null) => id !== null && savingIds.has(id);
  for (const t of transfers) if (saving(t.fromPotId) && !saving(t.toPotId)) add(t.date, t.amount);
  for (const t of txs) if (t.kind === "expense" && saving(t.potId)) add(t.date, t.amount);
  return out;
}

export type Carry = { opening: number; closing: number } | null;

/**
 * Kantong Utama's balance carries into the next month, starting at `startMonth` with `startBalance`.
 * `nets` is Kantong Utama's change per month. Returns null for months before the start (or when not set up).
 */
export function carryOver(nets: Map<string, number>, startMonth: string | null, startBalance: number, month: string): Carry {
  if (!startMonth || month < startMonth) return null;
  let opening = startBalance;
  for (let m = startMonth; m < month; m = addMonths(m, 1)) opening += nets.get(m) ?? 0;
  return { opening, closing: opening + (nets.get(month) ?? 0) };
}

export type PotInfo = {
  id: number;
  name: string;
  kind: PotKind;
  openingBalance: number;
  openingDate: string | null;
  target: number | null;
  targetDate: string | null;
  priority: number | null;
};

/** A correction straight on a kantong (a mismatch with the bank). Signed. Bank interest is not tracked. */
export type PotAdjustment = { potId: number; date: string; amount: number };

/**
 * Balance = opening balance + money in − money out from the opening date on.
 * The opening balance is the balance at the START of openingDate, so that day's moves count.
 */
export function potBalances(pots: PotInfo[], moves: Move[], adjustments: PotAdjustment[] = []): Map<number, number> {
  return new Map(potDetails(pots, moves, adjustments).map((d) => [d.potId, d.balance]));
}

export type GoalStatus = "done" | "active" | "queued";
export type Goal = PotInfo & {
  balance: number;
  progress: number;
  remaining: number;
  status: GoalStatus;
  overdue: boolean;
  /** Average net money in per month over the last 3 full months. */
  pace: number;
  /** Estimated month the target is reached at the current pace. */
  eta: string | null;
};

/** Goals are worked on in order of priority: the first unfinished one is active, the rest wait. */
export function buildGoals(pots: PotInfo[], balances: Map<number, number>, moves: Move[], todayDate: string): Goal[] {
  const thisMonth = monthOf(todayDate);
  const paceFrom = addMonths(thisMonth, -3);
  const goals = pots
    .filter((p) => p.kind === "saving" && p.target !== null && p.target > 0)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.id - b.id);
  const goalIds = new Set(goals.map((g) => g.id));
  let activeFound = false;
  // Pace is measured on everything saved recently, since savings go to one goal at a time.
  const recentNet = moves
    .filter((m) => m.potId !== null && goalIds.has(m.potId) && monthOf(m.date) >= paceFrom && monthOf(m.date) < thisMonth)
    .reduce((s, m) => s + m.amount, 0);
  const pace = Math.max(0, Math.round(recentNet / 3));

  let queuedRemaining = 0;
  return goals.map((p) => {
    const balance = balances.get(p.id) ?? 0;
    const target = p.target ?? 0;
    const remaining = Math.max(0, target - balance);
    let status: GoalStatus;
    if (balance >= target) status = "done";
    else if (!activeFound) { status = "active"; activeFound = true; }
    else status = "queued";
    let eta: string | null = null;
    if (status !== "done" && pace > 0) {
      queuedRemaining += remaining;
      eta = addMonths(thisMonth, Math.ceil(queuedRemaining / pace));
    }
    return {
      ...p,
      balance,
      progress: target > 0 ? Math.min(1, Math.max(0, balance / target)) : 0,
      remaining,
      status,
      overdue: status !== "done" && !!p.targetDate && p.targetDate < todayDate,
      pace,
      eta,
    };
  });
}

export type BudgetLine = { categoryId: number; budget: number; actual: number; left: number; used: number | null };

export function budgetLines(
  expenseCats: CatInfo[],
  budgets: Map<number, number>,
  summary: MonthSummary,
): BudgetLine[] {
  return expenseCats.map((c) => {
    const budget = budgets.get(c.id) ?? 0;
    const actual = summary.byCategory.get(c.id) ?? 0;
    return { categoryId: c.id, budget, actual, left: budget - actual, used: budget > 0 ? actual / budget : null };
  });
}

/** How far into the month we are (0..1), for "on pace" hints. */
export function monthProgress(month: string, todayDate: string, days: number): number {
  const cur = monthOf(todayDate);
  const diff = monthsBetween(cur, month);
  if (diff < 0) return 1;
  if (diff > 0) return 0;
  return Number(todayDate.slice(8, 10)) / days;
}

export type PotDetail = {
  potId: number;
  openingBalance: number;
  openingDate: string | null;
  /** Money in and out from the opening date on (these count toward the balance). */
  inflow: number;
  outflow: number;
  /** Sum of corrections (bank mismatch). */
  adjusted: number;
  balance: number;
  /** All money out ever, for reference only. */
  outAllTime: number;
};

/** A kantong's balance broken down like the spreadsheet's "Saldo Tabungan" table. */
export function potDetails(pots: PotInfo[], moves: Move[], adjustments: PotAdjustment[] = []): PotDetail[] {
  return pots.map((p) => {
    let inflow = 0, outflow = 0, outAllTime = 0;
    const counts = (date: string) => !(p.openingDate && date < p.openingDate);
    const adjusted = adjustments.filter((a) => a.potId === p.id && counts(a.date)).reduce((sum, a) => sum + a.amount, 0);
    for (const m of moves) {
      if (m.potId !== p.id) continue;
      if (m.amount < 0) outAllTime -= m.amount;
      if (!counts(m.date)) continue;
      if (m.amount > 0) inflow += m.amount;
      else outflow -= m.amount;
    }
    return {
      potId: p.id, openingBalance: p.openingBalance, openingDate: p.openingDate,
      inflow, outflow, adjusted, balance: p.openingBalance + inflow - outflow + adjusted, outAllTime,
    };
  });
}

export type TrendRow = MonthTotals & {
  /** Kantong Utama's change that isn't income or spending: moves from and to other kantong, money spent from them. */
  moved: number;
  opening: number | null;
  closing: number | null;
};

/** Month-by-month table with Kantong Utama's carried-over balance (like the spreadsheet's "TREND PER BULAN"). */
export function trendTable(
  sums: MonthCatSum[], cats: CatInfo[], nets: Map<string, number>, startMonth: string | null, startBalance: number, from: string, to: string,
): TrendRow[] {
  const rows = monthlyTotals(sums, cats, startMonth && startMonth < from ? startMonth : from, to);
  let bal: number | null = null;
  const out: TrendRow[] = [];
  for (const r of rows) {
    const change = nets.get(r.month) ?? 0;
    let opening: number | null = null, closing: number | null = null;
    if (startMonth && r.month >= startMonth) {
      opening = bal ?? startBalance;
      closing = opening + change;
      bal = closing;
    }
    if (r.month >= from) out.push({ ...r, moved: change - r.net, opening, closing });
  }
  return out;
}

export type BudgetSplit = {
  /** Spending in categories that have a budget this month: this is what the budget is checked against. */
  planned: number;
  /** Spending in categories without a budget (one-off, family, often paid from savings). */
  unplanned: number;
  unplannedLines: BudgetLine[];
};

export function budgetSplit(lines: BudgetLine[]): BudgetSplit {
  const plannedLines = lines.filter((l) => l.budget > 0);
  const unplannedLines = lines.filter((l) => l.budget === 0 && l.actual > 0).sort((a, b) => b.actual - a.actual);
  return {
    planned: plannedLines.reduce((a, l) => a + l.actual, 0),
    unplanned: unplannedLines.reduce((a, l) => a + l.actual, 0),
    unplannedLines,
  };
}

export type FlowTotals = { inflow: number; outflow: number; net: number };
export type PotFlows = FlowTotals & { byPot: Map<number, FlowTotals> };

/** Money into and out of the other kantong (not Kantong Utama) in one month ("YYYY-MM"), in total and per kantong. */
export function potFlows(moves: Move[], month: string): PotFlows {
  const out: PotFlows = { inflow: 0, outflow: 0, net: 0, byPot: new Map() };
  for (const m of moves) {
    if (m.potId === null || monthOf(m.date) !== month) continue;
    const pot = out.byPot.get(m.potId) ?? { inflow: 0, outflow: 0, net: 0 };
    if (m.amount > 0) { pot.inflow += m.amount; out.inflow += m.amount; }
    else { pot.outflow -= m.amount; out.outflow -= m.amount; }
    pot.net = pot.inflow - pot.outflow;
    out.byPot.set(m.potId, pot);
  }
  out.net = out.inflow - out.outflow;
  return out;
}

/** What has to go in each month, from this month through the target's month, to reach the target on time. */
export function neededPerMonth(remaining: number, targetDate: string | null, todayDate: string): number | null {
  if (!targetDate || remaining <= 0) return null;
  const months = monthsBetween(monthOf(todayDate), monthOf(targetDate)) + 1;
  return months > 0 ? Math.ceil(remaining / months) : remaining;
}

type NamedCat = CatInfo & { name: string };
export type CategoryChange = { id: number; name: string; group: string; prev: number; cur: number; diff: number };

/** Expense categories that moved the most against the previous month, largest change first. */
export function categoryChanges(cur: MonthSummary, prev: MonthSummary, cats: NamedCat[], limit = 5): CategoryChange[] {
  return cats
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const a = prev.byCategory.get(c.id) ?? 0, b = cur.byCategory.get(c.id) ?? 0;
      return { id: c.id, name: c.name, group: c.group, prev: a, cur: b, diff: b - a };
    })
    .filter((x) => x.diff !== 0)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.name.localeCompare(y.name))
    .slice(0, limit);
}
