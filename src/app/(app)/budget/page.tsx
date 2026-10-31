import type { Metadata } from "next";
import Link from "next/link";
import { Check, Pencil } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/queries";
import { addMonths, currentMonth, daysInMonth, isMonthKey, monthLabel, monthName, today } from "@/lib/dates";
import { EXPENSE_GROUPS, budgetSplit, monthProgress, type BudgetLine } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, Dot, MoreLink, PlanBar, SectionHeader } from "@/components/ui";
import { MonthSwitcher } from "@/components/month-switcher";
import { BudgetInput, CopyBudgetButton } from "./budget-input";

export const metadata: Metadata = { title: "Budget" };

/**
 * One question: "how much of the plan is left?" Rows are read-only and two lines tall;
 * "Ubah budget" switches them to inputs.
 */
export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  await requireSession();
  const sp = await searchParams;
  const month = isMonthKey(sp.m) ? sp.m : currentMonth();
  const d = await getDashboard(await getDb(), month);
  const editing = sp.ubah === "1" || d.budgetTotal === 0;
  const cats = new Map(d.cats.map((c) => [c.id, c]));
  const isCurrent = month === currentMonth();
  const progress = monthProgress(month, today(), daysInMonth(month));
  // Warn only when spending and saving plans together ask for more than last month actually brought in.
  const overIncome = d.prev.income > 0 ? d.budgetTotal + (d.savingPlan ?? 0) - d.prev.income : 0;
  const split = budgetSplit(d.lines);
  const left = d.budgetTotal - split.planned;
  const unplannedIds = new Set(split.unplannedLines.map((l) => l.categoryId));
  const order = (g: string) => { const i = (EXPENSE_GROUPS as readonly string[]).indexOf(g); return i < 0 ? 99 : i; };
  const lines = d.lines.filter((l) => !unplannedIds.has(l.categoryId)).sort((a, b) => {
    const ca = cats.get(a.categoryId)!, cb = cats.get(b.categoryId)!;
    return order(ca.group) - order(cb.group) || ca.sortOrder - cb.sortOrder;
  });
  const groups = [...new Set(lines.map((l) => cats.get(l.categoryId)!.group))];
  const daysLeft = isCurrent ? daysInMonth(month) - Number(today().slice(8, 10)) + 1 : 0;
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(month !== currentMonth() ? { m: month } : {}), ...extra });
    const s = p.toString();
    return s ? `/budget?${s}` : "/budget";
  };

  const overCount = lines.filter((l) => l.budget > 0 && l.actual > l.budget).length;
  const plannedCount = lines.filter((l) => l.budget > 0).length;

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-[-0.01em]">Budget <span className="text-muted">{monthLabel(month)}</span></h1>
        <MonthSwitcher month={month} path="/budget" params={{ ubah: editing && d.budgetTotal > 0 ? "1" : undefined }} compact />
      </div>

      {/* The answer: one wide summary, four figures and the plan bar */}
      {d.budgetTotal > 0 ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            <Stat
              label={left >= 0 ? "Sisa budget" : "Melebihi budget"}
              value={rp(Math.abs(left))}
              tone={left < 0 ? "neg" : undefined}
              sub={left >= 0 && isCurrent ? `Sekitar ${rp(Math.floor(left / Math.max(daysLeft, 1)))}/hari, ${daysLeft} hari tersisa` : `${overCount} kategori melebihi budget`}
            />
            <Stat label="Terpakai" value={rp(split.planned)} sub={`${pct(split.planned / d.budgetTotal)} dari total budget`} className="border-l border-line" />
            <Stat
              label="Total budget"
              value={rp(d.budgetTotal)}
              sub={overIncome > 0 ? <span className="text-warn">{rp(overIncome)} di atas pemasukan {monthName(addMonths(month, -1))}</span> : `${plannedCount} kategori`}
              className="border-t border-line lg:border-t-0 lg:border-l"
            />
            <Stat
              label="Di luar budget"
              value={rp(split.unplanned)}
              sub={split.unplannedLines.length ? `${split.unplannedLines.length} kategori, tidak dihitung` : "Tidak ada"}
              className="border-t border-l border-line lg:border-t-0"
            />
          </div>
          <div className="border-t border-line px-5 py-4">
            <PlanBar spent={split.planned} plan={d.budgetTotal} marker={isCurrent ? progress : undefined} hue />
            <div className="num mt-2 flex justify-between text-xs text-muted">
              <span>Rp0</span>
              {isCurrent && <span className="hidden sm:inline">Garis tipis menandai posisi hari ini dalam bulan</span>}
              <span>{rp(d.budgetTotal)}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-[15px] font-medium">Budget {monthLabel(month)} belum diatur</p>
            <p className="mt-0.5 text-sm text-muted">Isi budget per kategori di bawah, atau salin dari bulan sebelumnya.</p>
          </div>
          <CopyBudgetButton month={month} />
        </Card>
      )}

      {/* Every budgeted category */}
      <section className="mt-8" aria-label="Per kategori">
        <SectionHeader
          title="Per kategori"
          note={`${overCount} melebihi budget`}
          more={
            d.budgetTotal > 0 && (
              <Link href={q(editing ? {} : { ubah: "1" })} scroll={false} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors", editing ? "bg-primary text-on-primary hover:opacity-90" : "bg-field text-ink-2 hover:bg-active hover:text-ink")}>
                {editing ? <Check className="size-3.5" strokeWidth={2} /> : <Pencil className="size-3.5" strokeWidth={1.75} />}
                {editing ? "Selesai" : "Ubah budget"}
              </Link>
            )
          }
        />
        <Card className="overflow-hidden">
          <div className="hidden h-9 items-center gap-5 border-b border-line px-5 text-xs text-muted lg:flex">
            <span className="w-44 shrink-0">Kategori</span>
            <span className="flex-1">Pemakaian</span>
            <span className="w-56 text-right">Terpakai / budget</span>
            <span className="w-36 text-right">Sisa</span>
          </div>
          {groups.map((g, i) => {
            const gl = lines.filter((l) => cats.get(l.categoryId)!.group === g);
            const spent = gl.reduce((a, l) => a + l.actual, 0);
            const plan = gl.reduce((a, l) => a + l.budget, 0);
            return (
              <section key={g} className={cn(i > 0 && "border-t border-line")}>
                <div className="flex h-9 items-center justify-between bg-raised/50 px-5 text-xs">
                  <span className="flex items-center gap-2 font-medium text-ink-2"><Dot group={g} />{g}</span>
                  <span className={cn("num", spent > plan && plan > 0 ? "text-neg" : "text-muted")}>{rp(spent)} / {rp(plan)}</span>
                </div>
                <ul>{gl.map((l) => <Row key={l.categoryId} line={l} name={cats.get(l.categoryId)!.name} month={month} editing={editing} />)}</ul>
              </section>
            );
          })}
          <div className="flex h-12 items-center justify-between border-t border-line px-5 text-sm">
            <span className="font-medium">Total</span>
            <span className="num"><span className="font-bold">{rp(split.planned)}</span> <span className="text-muted">/ {rp(d.budgetTotal)}</span></span>
          </div>
        </Card>
      </section>

      {/* Money meant for saving kantong: moved, not spent, so it sits apart from the spending budget */}
      {(d.savingPlan !== null || d.saved > 0 || editing) && (
        <section className="mt-8" aria-labelledby="saving-plan">
          <SectionHeader id="saving-plan" title="Rencana menabung" note="dipindah ke kantong tabungan" />
          <Card className="px-5 py-4">
            <div className="flex min-h-7 items-center justify-between gap-3">
              <span className="text-sm">Bulan ini</span>
              {editing ? (
                <div className="w-32 shrink-0 sm:w-36">
                  <BudgetInput key={`${month}-plan-${d.savingPlan}`} month={month} categoryId={null} value={d.savingPlan ?? 0} label="Rencana menabung" />
                </div>
              ) : (
                <span className="num text-sm">
                  <span className={cn(!d.saved && "text-muted")}>{rp(d.saved)}</span>
                  {d.savingPlan !== null && <span className="text-muted"> / {rp(d.savingPlan)}</span>}
                </span>
              )}
            </div>
            {d.savingPlan !== null && d.savingPlan > 0 && (
              <div className="mt-1.5 flex items-center gap-3">
                <PlanBar quiet className="flex-1" spent={Math.min(d.saved, d.savingPlan)} plan={d.savingPlan} label={`Ditabung ${rp(d.saved)} dari ${rp(d.savingPlan)}`} />
                <span className={cn("num w-36 shrink-0 text-right text-xs", d.saved >= d.savingPlan ? "text-pos" : "text-muted")}>
                  {d.saved >= d.savingPlan ? "tercapai" : `kurang ${rp(d.savingPlan - d.saved)}`}
                </span>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* Spending outside the plan */}
      {split.unplannedLines.length > 0 && (
        <section className="mt-8" aria-labelledby="unplanned">
          <SectionHeader id="unplanned" title="Di luar budget" note={rp(split.unplanned)} more={<MoreLink href={month === currentMonth() ? "/laporan" : `/laporan?m=${month}`}>Laporan</MoreLink>} />
          <p className="mb-3 text-sm text-muted">
            Pengeluaran pada kategori tanpa budget bulan ini. Tidak termasuk dalam perhitungan sisa budget.
            {d.summary.savingsOut > 0 && <> Diambil dari kantong tabungan bulan ini: <span className="num text-ink-2">{rp(d.summary.savingsOut)}</span>.</>}
          </p>
          <Card className="overflow-hidden">
            <ul>{split.unplannedLines.map((l) => <UnplannedRow key={l.categoryId} line={l} name={cats.get(l.categoryId)!.name} group={cats.get(l.categoryId)!.group} month={month} editing={editing} />)}</ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone, className }: { label: string; value: string; sub?: React.ReactNode; tone?: "neg"; className?: string }) {
  return (
    <div className={cn("min-w-0 px-5 py-5", className)}>
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("num mt-1.5 text-[20px] leading-7 font-bold tracking-[-0.01em] sm:text-[22px]", tone === "neg" && "text-neg")}>{value}</p>
      {sub && <p className="num mt-1 text-xs leading-5 text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Phone: two lines (name and spent/budget, then the bar and what's left).
 * Laptop: one 36px line: name · bar · spent/budget · left. `lg:contents` lets the two phone lines become one row.
 */
function Row({ line: l, name, month, editing }: { line: BudgetLine; name: string; month: string; editing: boolean }) {
  const over = l.budget > 0 && l.actual > l.budget;
  return (
    <li className="border-b border-rule px-5 py-3 last:border-b-0 lg:flex lg:min-h-11 lg:items-center lg:gap-5 lg:py-1.5">
      <div className="flex min-h-7 items-center justify-between gap-3 lg:contents">
        <span className="min-w-0 text-sm leading-5 lg:w-44 lg:shrink-0 lg:truncate">{name}</span>
        {editing ? (
          <div className="w-32 shrink-0 sm:w-36 lg:order-3 lg:flex lg:w-56 lg:justify-end">
            <BudgetInput key={`${month}-${l.categoryId}-${l.budget}`} month={month} categoryId={l.categoryId} value={l.budget} label={name} />
          </div>
        ) : (
          <span className="num shrink-0 text-right text-sm lg:order-3 lg:w-56">
            <span className={cn(!l.actual && "text-muted")}>{rp(l.actual)}</span>
            {l.budget > 0 && <span className="text-muted"> / {rp(l.budget)}</span>}
          </span>
        )}
      </div>
      {l.budget > 0 ? (
        <div className="mt-1.5 flex items-center gap-3 lg:contents">
          <PlanBar quiet className="flex-1 lg:order-2" spent={l.actual} plan={l.budget} label={`${name}: ${rp(l.actual)} dari ${rp(l.budget)}`} />
          <span className={cn("num w-36 shrink-0 text-right text-xs lg:order-4 lg:text-sm", over ? "text-neg" : "text-muted")}>
            {over ? `lebih ${rp(l.actual - l.budget)}` : `sisa ${rp(l.left)}`}
          </span>
        </div>
      ) : editing ? (
        <p className="mt-0.5 text-xs text-muted lg:order-2 lg:mt-0 lg:flex-1">Terpakai {rp(l.actual)} · isi budget jika pengeluaran ini rutin</p>
      ) : (
        <span className="hidden lg:order-2 lg:block lg:flex-1" />
      )}
    </li>
  );
}

/** Out-of-budget row: name and amount; in edit mode a budget input to make it a planned category. */
function UnplannedRow({ line: l, name, group, month, editing }: { line: BudgetLine; name: string; group: string; month: string; editing: boolean }) {
  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-5 py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-sm"><Dot group={group} /><span className="truncate">{name}</span></span>
      <div className="flex items-center gap-4">
        {editing && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Budget</span>
            <div className="w-36"><BudgetInput key={`${month}-${l.categoryId}-${l.budget}`} month={month} categoryId={l.categoryId} value={l.budget} label={name} /></div>
          </div>
        )}
        <span className="num text-sm font-medium">{rp(l.actual)}</span>
      </div>
    </li>
  );
}
