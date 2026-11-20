/** What the Android app reports after a card is tapped (see EMoneyPlugin.java). */
export interface CardTx {
  /** "dd/MM/yyyy HH:mm:ss" in WIB, as the card reader formats it. */
  date: string;
  amount: number;
  type: string;
  location?: string;
  terminal?: string;
}

export interface CardInfo {
  name: string;
  id: string;
  currency: string;
  /** The balance was read and the card is one the reader knows. */
  readable: boolean;
  balance?: number;
  history: CardTx[];
}

export interface CardRead {
  card?: CardInfo;
  tech?: string[];
  log?: string;
  error?: string;
}

/** "20/11/2026 07:42:00" (WIB) -> the instant, or null. */
export function parseCardDate(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h - 7, mi, se);
  return Number.isNaN(t) ? null : new Date(t);
}

export function isTopUp(type: string): boolean {
  return /top\s*-?up|isi|reload|credit/i.test(type);
}

/** The last four characters of the card's id, for telling cards apart: "•••• 4821". */
export function maskCardId(id: string): string {
  const s = id.replace(/[^0-9a-z]/gi, "").toUpperCase();
  return s.length > 4 ? `•••• ${s.slice(-4)}` : s;
}

export interface HistoryRow {
  key: string;
  at: Date | null;
  amount: number;
  topUp: boolean;
  where?: string;
}

/** Newest first; rows without a readable date go last, in the card's order. */
export function historyRows(history: CardTx[]): HistoryRow[] {
  const rows = history.map((t, i): HistoryRow & { i: number } => ({
    key: `${i}-${t.date}-${t.amount}`,
    at: parseCardDate(t.date),
    amount: Math.abs(t.amount),
    topUp: isTopUp(t.type),
    where: t.location || undefined,
    i,
  }));
  rows.sort((a, b) => (a.at && b.at ? b.at.getTime() - a.at.getTime() : a.at ? -1 : b.at ? 1 : a.i - b.i));
  return rows.map((r) => ({ key: r.key, at: r.at, amount: r.amount, topUp: r.topUp, where: r.where }));
}
