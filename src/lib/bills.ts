// Tagihan: when each one is due, which are waiting, and which transaction pays which. No DB access here.
import { addDays, addMonths, daysInMonth, monthOf } from "./dates";

export type BillSchedule = "payday" | "date";

export type BillInfo = {
  id: number;
  name: string;
  categoryId: number;
  schedule: BillSchedule;
  dueDay: number | null;
  /** The bill's own date of creation ("YYYY-MM-DD"): months due before it are never asked for. */
  createdOn: string;
};

/** A tagihan due in one month that has not been paid or skipped yet. */
export type OpenPeriod = { billId: number; month: string; due: string };

/** The day of the month a tagihan is due, or null when it is "pas gajian" and the payday isn't set. */
export function billDay(bill: Pick<BillInfo, "schedule" | "dueDay">, paydayDay: number | null): number | null {
  return bill.schedule === "payday" ? paydayDay : bill.dueDay;
}

/** "YYYY-MM-DD" a day of a month falls on; short months use their last day (31 → 30 Nov). */
export function dueDate(month: string, day: number): string {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);

/** The month whose due date is nearest to a payment date: BPJS due on the 1st and paid on 31 Oktober is November's. */
export function periodFor(date: string, day: number): string {
  const m = monthOf(date);
  return [addMonths(m, -1), m, addMonths(m, 1)]
    .map((month) => ({ month, d: Math.abs(dayDiff(dueDate(month, day), date)) }))
    .sort((a, b) => a.d - b.d)[0].month;
}

/**
 * The months a tagihan is waiting to be paid, oldest first. A month is waiting from the day before it is due
 * (`lead` days), until it is paid or skipped; at most last month is still asked for.
 */
export function openPeriods(bill: BillInfo, paydayDay: number | null, settled: Set<string>, today: string, lead = 1): OpenPeriod[] {
  const day = billDay(bill, paydayDay);
  if (day === null) return [];
  const m = monthOf(today);
  return [addMonths(m, -1), m, addMonths(m, 1)]
    .map((month) => ({ billId: bill.id, month, due: dueDate(month, day) }))
    .filter((p) => !settled.has(p.month) && addDays(p.due, -lead) <= today && p.due >= bill.createdOn);
}

/** "Besok", "Hari ini", "Telat 3 hari". */
export function dueLabel(due: string, today: string): { text: string; tone: "soon" | "today" | "late" } {
  const d = dayDiff(due, today);
  if (d > 1) return { text: `${d} hari lagi`, tone: "soon" };
  if (d === 1) return { text: "Besok", tone: "soon" };
  if (d === 0) return { text: "Hari ini", tone: "today" };
  return { text: `Telat ${-d} hari`, tone: "late" };
}

// ── Matching names ────────────────────────────────────────────

/** Words that say nothing about which tagihan it is. */
const FILLER = new Set(["bayar", "bayaran", "tagihan", "bulan", "bulanan", "iuran", "untuk", "dan", "ke", "di", "the"]);

/** Lowercase words of a name, without filler words. */
export function nameWords(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !FILLER.has(w));
}

/** True when every word typed starts a word of the text: "listrik" finds "Listrik PLN", "air" finds "Air PDAM". */
export function matchesQuery(text: string, query: string): boolean {
  const q = nameWords(query);
  if (!q.length) return false;
  const words = nameWords(text);
  return q.every((w) => words.some((x) => x.startsWith(w)));
}

/** True when the note shares a word with the tagihan's name (whole words, so "air" never matches "airpods"). */
export function sharesName(note: string, billName: string): boolean {
  const words = new Set(nameWords(note));
  return nameWords(billName).some((w) => words.has(w));
}

// ── Matching a new transaction to a tagihan ──────────────────

export type MatchCandidate = OpenPeriod & { name: string; categoryId: number; lastAmount: number | null };
export type MatchTx = { date: string; categoryId: number; amount: number; description: string };

/** Within 30% of the last payment. */
export function amountClose(amount: number, last: number | null): boolean {
  return last !== null && last > 0 && Math.abs(amount - last) <= last * 0.3;
}

/**
 * The one tagihan month a new expense pays, or null when it isn't clear. It must be in the tagihan's category, dated
 * from three days before it is due, and match its name or its last amount. When two tagihan could fit (Listrik and
 * Air are both Utility), nothing is marked: guessing wrong is worse than asking.
 */
export function matchPayment(tx: MatchTx, candidates: MatchCandidate[]): MatchCandidate | null {
  const inWindow = candidates.filter((c) => c.categoryId === tx.categoryId && tx.date >= addDays(c.due, -3) && dayDiff(tx.date, c.due) <= 40);
  // A named match beats one that only has a close amount.
  const named = inWindow.filter((c) => sharesName(tx.description, c.name));
  const fits = named.length ? named : inWindow.filter((c) => amountClose(tx.amount, c.lastAmount));
  const bills = new Set(fits.map((c) => c.billId));
  if (bills.size !== 1) return null;
  // The same tagihan open in two months: the one due nearest to the payment.
  return fits.sort((a, b) => Math.abs(dayDiff(tx.date, a.due)) - Math.abs(dayDiff(tx.date, b.due)))[0];
}

/** Orders transactions for "which one paid it?": its category, a close amount and its name first, then the newest. */
export function rankForBill<T extends { categoryId: number; amount: number; description: string; date: string }>(
  rows: T[],
  bill: { categoryId: number; name: string },
  last: number | null,
): T[] {
  const score = (t: T) => (t.categoryId === bill.categoryId ? 4 : 0) + (sharesName(t.description, bill.name) ? 2 : 0) + (amountClose(t.amount, last) ? 1 : 0);
  return [...rows].sort((a, b) => score(b) - score(a) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ── What the balance already owes ─────────────────────────────

export type ReserveBill = BillInfo & { lastAmount: number | null; settledMonths: Set<string> };

/**
 * Tagihan the money in Kantong Utama is already meant for, until the next salary: dated ones due before it (late
 * ones included), and tagihan pas gajian of the current payday once its salary is recorded (before that
 * they are paid from the coming salary, so they would only make the balance look short). Without a payday set, the
 * horizon is the end of this month.
 */
export function reservedBills(bills: ReserveBill[], paydayDay: number | null, today: string, salaryRecorded: boolean) {
  const m = monthOf(today);
  // Until the salary that has to cover it: this payday's while it isn't in yet, the next one once it is.
  const period = paydayDay !== null ? periodFor(today, paydayDay) : null;
  const until = period !== null ? dueDate(salaryRecorded ? addMonths(period, 1) : period, paydayDay!) : addDays(dueDate(addMonths(m, 1), 1), -1);
  const items: { billId: number; month: string; due: string; amount: number }[] = [];
  for (const b of bills) {
    if (b.schedule === "date") {
      for (const month of [addMonths(m, -1), m, addMonths(m, 1)]) {
        const due = dueDate(month, b.dueDay!);
        if (due < until && due >= b.createdOn && !b.settledMonths.has(month)) items.push({ billId: b.id, month, due, amount: b.lastAmount ?? 0 });
      }
    } else if (paydayDay !== null && salaryRecorded) {
      const month = periodFor(today, paydayDay);
      const due = dueDate(month, paydayDay);
      if (due >= b.createdOn && !b.settledMonths.has(month)) items.push({ billId: b.id, month, due, amount: b.lastAmount ?? 0 });
    }
  }
  return { until, items, total: items.reduce((s, i) => s + i.amount, 0) };
}
