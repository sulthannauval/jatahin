import { ChevronRight } from "lucide-react";
import type { CatInfo, MonthSummary } from "@/lib/finance";
import { EXPENSE_GROUPS } from "@/lib/finance";
import { groupColor } from "@/lib/colors";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Dot } from "./ui";

type Cat = CatInfo & { name: string };

/** Change against last month, coloured for spending: a rise is bad, a fall is good. */
function Change({ cur, prev }: { cur: number; prev: number }) {
  const d = cur - prev;
  if (prev === 0 && cur === 0) return <span className="text-muted">—</span>;
  if (prev === 0) return <span className="text-muted">baru</span>;
  if (d === 0) return <span className="text-muted">tetap</span>;
  return <span className={d > 0 ? "text-neg" : "text-pos"}>{d > 0 ? "+" : "−"}{rp(Math.abs(d))}</span>;
}

/**
 * Where the month's spending went: one 100% bar by type (the category hues, 2px seams), then a row per type with
 * its amount, share and change; each row opens to its categories.
 */
export function Composition({ cur, prev, cats, prevLabel }: { cur: MonthSummary; prev: MonthSummary; cats: Cat[]; prevLabel: string }) {
  const total = cur.expense;
  const groups = [
    ...EXPENSE_GROUPS,
    ...new Set(cats.filter((c) => c.kind === "expense" && !(EXPENSE_GROUPS as readonly string[]).includes(c.group)).map((c) => c.group)),
  ].filter((g) => (cur.byGroup.get(g) ?? 0) > 0 || (prev.byGroup.get(g) ?? 0) > 0);
  const shown = groups.filter((g) => (cur.byGroup.get(g) ?? 0) > 0);

  return (
    <div>
      {total > 0 && (
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Komposisi pengeluaran: ${shown.map((g) => `${g} ${pct((cur.byGroup.get(g) ?? 0) / total)}`).join(", ")}`}>
          {shown.map((g) => (
            <div key={g} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${((cur.byGroup.get(g) ?? 0) / total) * 100}%`, background: groupColor(g) }} title={`${g}: ${rp(cur.byGroup.get(g) ?? 0)}`} />
          ))}
        </div>
      )}

      <div className="mt-5 hidden grid-cols-[minmax(0,1fr)_10rem_5rem_10rem] gap-4 px-3 pb-2 text-xs text-muted sm:grid">
        <span>Tipe</span><span className="text-right">Jumlah</span><span className="text-right">Porsi</span><span className="text-right">vs {prevLabel}</span>
      </div>
      <div className="divide-y divide-rule border-t border-line sm:border-t-0">
        {groups.map((g) => {
          const v = cur.byGroup.get(g) ?? 0;
          const pv = prev.byGroup.get(g) ?? 0;
          const items = cats
            .filter((c) => c.kind === "expense" && c.group === g)
            .map((c) => ({ c, v: cur.byCategory.get(c.id) ?? 0, pv: prev.byCategory.get(c.id) ?? 0 }))
            .filter((x) => x.v > 0 || x.pv > 0)
            .sort((a, b) => b.v - a.v);
          return (
            <details key={g} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-xl px-3 py-3 transition-colors hover:bg-raised/60 sm:grid-cols-[minmax(0,1fr)_10rem_5rem_10rem] [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
                  <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" strokeWidth={1.75} />
                  <Dot group={g} />
                  {g}
                  <span className="text-xs font-normal text-muted">{items.length} kategori</span>
                </span>
                <span className="num text-right text-sm font-bold">{rp(v)}</span>
                <span className="num col-span-2 pl-[3.25rem] text-xs text-muted sm:col-span-1 sm:pl-0 sm:text-right sm:text-sm">
                  <span className="sm:hidden">{total ? pct(v / total) : "—"} · </span>
                  <span className="hidden sm:inline">{total ? pct(v / total) : "—"}</span>
                  <span className="sm:hidden"><Change cur={v} prev={pv} /> vs {prevLabel}</span>
                </span>
                <span className="num hidden text-right text-sm sm:block"><Change cur={v} prev={pv} /></span>
              </summary>
              <ul className="mb-2 ml-[3.25rem] border-l border-line">
                {items.map(({ c, v: cv, pv: cpv }) => (
                  <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-1.5 pr-3 pl-4 text-sm sm:grid-cols-[minmax(0,1fr)_10rem_5rem_10rem] sm:pl-4">
                    <span className="min-w-0 text-ink-2">{c.name}</span>
                    <span className={cn("num text-right", !cv && "text-muted")}>{rp(cv)}</span>
                    <span className="num hidden text-right text-muted sm:block">{total && cv ? pct(cv / total) : "—"}</span>
                    <span className="num col-span-2 text-xs sm:col-span-1 sm:text-right sm:text-sm"><Change cur={cv} prev={cpv} /></span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_10rem_5rem_10rem]">
          <span className="font-medium">Total pengeluaran</span>
          <span className="num text-right font-bold">{rp(total)}</span>
          <span className="num hidden text-right text-muted sm:block">100%</span>
          <span className="num hidden text-right sm:block"><Change cur={total} prev={prev.expense} /></span>
        </div>
      </div>
    </div>
  );
}
