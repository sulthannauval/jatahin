// Pure money math. Mirrors the formulas from the old MoneyFlows spreadsheet.
import { addMonths, monthOf, monthsBetween } from "./dates";

export type Kind = "income" | "expense";
export type Role = "saving_deposit" | "saving_withdraw" | null;

export type CatInfo = { id: number; name: string; kind: Kind; group: string; role: Role };
/** Total per category per month ("YYYY-MM"). */
export type MonthCatSum = { month: string; categoryId: number; total: number };

export const EXPENSE_GROUPS = ["Wajib", "Kebutuhan", "Keinginan", "Saving", "Lainnya"] as const;
export const INCOME_GROUPS = ["Rutin", "Tidak Rutin", "Lainnya", "Bukan Income"] as const;

export type MonthSummary = {
  income: number;
  expense: number;
  /** Income that is just money taken out of savings. */
  withdraw: number;
  /** Expense that is just money put into savings. */
  deposit: number;
  net: number;
  /** Income without money taken out of savings (salary, side income...). */
  realIncome: number;
  /** Spending paid for with money taken out of savings this month (never more than the spending itself). */
  fromSavings: number;
  /** Share of real income that was kept: (realIncome − (expense − fromSavings − deposit)) / realIncome. null without real income. */
  savingRate: number | null;
  byCategory: Map<number, number>;
  byGroup: Map<string, number>;
};

export function summarizeMonth(sums: MonthCatSum[], cats: CatInfo[], month: string): MonthSummary {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const s: MonthSummary = {
    income: 0, expense: 0, withdraw: 0, deposit: 0, net: 0, realIncome: 0, fromSavings: 0, savingRate: null,
    byCategory: new Map(), byGroup: new Map(),
  };
  for (const row of sums) {
    if (row.month !== month) continue;
    const c = catById.get(row.categoryId);
    if (!c) continue;
    s.byCategory.set(c.id, (s.byCategory.get(c.id) ?? 0) + row.total);
    if (c.kind === "income") {
      s.income += row.total;
      if (c.role === "saving_withdraw") s.withdraw += row.total;
    } else {
      s.expense += row.total;
      if (c.role === "saving_deposit") s.deposit += row.total;
      s.byGroup.set(c.group, (s.byGroup.get(c.group) ?? 0) + row.total);
    }
  }
  s.net = s.income - s.expense;
  s.realIncome = s.income - s.withdraw;
  // Money taken out of savings is assumed to pay for that month's (usually unplanned) spending.
  s.fromSavings = Math.min(s.withdraw, s.expense);
  const spentFromIncome = s.expense - s.fromSavings - s.deposit;
  s.savingRate = s.realIncome > 0 ? (s.realIncome - spentFromIncome) / s.realIncome : null;
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

export type Carry = { opening: number; closing: number } | null;

/**
 * Leftover money rolls into the next month, starting at `startMonth` with `startBalance`.
 * Returns null for months before the start (or when carry-over isn't set up).
 */
export function carryOver(
  sums: MonthCatSum[],
  cats: CatInfo[],
  startMonth: string | null,
  startBalance: number,
  month: string,
): Carry {
  if (!startMonth || month < startMonth) return null;
  const totals = monthlyTotals(sums, cats, startMonth, month);
  let opening = startBalance;
  for (const t of totals.slice(0, -1)) opening += t.net;
  const current = totals[totals.length - 1];
  return { opening, closing: opening + current.net };
}

export type SavingTx = { date: string; potId: number | null; amount: number; role: Role };
export type PotInfo = {
  id: number;
  name: string;
  openingBalance: number;
  openingDate: string | null;
  target: number | null;
  targetDate: string | null;
  priority: number | null;
};

/**
 * Balance = opening balance + deposits − withdrawals from the opening date on.
 * The opening balance is the balance at the START of openingDate, so that day's transactions count.
 */
/** A correction straight on a pot (a mismatch with the bank). Signed. Bank interest is not tracked. */
export type PotAdjustment = { potId: number; date: string; amount: number };

export function potBalances(pots: PotInfo[], txs: SavingTx[], adjustments: PotAdjustment[] = []): Map<number, number> {
  const out = new Map<number, number>(pots.map((p) => [p.id, p.openingBalance]));
  const potById = new Map(pots.map((p) => [p.id, p]));
  for (const t of txs) {
    if (t.potId === null || !t.role) continue;
    const p = potById.get(t.potId);
    if (!p) continue;
    if (p.openingDate && t.date < p.openingDate) continue;
    const sign = t.role === "saving_deposit" ? 1 : -1;
    out.set(p.id, (out.get(p.id) ?? 0) + sign * t.amount);
  }
  for (const a of adjustments) {
    const p = potById.get(a.potId);
    if (!p || (p.openingDate && a.date < p.openingDate)) continue;
    out.set(p.id, (out.get(p.id) ?? 0) + a.amount);
  }
  return out;
}

export type GoalStatus = "done" | "active" | "queued";
export type Goal = PotInfo & {
  balance: number;
  progress: number;
  remaining: number;
  status: GoalStatus;
  overdue: boolean;
  /** Average net deposit per month over the last 3 full months. */
  pace: number;
  /** Estimated month the target is reached at the current pace. */
  eta: string | null;
};

/** Goals are worked on in order of priority: the first unfinished one is active, the rest wait. */
export function buildGoals(pots: PotInfo[], balances: Map<number, number>, txs: SavingTx[], todayDate: string): Goal[] {
  const thisMonth = monthOf(todayDate);
  const paceFrom = addMonths(thisMonth, -3);
  const goals = pots
    .filter((p) => p.target !== null && p.target > 0)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.id - b.id);
  let activeFound = false;
  // Pace is measured on everything saved recently, since savings go to one goal at a time.
  const recentNet = txs
    .filter((t) => t.potId !== null && t.role && monthOf(t.date) >= paceFrom && monthOf(t.date) < thisMonth)
    .filter((t) => goals.some((g) => g.id === t.potId))
    .reduce((s, t) => s + (t.role === "saving_deposit" ? t.amount : -t.amount), 0);
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
  /** Deposits / withdrawals from the opening date on (these count toward the balance). */
  deposits: number;
  withdrawals: number;
  /** Sum of corrections (bank mismatch). */
  adjusted: number;
  balance: number;
  /** All withdrawals ever, for reference only. */
  withdrawnAllTime: number;
};

