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
  /** The card's balance right after this transaction, when the card keeps it. */
  after?: number;
}

/**
 * A CEPAS (TapCash) log record keeps 8 bytes of user data, which the reader passes on as `terminal` in hex;
 * its first 4 bytes are the balance after the transaction.
 */
function balanceAfter(t: CardTx): number | undefined {
  if (!t.terminal || !/^[0-9a-f]{16}$/i.test(t.terminal)) return undefined;
  return parseInt(t.terminal.slice(0, 8), 16);
}

/**
 * Newest first; rows without a readable date go last, in the card's order. The balance after each row is kept
 * only when the newest row's matches the card's balance, so a card whose user data means something else shows none.
 */
export function historyRows(history: CardTx[], balance?: number): HistoryRow[] {
  const rows = history.map((t, i) => ({
    key: `${i}-${t.date}-${t.amount}`,
    at: parseCardDate(t.date),
    amount: Math.abs(t.amount),
    topUp: isTopUp(t.type),
    where: t.location || undefined,
    after: balanceAfter(t),
    i,
  }));
  rows.sort((a, b) => (a.at && b.at ? b.at.getTime() - a.at.getTime() : a.at ? -1 : b.at ? 1 : a.i - b.i));
  const trusted = balance !== undefined && rows.length > 0 && rows[0].after === balance;
  return rows.map((r) => ({
    key: r.key,
    at: r.at,
    amount: r.amount,
    topUp: r.topUp,
    where: r.where,
    ...(trusted && r.after !== undefined ? { after: r.after } : {}),
  }));
}
