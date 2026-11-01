import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronDown, Pencil } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/queries";
import { addMonths, currentMonth, daysInMonth, isMonthKey, monthLabel, monthName, today } from "@/lib/dates";
import { EXPENSE_GROUPS, budgetSplit, monthProgress, type BudgetLine } from "@/lib/finance";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, Dot, MoreLink, PanelHeader, PlanBar } from "@/components/ui";
import { MonthSwitcher } from "@/components/month-switcher";
import { BudgetInput, CopyBudgetButton } from "./budget-input";

export const metadata: Metadata = { title: "Jatah" };

type Line = BudgetLine & { name: string; group: string; sortOrder: number };

/**
 * One question: "how much of this month's jatah is left?" The answer is the biggest figure. Under it only what
 * needs attention: categories over their jatah, then those nearly used up. The rest folds into one row.
 * "Ubah jatah" switches to every category with an input.
 */
export default async function JatahPage({ searchParams }: PageProps<"/jatah">) {
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
  const daysLeft = isCurrent ? daysInMonth(month) - Number(today().slice(8, 10)) + 1 : 0;
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(month !== currentMonth() ? { m: month } : {}), ...extra });
    const s = p.toString();
    return s ? `/jatah?${s}` : "/jatah";
  };
  const named = (l: BudgetLine): Line => ({ ...l, name: cats.get(l.categoryId)!.name, group: cats.get(l.categoryId)!.group, sortOrder: cats.get(l.categoryId)!.sortOrder });
  const planned = d.lines.filter((l) => l.budget > 0).map(named);
  const over = planned.filter((l) => l.actual > l.budget).sort((a, b) => b.actual - b.budget - (a.actual - a.budget));
  const near = planned.filter((l) => l.actual <= l.budget && (l.used ?? 0) >= 0.9).sort((a, b) => a.left - b.left);
  const safe = planned.filter((l) => (l.used ?? 0) < 0.9).sort((a, b) => b.left - a.left);
  const label = monthName(month);

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Jatah</h1>
        <MonthSwitcher month={month} path="/jatah" params={{ ubah: editing && d.budgetTotal > 0 ? "1" : undefined }} />
      </div>
      <p className="mt-0.5 mb-5 text-sm text-muted">Sisa uang belanja bulan ini.</p>

      {/* The answer */}
      {d.budgetTotal > 0 ? (
        <Card className="px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">Jatah belanja {label}</p>
            <Link href={q(editing ? {} : { ubah: "1" })} scroll={false} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors", editing ? "bg-primary text-on-primary hover:opacity-90" : "bg-field text-ink-2 hover:bg-active hover:text-ink")}>
              {editing ? <Check className="size-3.5" strokeWidth={2} /> : <Pencil className="size-3.5" strokeWidth={1.75} />}
              {editing ? "Selesai" : "Ubah jatah"}
            </Link>
          </div>
          <p className={cn("num mt-1 text-[32px] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[34px]", left < 0 && "text-neg")}>
            {left >= 0 ? "Sisa" : "Lewat"} {rp(Math.abs(left))}
          </p>
          <PlanBar className="mt-4" spent={split.planned} plan={d.budgetTotal} marker={isCurrent ? progress : undefined} hue />
          <p className="num mt-2.5 text-[13px] leading-5 text-muted">
            Terpakai {rp(split.planned)} dari {rp(d.budgetTotal)}
            {left > 0 && isCurrent ? <> · <span className="text-ink-2">{rp(Math.floor(left / Math.max(daysLeft, 1)))}/hari</span> lagi</> : ""}
            {overIncome > 0 && <span className="block text-warn">Melebihi pemasukan {monthName(addMonths(month, -1))} {rp(overIncome)}</span>}
          </p>
          {(d.savingPlan !== null || d.saved > 0 || d.summary.savingsOut > 0) && (
            <div className="mt-4 border-t border-rule pt-3.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted">{d.savedNet < 0 ? "Tabungan berkurang" : "Berhasil menabung"}</span>
                <span className={cn("num shrink-0 font-bold", d.savedNet < 0 && "text-neg")}>{rp(Math.abs(d.savedNet))}</span>
              </div>
              {/* The net figure only makes sense with what went in and what came back out */}
              <p className="num mt-1 text-[13px] leading-5 text-muted">
                {d.summary.savingsOut > 0 && <span className="block">Masuk {rp(d.saved)} · Terambil {rp(d.summary.savingsOut)}</span>}
                {d.savingPlan !== null && d.savingPlan > 0 && (
                  <span className="block">Target {rp(d.savingPlan)}{d.savedNet >= d.savingPlan && <span className="text-pos"> · tercapai</span>}</span>
                )}
              </p>
            </div>
          )}
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-[15px] font-medium">Jatah {monthLabel(month)} belum diatur</p>
            <p className="mt-0.5 text-sm text-muted">Isi per kategori di bawah, atau salin dari bulan lalu.</p>
          </div>
          <CopyBudgetButton month={month} />
        </Card>
      )}

      {editing ? (
        <EditAll d={d} cats={cats} month={month} split={split} />
      ) : (
        <>
          {over.length > 0 && (
            <Card className="mt-3 overflow-hidden" aria-labelledby="over">
              <PanelHeader id="over" title="Lewat jatah" note={String(over.length)} />
              <ul>{over.map((l) => <Watch key={l.categoryId} line={l} tone="neg" />)}</ul>
            </Card>
          )}
          {near.length > 0 && (
            <Card className="mt-3 overflow-hidden" aria-labelledby="near">
              <PanelHeader id="near" title="Hampir habis" note={String(near.length)} />
              <ul>{near.map((l) => <Watch key={l.categoryId} line={l} tone="warn" />)}</ul>
            </Card>
          )}
          {safe.length > 0 && (
            <details className="group mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Masih aman <span className="font-normal text-muted">{safe.length}</span></span>
                  <span className="block truncate text-[13px] text-muted">{safe.map((l) => l.name).join(", ")}</span>
                </span>
                <span className="num shrink-0 text-right text-[13px] text-muted">sisa <span className="text-[15px] font-medium text-ink">{rp(safe.reduce((a, l) => a + l.left, 0))}</span></span>
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" strokeWidth={1.75} />
              </summary>
              <ul className="border-t border-rule">{safe.map((l) => <Watch key={l.categoryId} line={l} />)}</ul>
            </details>
          )}
          {split.unplannedLines.length > 0 && (
            <details className="group mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Di luar jatah</span>
                  <span className="block truncate text-[13px] text-muted">{split.unplannedLines.map((l) => cats.get(l.categoryId)!.name).join(", ")}</span>
                </span>
                <span className="num shrink-0 text-right text-[13px] text-muted"><span className="text-[15px] font-medium text-ink">{rp(split.unplanned)}</span><span className="block">tidak dihitung</span></span>
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" strokeWidth={1.75} />
              </summary>
              <div className="border-t border-rule">
                <p className="px-4 pt-3 text-[13px] leading-5 text-muted sm:px-5">
                  Tidak masuk hitungan sisa jatah.
                </p>
                <ul>{split.unplannedLines.map((l) => <UnplannedRow key={l.categoryId} line={l} name={cats.get(l.categoryId)!.name} group={cats.get(l.categoryId)!.group} month={month} editing={false} />)}</ul>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** A category to keep an eye on: name and what's left (or over) on line one, spent of jatah and the bar under it. */
function Watch({ line: l, tone }: { line: Line; tone?: "neg" | "warn" }) {
  const isOver = l.actual > l.budget;
  return (
    <li className="border-b border-rule px-4 py-3 last:border-b-0 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px]">{l.name}</span>
        <span className={cn("num shrink-0 text-[15px] font-medium", tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-ink-2")}>
          {isOver ? `lebih ${rp(l.actual - l.budget)}` : `sisa ${rp(l.left)}`}
        </span>
      </div>
      <p className="num mt-0.5 text-[13px] text-muted">{rp(l.actual)} dari {rp(l.budget)}</p>
      <PlanBar quiet className="mt-2" spent={l.actual} plan={l.budget} label={`${l.name}: ${rp(l.actual)} dari ${rp(l.budget)}`} />
    </li>
  );
}

/** Every category with an input, grouped by type, then the saving plan and the categories without a jatah. */
function EditAll({ d, cats, month, split }: { d: Awaited<ReturnType<typeof getDashboard>>; cats: Map<number, Awaited<ReturnType<typeof getDashboard>>["cats"][number]>; month: string; split: ReturnType<typeof budgetSplit> }) {
  const unplannedIds = new Set(split.unplannedLines.map((l) => l.categoryId));
  const order = (g: string) => { const i = (EXPENSE_GROUPS as readonly string[]).indexOf(g); return i < 0 ? 99 : i; };
  const lines = d.lines.filter((l) => !unplannedIds.has(l.categoryId)).sort((a, b) => {
    const ca = cats.get(a.categoryId)!, cb = cats.get(b.categoryId)!;
    return order(ca.group) - order(cb.group) || ca.sortOrder - cb.sortOrder;
  });
  const groups = [...new Set(lines.map((l) => cats.get(l.categoryId)!.group))];
  return (
    <>
      <section className="mt-3" aria-label="Jatah per kategori">
        <Card className="overflow-hidden">
          <PanelHeader title="Jatah per kategori" note="tersimpan otomatis" more={<MoreLink href="/transaksi/kategori">Kategori</MoreLink>} />
          {groups.map((g, i) => {
            const gl = lines.filter((l) => cats.get(l.categoryId)!.group === g);
            const spent = gl.reduce((a, l) => a + l.actual, 0);
            const plan = gl.reduce((a, l) => a + l.budget, 0);
            return (
              <section key={g} className={cn(i > 0 && "border-t border-line")}>
                <div className="flex h-9 items-center justify-between bg-raised/50 px-5 text-xs">
                  <span className="font-medium text-ink-2">{g}</span>
                  <span className={cn("num", spent > plan && plan > 0 ? "text-neg" : "text-muted")}>{rp(spent)} / {rp(plan)}</span>
                </div>
                <ul>{gl.map((l) => <Row key={l.categoryId} line={l} name={cats.get(l.categoryId)!.name} month={month} editing />)}</ul>
              </section>
            );
          })}
          <div className="flex h-12 items-center justify-between border-t border-line px-5 text-sm">
            <span className="font-medium">Total</span>
            <span className="num"><span className="font-bold">{rp(split.planned)}</span> <span className="text-muted">/ {rp(d.budgetTotal)}</span></span>
          </div>
        </Card>
      </section>

      <section className="mt-3">
        <Card className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
          <span className="min-w-0 text-sm">
            <span className="block">Target menabung</span>
            <span className="num block text-[13px] text-muted">Terpisah dari jatah belanja</span>
          </span>
          <div className="w-32 shrink-0 sm:w-36">
            <BudgetInput key={`${month}-plan-${d.savingPlan}`} month={month} categoryId={null} value={d.savingPlan ?? 0} label="Target menabung" />
          </div>
        </Card>
      </section>

      {split.unplannedLines.length > 0 && (
        <section className="mt-3" aria-labelledby="unplanned">
          <Card className="overflow-hidden">
            <PanelHeader id="unplanned" title="Di luar jatah" note={rp(split.unplanned)} />
            <ul>{split.unplannedLines.map((l) => <UnplannedRow key={l.categoryId} line={l} name={cats.get(l.categoryId)!.name} group={cats.get(l.categoryId)!.group} month={month} editing />)}</ul>
          </Card>
        </section>
      )}
    </>
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
        <p className="mt-0.5 text-xs text-muted lg:order-2 lg:mt-0 lg:flex-1">Terpakai {rp(l.actual)} · isi jatah jika pengeluaran ini rutin</p>
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
            <span className="text-xs text-muted">Jatah</span>
            <div className="w-36"><BudgetInput key={`${month}-${l.categoryId}-${l.budget}`} month={month} categoryId={l.categoryId} value={l.budget} label={name} /></div>
          </div>
        )}
        <span className="num text-sm font-medium">{rp(l.actual)}</span>
      </div>
    </li>
  );
}
