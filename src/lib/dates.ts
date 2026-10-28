export const TZ = "Asia/Jakarta";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "YYYY-MM-DD" for today in Jakarta. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "YYYY-MM" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function currentMonth(now = new Date()): string {
  return monthOf(today(now));
}

export function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthStart(month: string): string {
  return month + "-01";
}

/** "2026-10" -> "Oktober 2026" */
export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  return short ? `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`;
}

export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** "2026-10-28" -> "Rabu, 28 Okt" (+ year if not this year) */
export function dayLabel(date: string, ref = today()): string {
  if (date === ref) return "Hari ini";
  if (date === addDays(ref, -1)) return "Kemarin";
  const d = new Date(date + "T00:00:00Z");
  const base = `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return date.slice(0, 4) === ref.slice(0, 4) ? base : `${base} ${d.getUTCFullYear()}`;
}

/** "2026-10-28" -> "28 Okt 2026" */
export function shortDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole months from a to b (a, b are YYYY-MM). */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
