import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard, getRecentTransactions } from "@/lib/queries";
import { currentMonth, daysInMonth, isMonthKey, monthLabel, monthName, addMonths, today } from "@/lib/dates";
import { budgetSplit, monthProgress } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, Dot, MoreLink, PlanBar, buttonClass } from "@/components/ui";
import { KpiStrip, change } from "@/components/kpi";
import { BalanceCard } from "@/components/balance";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxList } from "@/components/tx-list";

/**
 * One question: "how is my money this month?"
 * The balance answers it first, like a bank screen, with how it was reached; a KPI strip follows (money in, money out,
 * saving rate, each against last month); under it the budget
 * with what needs attention, and the latest entries. Everything else lives on /laporan.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const db = await getDb();
  const [d, recent] = await Promise.all([getDashboard(db, month), getRecentTransactions(db, 5)]);
  const { summary: s, carry } = d;
  const qs = month === currentMonth() ? "" : `?m=${month}`;

  if (d.cats.length === 0) {
    return (
      <div className="mx-auto max-w-[760px]">
        <h1 className="mb-6 text-2xl font-medium">Selamat datang</h1>
        <Card className="p-6">
          <p className="text-base font-medium">Impor data dari spreadsheet</p>
          <p className="mt-1 text-sm text-muted">Transaksi, budget, pos tabungan, dan goal akan diimpor sekaligus.</p>
          <Link href="/pengaturan#import" className={cn(buttonClass("primary"), "mt-5")}>Impor file .xlsx</Link>
        </Card>
      </div>
    );
  }

  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const catGroup = new Map(d.cats.map((c) => [c.id, c.group]));
  const t = today();
  const isCurrent = month === currentMonth();
  const days = daysInMonth(month);
  const daysLeft = isCurrent ? days - Number(t.slice(8, 10)) + 1 : 0;
  const balance = carry ? carry.closing : s.net;
  const prevName = monthName(addMonths(month, -1));
  // The budget is checked against spending in budgeted categories; the rest is shown apart.
  const split = budgetSplit(d.lines);
  const left = d.budgetTotal - split.planned;
  const attention = d.lines
    .filter((l) => l.budget > 0 && l.actual > l.budget)
    .map((l) => ({ ...l, over: l.actual - l.budget }))
    .sort((a, b) => b.over - a.over);
  const active = d.savings.goals.find((g) => g.status === "active");
  const p = d.prev;

  return (
    <div className="mx-auto max-w-[760px] lg:max-w-[1120px]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.01em]">{monthLabel(month)}</h1>
          <p className="mt-0.5 text-sm text-muted">Dibandingkan dengan {prevName}</p>
        </div>
        <MonthSwitcher month={month} path="/" compact />
      </div>

      {/* The balance first, like a bank screen; how it was reached sits beside it */}
      <BalanceCard
        label={isCurrent ? "Saldo saat ini" : `Saldo akhir ${monthLabel(month)}`}
        balance={balance}
        // Without a carry-over the balance is this month's change itself, so there is nothing to break down.
        lines={
          carry
            ? [
                { label: `Sisa ${prevName}`, amount: carry.opening, sign: null },
                { label: s.net >= 0 ? "Bertambah bulan ini" : "Berkurang bulan ini", amount: Math.abs(s.net), sign: s.net >= 0 ? "+" : "−" },
              ]
            : []
        }
        note={`Uang yang bisa dipakai. Tabungan ${rp(d.savings.total)} dihitung terpisah.`}
      />

      {/* How this month went, against last month */}
      <KpiStrip
        className="mt-4"
        items={[
          {
            label: "Pemasukan",
            value: rp(s.realIncome),
            delta: change(p.realIncome, s.realIncome, true),
            sub: s.withdraw > 0 ? <>Ditambah penarikan tabungan {rp(s.withdraw)}</> : `${prevName} ${rp(p.realIncome)}`,
          },
          {
            label: "Pengeluaran",
            value: rp(s.expense),
            delta: change(p.expense, s.expense, false),
            sub: `${prevName} ${rp(p.expense)}`,
          },
          {
            label: "Saving rate",
            value: pct(s.savingRate, 1),
            tone: s.savingRate !== null && s.savingRate < 0 ? "neg" : undefined,
            delta:
              s.savingRate !== null && p.savingRate !== null
                ? (() => {
                    // Difference in percentage points (36,3% → 35,2% = 1,1 poin), not a relative change.
                    const pts = Math.round((s.savingRate - p.savingRate) * 1000) / 10;
                    return {
                      text: `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Math.abs(pts))} poin`,
                      dir: pts > 0 ? ("up" as const) : pts < 0 ? ("down" as const) : ("flat" as const),
                      good: pts >= 0,
                    };
                  })()
                : undefined,
            sub: p.savingRate !== null ? `${prevName} ${pct(p.savingRate, 1)}` : "Porsi pemasukan yang disimpan",
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Budget, with what needs attention */}
        <Card>
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <h2 className="text-base font-medium">Budget</h2>
            <MoreLink href={`/budget${qs}`}>Detail</MoreLink>
          </div>
          {d.budgetTotal > 0 ? (
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-muted">{left >= 0 ? "Sisa" : "Melebihi"}</p>
                <p className="num text-sm text-muted">{rp(split.planned)} dari {rp(d.budgetTotal)}</p>
              </div>
              <p className={cn("num mt-0.5 text-[28px] leading-9 font-bold tracking-[-0.02em]", left < 0 && "text-neg")}>{rp(Math.abs(left))}</p>
              <PlanBar className="mt-3" spent={split.planned} plan={d.budgetTotal} marker={isCurrent ? monthProgress(month, t, days) : undefined} hue />
              <p className="num mt-2.5 text-[13px] text-muted">
                {pct(split.planned / d.budgetTotal)} terpakai
                {left >= 0 && isCurrent ? ` · sekitar ${rp(Math.floor(left / Math.max(daysLeft, 1)))}/hari untuk ${daysLeft} hari tersisa` : ""}
              </p>

              {attention.length > 0 && (
                <div className="mt-5">
                  <p className="mb-1 text-sm font-medium">Perlu perhatian</p>
                  <ul>
                    {attention.slice(0, 3).map((l) => (
                      <li key={l.categoryId} className="flex min-h-12 items-center justify-between gap-4 border-b border-rule last:border-b-0">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm"><Dot group={catGroup.get(l.categoryId)} /><span className="truncate">{catName.get(l.categoryId)}</span></p>
                          <p className="num pl-4 text-xs text-muted">{rp(l.actual)} dari {rp(l.budget)}</p>
                        </div>
                        <p className="num shrink-0 text-sm text-neg">lebih {rp(l.over)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {split.unplanned > 0 && (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-field px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">Di luar budget</p>
                    <p className="text-xs leading-5 text-muted">{split.unplannedLines.map((l) => catName.get(l.categoryId)).join(", ")}</p>
                  </div>
                  <p className="num shrink-0 text-sm font-bold">{rp(split.unplanned)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="px-5 pt-3 pb-5 text-sm text-muted">
              Budget untuk bulan ini belum diatur. <Link href={`/budget${qs}`} className="text-ink underline underline-offset-4">Atur budget</Link>
            </p>
          )}
        </Card>

        {/* Latest entries, then savings */}
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <h2 className="text-base font-medium">Transaksi terakhir</h2>
              <MoreLink href="/transaksi">Semua</MoreLink>
            </div>
            <div className="border-t border-rule">
              {recent.length ? <TxList rows={recent} grouped={false} /> : <p className="px-5 py-6 text-sm text-muted">Belum ada transaksi.</p>}
            </div>
          </Card>
          <Card className="flex items-center justify-between gap-4 px-5 py-5">
            <div className="min-w-0">
              <p className="text-sm text-muted">Tabungan</p>
              <p className="num mt-0.5 text-lg font-bold">{rp(d.savings.total)}</p>
              <p className="text-[13px] leading-5 text-muted">{active ? `${active.name}: ${pct(active.progress)} dari ${rp(active.target ?? 0)}` : "Lihat pos dan goal"}</p>
            </div>
            <MoreLink href="/tabungan">Tabungan</MoreLink>
          </Card>
        </div>
      </div>
    </div>
  );
}