/** Same math as potBalances, broken down like the spreadsheet's "Saldo Tabungan" table. */
export function potDetails(pots: PotInfo[], txs: SavingTx[], adjustments: PotAdjustment[] = []): PotDetail[] {
  return pots.map((p) => {
    let deposits = 0, withdrawals = 0, withdrawnAllTime = 0;
    const adjusted = adjustments
      .filter((a) => a.potId === p.id && !(p.openingDate && a.date < p.openingDate))
      .reduce((sum, a) => sum + a.amount, 0);
    for (const t of txs) {
      if (t.potId !== p.id || !t.role) continue;
      if (t.role === "saving_withdraw") withdrawnAllTime += t.amount;
      if (p.openingDate && t.date < p.openingDate) continue;
      if (t.role === "saving_deposit") deposits += t.amount;
      else withdrawals += t.amount;
    }
    return {
      potId: p.id, openingBalance: p.openingBalance, openingDate: p.openingDate,
      deposits, withdrawals, adjusted, balance: p.openingBalance + deposits - withdrawals + adjusted, withdrawnAllTime,
    };
  });
}

export type TrendRow = MonthTotals & { opening: number | null; closing: number | null };

/** Month-by-month table with carried-over balance (like the spreadsheet's "TREND PER BULAN"). */
export function trendTable(
  sums: MonthCatSum[], cats: CatInfo[], startMonth: string | null, startBalance: number, from: string, to: string,
): TrendRow[] {
  const rows = monthlyTotals(sums, cats, from < (startMonth ?? from) ? from : startMonth ?? from, to);
  let bal: number | null = null;
  const out: TrendRow[] = [];
  for (const r of rows) {
    let opening: number | null = null, closing: number | null = null;
    if (startMonth && r.month >= startMonth) {
      opening = bal ?? startBalance;
      closing = opening + r.net;
      bal = closing;
    }
    if (r.month >= from) out.push({ ...r, opening, closing });
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

export type FlowTotals = { deposits: number; withdrawals: number; net: number };
export type SavingFlows = FlowTotals & { byPot: Map<number, FlowTotals> };

/** Money put into and taken out of savings pots in one month ("YYYY-MM"), in total and per pot. */
export function savingFlows(txs: SavingTx[], month: string): SavingFlows {
  const out: SavingFlows = { deposits: 0, withdrawals: 0, net: 0, byPot: new Map() };
  for (const t of txs) {
    if (t.potId === null || !t.role || monthOf(t.date) !== month) continue;
    const pot = out.byPot.get(t.potId) ?? { deposits: 0, withdrawals: 0, net: 0 };
    if (t.role === "saving_deposit") { pot.deposits += t.amount; out.deposits += t.amount; }
    else { pot.withdrawals += t.amount; out.withdrawals += t.amount; }
    pot.net = pot.deposits - pot.withdrawals;
    out.byPot.set(t.potId, pot);
  }
  out.net = out.deposits - out.withdrawals;
  return out;
}

/** What has to go in each month, from this month through the target's month, to reach the target on time. */
export function neededPerMonth(remaining: number, targetDate: string | null, todayDate: string): number | null {
  if (!targetDate || remaining <= 0) return null;
  const months = monthsBetween(monthOf(todayDate), monthOf(targetDate)) + 1;
  return months > 0 ? Math.ceil(remaining / months) : remaining;
}

export type Insight = { kind: "top" | "growth" | "saving"; tone: "neutral" | "pos" | "neg"; title: string; detail: string };
type NamedCat = CatInfo & { name: string };

/**
 * Up to three plain-language findings for a month against the previous one: where most money went, what grew the
 * most, and how much of real income was kept. Amounts are left as numbers for the caller to format.
 */
export function monthInsights(
  cur: MonthSummary,
  prev: MonthSummary,
  cats: NamedCat[],
  fmt: (n: number) => string,
  prevLabel: string,
): Insight[] {
  const out: Insight[] = [];
  const expenseCats = cats.filter((c) => c.kind === "expense");
  const spend = (s: MonthSummary, id: number) => s.byCategory.get(id) ?? 0;

  const top = expenseCats.map((c) => ({ c, v: spend(cur, c.id) })).sort((a, b) => b.v - a.v)[0];
  if (top && top.v > 0 && cur.expense > 0) {
    out.push({
      kind: "top",
      tone: "neutral",
      title: `${top.c.name} menjadi pengeluaran terbesar`,
      detail: `${fmt(top.v)} atau ${Math.round((top.v / cur.expense) * 100)}% dari total pengeluaran bulan ini.`,
    });
  }

  const growth = expenseCats
    .map((c) => ({ c, a: spend(prev, c.id), b: spend(cur, c.id) }))
    .filter((x) => x.b - x.a > 0 && x.c.id !== top?.c.id)
    .sort((x, y) => y.b - y.a - (x.b - x.a))[0];
  if (growth) {
    out.push({
      kind: "growth",
      tone: "neg",
      title: growth.a > 0 ? `${growth.c.name} naik ${Math.round(((growth.b - growth.a) / growth.a) * 100)}%` : `${growth.c.name} muncul bulan ini`,
      detail: growth.a > 0 ? `Dari ${fmt(growth.a)} di ${prevLabel} menjadi ${fmt(growth.b)}.` : `${fmt(growth.b)}, sebelumnya tidak ada pengeluaran di kategori ini.`,
    });
  }

  if (cur.savingRate !== null) {
    const kept = Math.round(cur.savingRate * cur.realIncome);
    out.push({
      kind: "saving",
      tone: cur.savingRate >= 0.2 ? "pos" : cur.savingRate < 0 ? "neg" : "neutral",
      title: `${Math.round(cur.savingRate * 1000) / 10}% pemasukan berhasil disimpan`.replace(".", ","),
      detail: `${fmt(Math.max(0, kept))} dari pemasukan ${fmt(cur.realIncome)}${cur.withdraw > 0 ? `, di luar penarikan tabungan ${fmt(cur.withdraw)}` : ""}.`,
    });
  }
  return out;
}
