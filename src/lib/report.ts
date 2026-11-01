// Laporan: which days to compare, and spending added up day by day. No DB access here.
import { addMonths, daysInMonth, monthOf } from "./dates";

export type Range = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The month shown and the stretch of last month it is fair to compare with. While the month is still running, only
 * its days so far against the same days of last month (1–2 Nov against 1–2 Okt); once it is over, whole months.
 */
export function comparePeriods(month: string, today: string) {
  const prev = addMonths(month, -1);
  const days = daysInMonth(month);
  const running = monthOf(today) === month;
  const day = running ? Number(today.slice(8, 10)) : days;
  const prevDay = running ? Math.min(day, daysInMonth(prev)) : daysInMonth(prev);
  return {
    running,
    day,
    days,
    cur: { from: `${month}-01`, to: `${month}-${pad(day)}` } as Range,
    prev: { from: `${prev}-01`, to: `${prev}-${pad(prevDay)}` } as Range,
  };
}

/** Spending added up day by day through `upTo` days of `month` (index 0 is day 1). */
export function cumulative(byDate: Map<string, number>, month: string, upTo: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let d = 1; d <= upTo; d++) {
    sum += byDate.get(`${month}-${pad(d)}`) ?? 0;
    out.push(sum);
  }
  return out;
}

/** "1–2 Nov", or "Oktober" for a whole month. */
export function rangeLabel(r: Range, whole: boolean, monthName: (m: string) => string, short: (m: string) => string): string {
  const m = monthOf(r.from);
  if (whole) return monthName(m);
  const a = Number(r.from.slice(8, 10)), b = Number(r.to.slice(8, 10));
  return a === b ? `${a} ${short(m)}` : `${a}–${b} ${short(m)}`;
}
