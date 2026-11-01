import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import Link from "next/link";
import { getDashboard, getReport } from "@/lib/queries";
import { addMonths, currentMonth, isMonthKey, monthLabel, monthName, today } from "@/lib/dates";
import { rangeLabel } from "@/lib/report";
import { categoryChanges } from "@/lib/finance";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, Dot, SectionHeader } from "@/components/ui";
import { Table, Td, Th } from "@/components/table";
import { PaceChart } from "@/components/charts/pace-chart";
import { MonthSwitcher } from "@/components/month-switcher";
import { TrendChart, TrendLegend } from "@/components/charts/trend-chart";
import { TrendTable } from "@/components/dashboard-tables";
import { Composition } from "@/components/composition";

export const metadata: Metadata = { title: "Laporan" };

/**
 * One question: is this month going better or worse than usual, and where? Spending so far against the same days
 * of last month (whole months once a month is over), then where the money went, which categories moved and six
 * months of trend. The sheet-style table is on request.
 */
export default async function ReportPage({ searchParams }: PageProps<"/laporan">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const db = await getDb();
  const [d, r] = await Promise.all([getDashboard(db, month), getReport(db, month, today())]);
  const s = d.summary;
  // Last month over the same days while this month runs, so the comparison is fair on the 2nd as on the 30th.
  const p = r.prevCut;
  const prevMonth = addMonths(month, -1);
  const prevName = monthName(prevMonth);
  const short = (m: string) => monthLabel(m, true).split(" ")[0];
  const curLabel = rangeLabel(r.cur, !r.running, monthName, short);
  const prevLabel = rangeLabel(r.prev, !r.running, monthName, short);
  const changes = categoryChanges(s, p, d.cats);
  const diff = s.expense - p.expense;
  const payday = d.settings.paydayDay;
  // Money flow: tagihan apart from day-to-day spending, and what went to saving kantong (less what came back out).
  const daily = Math.max(s.expense - r.tagihan, 0);
  const left = s.income - s.expense - d.savedNet;
  const months = d.trend.filter((t) => t.income > 0 || t.expense > 0);
  const avgIn = months.length ? Math.round(months.reduce((a, t) => a + t.income, 0) / months.length) : 0;
  const avgOut = months.length ? Math.round(months.reduce((a, t) => a + t.expense, 0) / months.length) : 0;
  const totalNet = months.reduce((a, t) => a + t.net, 0);

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Laporan</h1>
          <p className="mt-0.5 text-sm text-muted">{r.running ? `Bulan berjalan · hari ke-${r.day} dari ${r.days}` : `${monthLabel(month)} · dibanding ${prevName}`}</p>
        </div>
        <MonthSwitcher month={month} path="/laporan" compact />
      </div>

      {/* Early in a month, the month just finished is the one worth reading */}
      {r.running && r.day <= 7 && d.prev.expense + d.prev.income > 0 && (
        <Link href={`/laporan?m=${prevMonth}`} className="mb-3 flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-[13px] leading-5 text-[var(--pill-hue-ink)] transition-opacity hover:opacity-90 sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{prevName} sudah lengkap.</span> Pengeluaran {rp(d.prev.expense)}, pemasukan {rp(d.prev.income)}.
          </span>
          <span className="shrink-0 font-medium">Lihat ringkasan ›</span>
        </Link>
      )}

      {/* The answer: spending so far, against the same days of last month */}
      <Card className="px-5 py-5 sm:px-6">
        <p className="text-sm text-muted">Pengeluaran {curLabel}</p>
        <p className="num mt-1 text-[32px] leading-[1.15] font-bold tracking-[-0.03em]">{rp(s.expense)}</p>
        <p className="num mt-1.5 text-[13px]">
          {p.expense === 0 && s.expense === 0 ? (
            <span className="text-muted">Belum ada pengeluaran</span>
          ) : diff === 0 ? (
            <span className="text-muted">Sama dengan {prevLabel}</span>
          ) : (
            <>
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", diff < 0 ? "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]" : "bg-[var(--pill-neg-bg)] text-[var(--pill-neg-ink)]")}>
                {rp(Math.abs(diff))} {diff < 0 ? "lebih hemat" : "lebih boros"}
              </span>{" "}
              <span className="text-muted">dari {prevLabel}</span>
            </>
          )}
        </p>
        <div className="mt-4">
          <PaceChart cur={r.curDaily} prev={r.prevDaily} days={r.days} markDay={payday ?? undefined} markLabel="gajian" curName={monthName(month)} prevName={prevName} />
        </div>
      </Card>

      {/* Where this month's money went */}
      <section className="mt-8" aria-labelledby="arus">
        <SectionHeader id="arus" title="Arus uang" note={r.running ? `sampai ${curLabel}` : undefined} />
        <Card className="px-5 py-2 sm:px-6">
          <dl className="num divide-y divide-rule text-sm">
            <Flow label="Pemasukan" value={s.income} sign="+" />
            {r.tagihan > 0 && <Flow label="Tagihan" value={r.tagihan} sign="−" />}
            <Flow label={r.tagihan > 0 ? "Belanja harian" : "Pengeluaran"} value={daily} sign="−" />
            {d.savedNet !== 0 && <Flow label={d.savedNet > 0 ? "Ke tabungan" : "Diambil dari tabungan"} value={Math.abs(d.savedNet)} sign={d.savedNet > 0 ? "−" : "+"} />}
            <div className="flex items-baseline justify-between gap-4 py-2.5 font-bold">
              <dt>Sisa</dt>
              <dd className={cn(left < 0 && "text-neg")}>{left < 0 ? "−" : ""}{rp(Math.abs(left))}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {/* Which categories moved */}
      {changes.length > 0 && (
        <section className="mt-8" aria-labelledby="perubahan">
          <SectionHeader id="perubahan" title="Yang berubah" note={`per kategori, dibanding ${prevLabel}`} />
          <Card className="overflow-hidden">
            {/* Phones: a list, so the change stays visible without scrolling sideways */}
            <ul className="divide-y divide-rule sm:hidden">
              {changes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm leading-5"><Dot group={c.group} />{c.name}</p>
                    <p className="num mt-0.5 text-xs text-muted">{c.prev ? rp(c.prev) : "—"} → {c.cur ? rp(c.cur) : "—"}</p>
                  </div>
                  <span className={cn("num shrink-0 text-sm font-medium", c.diff > 0 ? "text-neg" : "text-pos")}>{c.diff > 0 ? "+" : "−"}{rp(Math.abs(c.diff))}</span>
                </li>
              ))}
            </ul>
            <Table className="hidden sm:table">
              <thead>
                <tr><Th>Kategori</Th><Th num>{prevLabel}</Th><Th num>{curLabel}</Th><Th num>Selisih</Th></tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <Td><span className="flex items-center gap-2"><Dot group={c.group} />{c.name}</span></Td>
                    <Td num className="text-ink-2">{c.prev ? rp(c.prev) : "—"}</Td>
                    <Td num>{c.cur ? rp(c.cur) : "—"}</Td>
                    <Td num className={cn("font-medium", c.diff > 0 ? "text-neg" : "text-pos")}>{c.diff > 0 ? "+" : "−"}{rp(Math.abs(c.diff))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      )}

      {/* Where the money went */}
      <section className="mt-8" aria-labelledby="komposisi">
        <SectionHeader id="komposisi" title="Ke mana uangnya" note="buka tiap tipe untuk melihat kategorinya" />
        <Card className="p-5 sm:p-6">
          <Composition cur={s} prev={p} cats={d.cats} prevLabel={prevLabel} />
        </Card>
      </section>

      {/* How it's moving */}
      <section className="mt-8" aria-labelledby="tren">
        <SectionHeader id="tren" title="Tren 6 bulan" more={<TrendLegend />} />
        <Card>
          <div className="px-3 pt-5 pb-2 sm:px-6">
            <TrendChart data={d.trend} current={month} />
          </div>
          <dl className="grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex items-baseline justify-between gap-3 px-5 py-4 sm:block">
              <dt className="text-sm text-muted">Rata-rata pemasukan</dt>
              <dd className="num text-base font-bold sm:mt-1">{rp(avgIn)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-5 py-4 sm:block">
              <dt className="text-sm text-muted">Rata-rata pengeluaran</dt>
              <dd className="num text-base font-bold sm:mt-1">{rp(avgOut)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-5 py-4 sm:block">
              <dt className="text-sm text-muted">
                Total selisih {months.length} bulan
                <span className="block text-xs">pemasukan dikurangi pengeluaran</span>
              </dt>
              <dd className={cn("num text-base font-bold sm:mt-1", totalNet < 0 && "text-neg")}>{totalNet > 0 ? "+" : ""}{rp(totalNet)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {/* The spreadsheet's table, on request */}
      <details className="group mt-8">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
          Tabel saldo per bulan (format spreadsheet)
        </summary>
        <Card className="mt-3 overflow-hidden">
          <p className="px-5 pt-4 text-sm text-muted">Saldo Kantong Utama. Sisa setiap bulan menjadi saldo awal bulan berikutnya.</p>
          <div className="mt-3"><TrendTable rows={d.table} month={month} /></div>
        </Card>
      </details>
    </div>
  );
}

function Flow({ label, value, sign }: { label: string; value: number; sign: "+" | "−" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={cn(sign === "+" && value > 0 && "text-pos")}>{value > 0 ? `${sign}${rp(value)}` : rp(0)}</dd>
    </div>
  );
}
