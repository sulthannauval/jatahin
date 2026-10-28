import type { Metadata } from "next";
import { ChartPie, ChevronDown, PiggyBank, TrendingUp } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/queries";
import { addMonths, currentMonth, isMonthKey, monthLabel, monthName } from "@/lib/dates";
import { monthInsights } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, SectionHeader } from "@/components/ui";
import { KpiStrip, change } from "@/components/kpi";
import { MonthSwitcher } from "@/components/month-switcher";
import { TrendChart, TrendLegend } from "@/components/charts/trend-chart";
import { TrendTable } from "@/components/dashboard-tables";
import { Composition } from "@/components/composition";

export const metadata: Metadata = { title: "Laporan" };

/**
 * One question per section: how did the month go (figures), what stands out (findings), where did the money go
 * (composition by type, opening to categories), how is it moving (six months). The sheet-style table is on request.
 */
export default async function ReportPage({ searchParams }: PageProps<"/laporan">) {
  await requireSession();
  const { m } = await searchParams;
  const month = isMonthKey(m) ? m : currentMonth();
  const d = await getDashboard(await getDb(), month);
  const { summary: s, prev: p } = d;
  const prevName = monthName(addMonths(month, -1));
  const insights = monthInsights(s, p, d.cats, rp, prevName);
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
          { label: "Pemasukan", value: rp(s.realIncome), delta: change(p.realIncome, s.realIncome, true), sub: s.withdraw > 0 ? `Ditambah penarikan tabungan ${rp(s.withdraw)}` : `${prevName} ${rp(p.realIncome)}` },
          { label: "Pengeluaran", value: rp(s.expense), delta: change(p.expense, s.expense, false), sub: `${prevName} ${rp(p.expense)}` },
          { label: "Selisih", value: `${s.net > 0 ? "+" : ""}${rp(s.net)}`, tone: s.net < 0 ? "neg" : undefined, sub: "Pemasukan dikurangi pengeluaran" },
          {
            label: "Saving rate",
            value: pct(s.savingRate, 1),
            tone: s.savingRate !== null && s.savingRate < 0 ? "neg" : undefined,
            sub: p.savingRate !== null ? `${prevName} ${pct(p.savingRate, 1)}` : "Porsi pemasukan yang disimpan",
          },
        ]}
      />

      {/* What stands out */}
      {insights.length > 0 && (
        <section className="mt-8" aria-labelledby="sorotan">
          <SectionHeader id="sorotan" title="Sorotan" note="temuan otomatis dari data bulan ini" />
          <div className="grid gap-3 sm:grid-cols-3">
            {insights.map((i) => {
              const Icon = i.kind === "growth" ? TrendingUp : i.kind === "saving" ? PiggyBank : ChartPie;
              return (
                <Card key={i.title} className="p-5">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full",
                      i.tone === "neg" ? "bg-[var(--pill-neg-bg)] text-[var(--pill-neg-ink)]" : i.tone === "pos" ? "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]" : "bg-brand-soft text-brand",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-4" strokeWidth={2} />
                  </span>
                  <p className="mt-3 text-[15px] leading-6 font-medium">{i.title}</p>
                  <p className="num mt-1 text-sm leading-5 text-muted">{i.detail}</p>
                </Card>
              );
            })}
          </div>
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
              <dt className="text-sm text-muted">
                Rata-rata pemasukan
                <span className="block text-xs">tanpa penarikan tabungan</span>
              </dt>
              <dd className="num text-base font-bold sm:mt-1">{rp(avgIn)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-5 py-4 sm:block">
              <dt className="text-sm text-muted">Rata-rata pengeluaran</dt>
              <dd className="num text-base font-bold sm:mt-1">{rp(avgOut)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-5 py-4 sm:block">
              <dt className="text-sm text-muted">
                Total selisih {months.length} bulan
                <span className="block text-xs">termasuk penarikan tabungan</span>
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
          <p className="px-5 pt-4 text-sm text-muted">Sisa setiap bulan menjadi saldo awal bulan berikutnya.</p>
          <div className="mt-3"><TrendTable rows={d.table} month={month} /></div>
        </Card>
      </details>
    </div>
  );
}
