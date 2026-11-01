import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard, getRecentActivity } from "@/lib/queries";
import { getBalanceReserve, getBillReminders, type BalanceReserve } from "@/lib/bill-queries";
import { currentMonth, daysInMonth, isMonthKey, monthLabel, monthName, addMonths, shortDate, today } from "@/lib/dates";
import { budgetSplit, monthProgress } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Check, ChevronRight } from "lucide-react";
import { Card, MoreLink, PanelHeader, PlanBar, Progress, SectionHeader, buttonClass } from "@/components/ui";
import { KpiStrip, change } from "@/components/kpi";
import { BalanceCard } from "@/components/balance";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxList } from "@/components/tx-list";
import { BillReminders } from "@/components/bill-reminders";

/**
 * One question: "how much money do I have?" Kantong Utama answers it first, like a bank screen; the other kantong
 * sit in a strip under it. Then the month in two figures, the jatah with what needs attention, and the latest
 * entries. The saving rate and everything else live on /laporan.
 */
const STRIP_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const db = await getDb();
  const [d, recent, bills, reserve] = await Promise.all([getDashboard(db, month), getRecentActivity(db, 5), getBillReminders(db, today()), getBalanceReserve(db, today())]);
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

      {/* Tagihan waiting today come before anything else, on the current month only */}
      {isCurrent && <BillReminders data={bills} />}

      {/* The balance first, like a bank screen; how it was reached sits beside it */}
      <BalanceCard
        label={isCurrent ? "Saldo Kantong Utama" : `Saldo Kantong Utama akhir ${monthName(month)}`}
        balance={balance}
        // Without a carry-over the balance is this month's change itself, so there is nothing to break down.
        lines={
          carry
            ? [
                { label: `Sisa ${prevName}`, amount: carry.opening, sign: null },
                { label: utamaChange >= 0 ? "Naik bulan ini" : "Turun bulan ini", amount: Math.abs(utamaChange), sign: utamaChange >= 0 ? "+" : "−" },
              ]
            : []
        }
        note="Siap dipakai. Uang di kantong lain terpisah."
        reserve={isCurrent && reserve ? <Reserved balance={balance} r={reserve} /> : undefined}
      />

      {/* The other kantong, swiped sideways on a phone */}
      {k.pots.length > 0 && (
        <section className="mt-6" aria-labelledby="h-kantong">
          <SectionHeader id="h-kantong" title="Kantong lain" note={rp(k.total - k.utama)} more={<MoreLink href="/kantong">Semua kantong</MoreLink>} />
          {/* One row on a wide screen: as many columns as kantong (up to five), the rest behind "Semua kantong" */}
          <ul className={cn("no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:overflow-visible lg:[&>li:nth-child(n+6)]:hidden", STRIP_COLS[Math.min(k.pots.length, 5)])}>
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
            sub: s.fromSavings > 0 ? `${rp(s.fromSavings)} pakai tabungan` : `${prevName} ${rp(p.expense)}`,
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* The jatah, with what needs attention: one card, so its label sits inside */}
        <Card className="px-5 py-5" aria-labelledby="h-jatah">
          <div className="flex items-center justify-between gap-3">
            <h2 id="h-jatah" className="text-sm text-muted">Jatah belanja {monthName(month)}</h2>
            <MoreLink href={`/jatah${qs}`}>Lihat</MoreLink>
          </div>
          {d.budgetTotal > 0 ? (
            <>
              <p className={cn("num mt-1 text-[22px] leading-8 font-bold tracking-[-0.02em]", left < 0 && "text-neg")}>{left >= 0 ? "Sisa" : "Lewat"} {rp(Math.abs(left))}</p>
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
            <p className="mt-2 text-sm text-muted">
              Jatah bulan ini belum diatur. <Link href={`/jatah${qs}`} className="text-ink underline underline-offset-4">Atur jatah</Link>
            </p>
          )}
        </Card>

        <Card className="overflow-hidden" aria-labelledby="h-recent">
          <PanelHeader id="h-recent" title="Transaksi terakhir" more={<MoreLink href="/transaksi">Semua</MoreLink>} />
          {recent.length ? <TxList rows={recent} grouped={false} /> : <p className="px-5 py-6 text-sm text-muted">Belum ada transaksi.</p>}
        </Card>
      </div>
    </div>
  );
}

/**
 * Under the balance: how much of it tagihan are already waiting for until the next salary, and what is free to
 * spend. The bar shows the same split. Once everything is paid, one quiet line says so.
 */
function Reserved({ balance, r }: { balance: number; r: NonNullable<BalanceReserve> }) {
  const day = (d: string) => shortDate(d).replace(/ \d{4}$/, "");
  const until = !r.payday ? "bulan ini" : r.salaryRecorded ? `sebelum ${day(r.until)}` : "sebelum gajian";
  const free = balance - r.total;
  const link = "group mt-3 flex items-center gap-3 border-t border-rule pt-3 text-[13px] leading-5";
  if (r.count === 0) {
    return (
      <Link href="/transaksi/tagihan" className={link}>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-muted">
          <Check className="size-3.5 shrink-0 text-pos" strokeWidth={2.5} />
          Tagihan beres {r.payday ? `sampai gajian ${day(r.until)}` : "bulan ini"}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
      </Link>
    );
  }
  const freeShare = balance > 0 ? Math.max(0, Math.min(1, free / balance)) : 0;
  return (
    <>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${rp(Math.max(free, 0))} bebas dari ${rp(Math.max(balance, 0))}`}>
        <span className="h-full bg-hue" style={{ width: `${freeShare * 100}%` }} />
        <span className="h-full bg-grey-mark" style={{ width: `${(1 - freeShare) * 100}%` }} />
      </div>
      <Link href="/transaksi/tagihan" className={link}>
        <span className="num min-w-0 flex-1">
          {free >= 0 ? (
            <span className="block font-semibold text-pos">{rp(free)} bebas dipakai</span>
          ) : (
            <span className="block font-semibold text-neg">Kurang {rp(-free)} untuk tagihan</span>
          )}
          <span className="block text-muted">{rp(r.total)} untuk {r.count} tagihan {until}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
      </Link>
    </>
  );
}
