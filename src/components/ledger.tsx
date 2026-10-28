import type { CatInfo, Carry, MonthSummary } from "@/lib/finance";
import { EXPENSE_GROUPS } from "@/lib/finance";
import { monthName, addMonths } from "@/lib/dates";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Dot } from "./ui";

/**
 * The month as a ledger tree, like the old sheet's dashboard: balance first, then income and spending per type and
 * per category. No dividers; groups in ink, leaves in grey, figures on one right edge.
 */
export function Ledger({ month, summary: s, carry, cats, className }: { month: string; summary: MonthSummary; carry: Carry; cats: (CatInfo & { sortOrder: number; archived: boolean })[]; className?: string }) {
  const balance = carry ? carry.closing : s.net;
  const income = cats.filter((c) => c.kind === "income" && (s.byCategory.get(c.id) ?? 0) > 0);
  const groups = [...EXPENSE_GROUPS, ...new Set(cats.filter((c) => c.kind === "expense" && !(EXPENSE_GROUPS as readonly string[]).includes(c.group)).map((c) => c.group))];
  const expenseIn = (g: string) => cats.filter((c) => c.kind === "expense" && c.group === g && (!c.archived || s.byCategory.has(c.id)));

  return (
    <section className={cn("rounded-2xl border border-line bg-surface", className)} aria-labelledby="ledger-title">
      <div className="px-5 pt-4 pb-4">
        <h2 id="ledger-title" className="text-sm font-medium text-ink-2">Saldo bersih</h2>
        <p className={cn("num mt-1 text-[34px] leading-10 font-bold tracking-[-0.02em]", balance < 0 && "text-neg")}>{rp(balance)}</p>
        {carry ? (
          <p className="num mt-1 text-xs text-muted">
            Sisa {monthName(addMonths(month, -1))} {rp(carry.opening)} · bulan ini {s.net >= 0 ? "+" : ""}{rp(s.net)}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">Pemasukan dikurangi pengeluaran bulan ini</p>
        )}
      </div>

      <div className="border-t border-rule px-5 pt-3 pb-4">
        <Group label="Pemasukan" value={s.income} tone="pos" />
        {income.map((c) => <Leaf key={c.id} label={c.name} value={s.byCategory.get(c.id) ?? 0} />)}

        <div className="mt-5" />
        <Group label="Pengeluaran" value={s.expense} />
        {groups.map((g) => {
          const list = expenseIn(g);
          if (!list.length) return null;
          const total = s.byGroup.get(g) ?? 0;
          return (
            <div key={g} className="mt-1">
              <Sub label={g} value={total} />
              {list.map((c) => <Leaf key={c.id} label={c.name} value={s.byCategory.get(c.id) ?? 0} indent />)}
            </div>
          );
        })}

        <div className="mt-5 flex items-baseline justify-between gap-3 text-sm">
          <span>Saving rate</span>
          <span className={cn("num font-medium", s.savingRate !== null && s.savingRate < 0 && "text-neg")}>{pct(s.savingRate, 1)}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">Porsi pemasukan yang disimpan (setoran dan sisa), tanpa penarikan tabungan</p>
      </div>
    </section>
  );
}

function Group({ label, value, tone }: { label: string; value: number; tone?: "pos" }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 text-base">
      <span className="font-medium">{label}</span>
      <span className={cn("num font-bold", tone === "pos" && value > 0 && "text-pos")}>{tone === "pos" && value > 0 ? "+" : ""}{rp(value)}</span>
    </div>
  );
}

function Sub({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-[30px] items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2"><Dot group={label} />{label}</span>
      <span className={cn("num", value === 0 && "text-muted")}>{rp(value)}</span>
    </div>
  );
}


function Leaf({ label, value, indent, note }: { label: string; value: number; indent?: boolean; note?: string }) {
  return (
    <div className={cn("flex h-[30px] items-center justify-between gap-3 text-sm text-muted", indent && "pl-3")}>
      <span className="truncate">{label}{note && <span className="text-xs"> · {note}</span>}</span>
      <span className="num">{rp(value)}</span>
    </div>
  );
}
