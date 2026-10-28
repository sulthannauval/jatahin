const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 1500000 -> "Rp1.500.000", -5000 -> "−Rp5.000" */
export function rp(n: number): string {
  const s = "Rp" + idr.format(Math.abs(Math.round(n)));
  return n < 0 ? "−" + s : s;
}

/** Compact for tight spots: 1500000 -> "1,5 jt", 250000 -> "250 rb" */
export function rpShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const f = (v: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v);
  if (a >= 1e9) return `${sign}${f(a / 1e9)} M`;
  if (a >= 1e6) return `${sign}${f(a / 1e6)} jt`;
  if (a >= 1e3) return `${sign}${f(a / 1e3)} rb`;
  return sign + idr.format(a);
}

/** Digits with thousand dots, for inputs: "1500000" -> "1.500.000" */
export function groupDigits(digits: string): string {
  const clean = digits.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return clean ? idr.format(Number(clean)) : "";
}

/**
 * Parse user input into whole rupiah. Accepts "1.500.000", "1500000", "1,5jt", "150rb", "150k", "2m" (juta).
 * Returns null when it can't be read or isn't positive.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(/^rp/, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)*)(jt|juta|m|rb|ribu|k)?$/);
  if (!m) return null;
  const [, num, unit] = m;
  let value: number;
  if (unit) {
    // With a unit, "," or "." is a decimal separator: 1,5jt / 1.5jt
    value = Number(num.replace(",", ".").replace(/\.(?=.*\.)/g, ""));
    value *= unit === "rb" || unit === "ribu" || unit === "k" ? 1e3 : 1e6;
  } else {
    // Without a unit, dots/commas are thousand separators.
    value = Number(num.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded < 1e13 ? rounded : null;
}

export function pct(ratio: number | null, digits = 0): string {
  if (ratio === null || !Number.isFinite(ratio)) return "–";
  return new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: digits }).format(ratio).replace("-", "−");
}

/**
 * A balance as a bank app shows it, rounded to whole rupiah. Accepts "6.781,72", "Rp 4.300.000", "0", "1500000".
 * A comma followed by 1–2 digits at the end is the sen part. Returns null when unreadable or negative.
 */
export function parseBalance(input: string): number | null {
  const s = input.trim().replace(/^rp\.?/i, "").replace(/\s+/g, "");
  const m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number(m[1].replace(/\./g, ""));
  const sen = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
  const v = Math.round(whole + sen);
  return Number.isFinite(v) && v < 1e13 ? v : null;
}
