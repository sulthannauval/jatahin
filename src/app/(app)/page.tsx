import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard, getRecentActivity } from "@/lib/queries";
import { currentMonth, daysInMonth, isMonthKey, monthLabel, monthName, addMonths, today } from "@/lib/dates";
import { budgetSplit, monthProgress } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, MoreLink, PlanBar, Progress, SectionHeader, buttonClass } from "@/components/ui";
import { KpiStrip, change } from "@/components/kpi";
import { BalanceCard } from "@/components/balance";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxList } from "@/components/tx-list";

/**
 * One question: "how much money do I have?" Kantong Utama answers it first, like a bank screen; the other kantong
 * sit in a strip under it. Then the month in two figures, the jatah with what needs attention, and the latest
 * entries. The saving rate and everything else live on /laporan.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const db = await getDb();
  const [d, recent] = await Promise.all([getDashboard(db, month), getRecentActivity(db, 5)]);
  const { summary: s, prev: p, carry, kantong: k } = d;
  const qs = month === currentMonth() ? "" : `?m=${month}`;

  if (d.cats.length === 0) {
    return (
      <div className="mx-auto max-w-[760px]">
        <h1 className="mb-6 text-2xl font-medium">Selamat datang</h1>
        <Card className="p-6">
          <p className="text-base font-medium">Impor data dari spreadsheet</p>
          <p className="mt-1 text-sm text-muted">Transaksi, jatah, kantong, dan target akan diimpor sekaligus.</p>
          <Link href="/pengaturan#import" className={cn(buttonClass("primary"), "mt-5")}>Impor file .xlsx</Link>
        </Card>
      </div>
    );
  }

  const t = today();
  const isCurrent = month === currentMonth();
  const days = daysInMonth(month);
  const daysLeft = isCurrent ? days - Number(t.slice(8, 10)) + 1 : 0;
  // Kantong Utama: income and spending in it, plus money moved in from or out to other kantong.
  const utamaChange = s.net + d.moved;
  const balance = carry ? carry.closing : utamaChange;
  const prevName = monthName(addMonths(month, -1));
  // The jatah is checked against spending in categories that have one; the rest is shown apart.
  const split = budgetSplit(d.lines);
  const left = d.budgetTotal - split.planned;
  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const over = d.lines.filter((l) => l.budget > 0 && l.actual > l.budget).sort((a, b) => b.actual - b.budget - (a.actual - a.budget));
  const goals = new Map(k.goals.map((g) => [g.id, g]));

  return (
    <div className="mx-auto max-w-[760px] lg:max-w-[1120px]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">{monthLabel(month)}</h1>
        <MonthSwitcher month={month} path="/" compact />
      </div>

      {/* The balance first, like a bank screen; how it was reached sits beside it */}
      <BalanceCard
        label={isCurrent ? "Saldo Kantong Utama" : `Saldo Kantong Utama akhir ${monthName(month)}`}
        balance={balance}
        // Without a carry-over the balance is this month's change itself, so there is nothing to break down.
        lines={
          carry
            ? [
                { label: `Sisa ${prevName}`, amount: carry.opening, sign: null },
                { label: utamaChange >= 0 ? "Bertambah bulan ini" : "Berkurang bulan ini", amount: Math.abs(utamaChange), sign: utamaChange >= 0 ? "+" : "−" },
              ]
            : []
        }
        note="Siap dipakai untuk belanja. Uang di kantong lain dihitung terpisah."
      />

      {/* The other kantong, swiped sideways on a phone */}
      {k.pots.length > 0 && (
        <section className="mt-6" aria-labelledby="h-kantong">
          <SectionHeader id="h-kantong" title="Kantong lain" note={rp(k.total - k.utama)} more={<MoreLink href="/kantong">Semua kantong</MoreLink>} />
          <ul className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
            {k.pots.map((pt) => {
              const g = goals.get(pt.id);
              return (
                <li key={pt.id} className="w-40 shrink-0 lg:w-auto">
                  <Link href={`/kantong/${pt.id}`} className="flex h-full flex-col rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-raised/50">
                    <span className="truncate text-[13px] font-medium">{pt.name}</span>
                    <span className={cn("num mt-0.5 text-base font-bold tracking-[-0.01em]", pt.balance === 0 && "text-ink-2", pt.balance < 0 && "text-neg")}>{rp(pt.balance)}</span>
                    {g ? (
                      <>
                        <Progress className="mt-2 h-1" value={g.progress} hue={g.status === "active"} label={`Progress ${pt.name}`} />
                        <span className="num mt-1.5 text-xs text-muted">{pct(g.progress)} dari {rp(g.target ?? 0)}</span>
                      </>
                    ) : (
                      <span className="mt-auto pt-1.5 text-xs text-muted">{pt.kind === "spending" ? "Kantong belanja" : "Tanpa target"}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The month in two figures, against last month */}
      <KpiStrip
        className="mt-6"
        items={[
          { label: "Pemasukan", value: rp(s.income), delta: change(p.income, s.income, true), sub: `${prevName} ${rp(p.income)}` },
          {
            label: "Pengeluaran",
            value: rp(s.expense),
            delta: change(p.expense, s.expense, false),
            sub: s.fromSavings > 0 ? `${rp(s.fromSavings)} dibayar dari tabungan` : `${prevName} ${rp(p.expense)}`,
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* The jatah, with what needs attention */}
        <section aria-labelledby="h-jatah">
          <SectionHeader id="h-jatah" title="Jatah belanja" more={<MoreLink href={`/jatah${qs}`}>Jatah</MoreLink>} />
          <Card className="px-5 py-5">
            {d.budgetTotal > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn("num text-[22px] leading-8 font-bold tracking-[-0.02em]", left < 0 && "text-neg")}>{left >= 0 ? "Sisa" : "Lewat"} {rp(Math.abs(left))}</p>
                  {over.length > 0 && <p className="shrink-0 text-[13px] text-muted">{over.length} kategori lewat</p>}
                </div>
                <PlanBar className="mt-3" spent={split.planned} plan={d.budgetTotal} marker={isCurrent ? monthProgress(month, t, days) : undefined} hue />
                <p className="num mt-2.5 text-[13px] text-muted">
                  {rp(split.planned)} dari {rp(d.budgetTotal)}
                  {left > 0 && isCurrent ? ` · sekitar ${rp(Math.floor(left / Math.max(daysLeft, 1)))}/hari` : ""}
                </p>
                {over.length > 0 && (
                  <ul className="mt-4 border-t border-rule">
                    {over.slice(0, 3).map((l) => (
                      <li key={l.categoryId} className="flex min-h-11 items-center justify-between gap-4 border-b border-rule py-2 last:border-b-0">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{catName.get(l.categoryId)}</span>
                          <span className="num block text-xs text-muted">{rp(l.actual)} dari {rp(l.budget)}</span>
                        </span>
                        <span className="num shrink-0 text-sm text-neg">lebih {rp(l.actual - l.budget)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                Jatah untuk bulan ini belum diatur. <Link href={`/jatah${qs}`} className="text-ink underline underline-offset-4">Atur jatah</Link>
              </p>
            )}
          </Card>
        </section>

        <section aria-labelledby="h-recent">
          <SectionHeader id="h-recent" title="Transaksi terakhir" more={<MoreLink href="/transaksi">Semua</MoreLink>} />
          <Card className="overflow-hidden">
            {recent.length ? <TxList rows={recent} grouped={false} /> : <p className="px-5 py-6 text-sm text-muted">Belum ada transaksi.</p>}
          </Card>
        </section>
      </div>
    </div>
  );
}
