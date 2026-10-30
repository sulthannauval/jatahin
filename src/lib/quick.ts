// Shortcuts for recording a transaction, learned from past entries. No database or Next.js imports.

export type QuickEntry = { categoryId: number; potId: number | null; description: string; amount: number; n: number };

type PastTx = { categoryId: number; potId: number | null; description: string; amount: number; date: string; id: number };

/**
 * Entries recorded at least twice (same category, pot and description), most frequent first.
 * The amount is the latest one used, since prices and bills drift.
 */
export function frequentEntries(rows: PastTx[], limit: number): QuickEntry[] {
  const groups = new Map<string, { latest: PastTx; n: number }>();
  for (const r of rows) {
    const key = `${r.categoryId}|${r.potId ?? ""}|${r.description.trim().toLowerCase()}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { latest: r, n: 1 });
    else {
      g.n++;
      if (r.date > g.latest.date || (r.date === g.latest.date && r.id > g.latest.id)) g.latest = r;
    }
  }
  return [...groups.values()]
    .filter((g) => g.n >= 2)
    .sort((a, b) => b.n - a.n || b.latest.date.localeCompare(a.latest.date) || b.latest.id - a.latest.id)
    .slice(0, limit)
    .map(({ latest: l, n }) => ({ categoryId: l.categoryId, potId: l.potId, description: l.description.trim(), amount: l.amount, n }));
}

export type DescriptionUse = { description: string; categoryId: number; n: number };

/**
 * The category most often used with a note like `text`: an exact match first, otherwise notes that start with it
 * (from 3 characters). Only categories in `allowed` count. Null when nothing matches.
 */
export function guessCategory(history: DescriptionUse[], text: string, allowed: ReadonlySet<number>): number | null {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return null;
  const best = (match: (d: string) => boolean) => {
    const score = new Map<number, number>();
    for (const h of history) {
      if (allowed.has(h.categoryId) && match(h.description.trim().toLowerCase())) score.set(h.categoryId, (score.get(h.categoryId) ?? 0) + h.n);
    }
    let top: number | null = null;
    for (const [id, n] of score) if (top === null || n > score.get(top)!) top = id;
    return top;
  };
  return best((d) => d === t) ?? best((d) => d.startsWith(t));
}
