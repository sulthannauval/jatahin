import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/queries";
import { addMonths, currentMonth, isMonthKey, monthLabel, monthName } from "@/lib/dates";
import { categoryChanges } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, Dot, SectionHeader } from "@/components/ui";
import { Table, Td, Th } from "@/components/table";
import { KpiStrip, change } from "@/components/kpi";
import { MonthSwitcher } from "@/components/month-switcher";
import { TrendChart, TrendLegend } from "@/components/charts/trend-chart";
import { TrendTable } from "@/components/dashboard-tables";
import { Composition } from "@/components/composition";

export const metadata: Metadata = { title: "Laporan" };

/**
 * One question per section: how did the month go (figures), which categories moved, where did the money go
 * (composition by type, opening to categories), how is it moving (six months). The sheet-style table is on request.
 */
export default async function ReportPage({ searchParams }: PageProps<"/laporan">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const d = await getDashboard(await getDb(), month);
  const { summary: s, prev: p } = d;
  const prevName = monthName(addMonths(month, -1));
  const changes = categoryChanges(s, p, d.cats);
  const months = d.trend.filter((t) => t.income > 0 || t.expense > 0);
  const avgIn = months.length ? Math.round(months.reduce((a, t) => a + t.income, 0) / months.length) : 0;
  const avgOut = months.length ? Math.round(months.reduce((a, t) => a + t.expense, 0) / months.length) : 0;
  const totalNet = months.reduce((a, t) => a + t.net, 0);

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.01em]">Laporan <span className="text-muted">{monthLabel(month)}</span></h1>
          <p className="mt-0.5 text-sm text-muted">Dibandingkan dengan {prevName}</p>
        </div>
        <MonthSwitcher month={month} path="/laporan" compact />
      </div>

      {/* How the month went */}
      <KpiStrip
        items={[
          { label: "Pemasukan", value: rp(s.income), delta: change(p.income, s.income, true), sub: `${prevName} ${rp(p.income)}` },
          { label: "Pengeluaran", value: rp(s.expense), delta: change(p.expense, s.expense, false), sub: s.fromSavings > 0 ? `${rp(s.fromSavings)} dibayar dari tabungan` : `${prevName} ${rp(p.expense)}` },
          { label: "Selisih", value: `${s.net > 0 ? "+" : ""}${rp(s.net)}`, tone: s.net < 0 ? "neg" : undefined, sub: "Pemasukan dikurangi pengeluaran" },
          {
            label: "Saving rate",
            value: pct(s.savingRate, 1),
            tone: s.savingRate !== null && s.savingRate < 0 ? "neg" : undefined,
            sub: p.savingRate !== null ? `${prevName} ${pct(p.savingRate, 1)}` : "Porsi pemasukan yang disimpan",
          },
        ]}
      />

      {/* Which categories moved */}
      {changes.length > 0 && (
        <section className="mt-8" aria-labelledby="perubahan">
          <SectionHeader id="perubahan" title="Perubahan terbesar" note={`per kategori, dibandingkan dengan ${prevName}`} />
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
                <tr><Th>Kategori</Th><Th num>{prevName}</Th><Th num>{monthName(month)}</Th><Th num>Selisih</Th></tr>
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
        <SectionHeader id="komposisi" title="Komposisi pengeluaran" note="buka tiap tipe untuk melihat kategorinya" />
        <Card className="p-5 sm:p-6">
          <Composition cur={s} prev={p} cats={d.cats} prevLabel={prevName} />
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
