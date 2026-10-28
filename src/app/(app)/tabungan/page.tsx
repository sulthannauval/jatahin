import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getCategories, getRecentTransactions, getSavings } from "@/lib/queries";
import { addMonths, monthLabel, monthName, shortDate, today } from "@/lib/dates";
import { neededPerMonth } from "@/lib/finance";
import { KpiStrip, change } from "@/components/kpi";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge, Card, MoreLink, Progress, SectionHeader } from "@/components/ui";
import { AddTxButton, TxList } from "@/components/tx-list";
import { AdjustmentList, PotActions } from "./reconcile";
import { Table, Td, Th, TotalRow } from "@/components/table";

export const metadata: Metadata = { title: "Tabungan" };

/** One question: "how far is the goal I'm saving for now?" Then the queue, the pots, and the sheet's table on request. */
export default async function SavingsPage() {
  await requireSession();
  const db = await getDb();
  const [s, cats, recent] = await Promise.all([getSavings(db), getCategories(db), getRecentTransactions(db, 4, true)]);
  const deposit = cats.find((c) => c.role === "saving_deposit");
  const withdraw = cats.find((c) => c.role === "saving_withdraw");
  const notes = new Map(s.pots.map((p) => [p.id, p.note]));
  const sum = (f: (x: (typeof s.details)[number]) => number) => s.details.reduce((a, x) => a + f(x), 0);
  const active = s.goals.find((g) => g.status === "active");

  const t = today();
  const f = s.flows;
  const prevName = monthName(addMonths(f.month, -1));
  const goalById = new Map(s.goals.map((g, i) => [g.id, { g, n: i + 1 }]));
  const need = active ? neededPerMonth(active.remaining, active.targetDate, t) : null;

  return (
    <div className="mx-auto max-w-[760px] lg:max-w-[1120px]">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-[-0.01em]">Tabungan</h1>
        <p className="mt-0.5 text-sm text-muted">Aktivitas {monthLabel(f.month)} dibandingkan dengan {prevName}</p>
      </div>

      {/* Where the money in savings went this month */}
      <KpiStrip
        items={[
          { label: "Total tabungan", value: rp(s.total), sub: `Saldo saat ini di ${s.pots.length} pos` },
          { label: "Setoran bulan ini", value: rp(f.cur.deposits), delta: change(f.prev.deposits, f.cur.deposits, true), sub: `${prevName} ${rp(f.prev.deposits)}` },
          { label: "Penarikan bulan ini", value: rp(f.cur.withdrawals), delta: change(f.prev.withdrawals, f.cur.withdrawals, false), sub: `${prevName} ${rp(f.prev.withdrawals)}` },
          {
            label: "Perubahan bersih",
            value: `${f.cur.net > 0 ? "+" : ""}${rp(f.cur.net)}`,
            tone: f.cur.net < 0 ? "neg" : f.cur.net > 0 ? "pos" : undefined,
            sub: f.cur.net < 0 ? "Penarikan melebihi setoran" : f.cur.net > 0 ? "Tabungan bertambah" : "Tidak ada perubahan",
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {/* The goal being saved for now, with the numbers that explain it */}
          <Card className="p-5 sm:p-6">
            {active ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">Prioritas saat ini · Goal {goalById.get(active.id)?.n}{active.overdue && <> · <span className="text-warn">melewati target</span></>}</p>
                    <p className="mt-0.5 text-lg font-medium">{active.name}</p>
                    {notes.get(active.id) && <p className="text-[13px] leading-5 text-ink-2">{notes.get(active.id)}</p>}
                  </div>
                  {deposit && <AddTxButton className="shrink-0" label="Setor" draft={{ kind: "expense", categoryId: deposit.id, potId: active.id }} variant="primary" />}
                </div>
                <p className="num mt-2 text-[28px] leading-9 font-bold tracking-[-0.02em]">
                  {rp(active.balance)}
                  <span className="ml-2 text-[15px] font-normal tracking-normal text-muted">dari {rp(active.target ?? 0)}</span>
                </p>
                <Progress className="mt-3 h-2" value={active.progress} hue label={`Progress ${active.name}`} />
                <p className="num mt-2 text-[13px] text-muted">{pct(active.progress)} terkumpul{active.targetDate && <> · target {shortDate(active.targetDate)}</>}</p>

                <dl className="mt-5 grid grid-cols-1 gap-2 rounded-xl bg-field p-4 sm:grid-cols-3 sm:gap-3">
                  <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                    <dt className="text-xs text-muted">Kekurangan</dt>
                    <dd className="num mt-0.5 text-[15px] font-bold">{rp(active.remaining)}</dd>
                  </div>
                  <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                    <dt className="text-xs text-muted">Kebutuhan per bulan</dt>
                    <dd className="num mt-0.5 text-[15px] font-bold">{need !== null ? rp(need) : "—"}</dd>
                  </div>
                  <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                    <dt className="text-xs text-muted">Rata-rata 3 bulan</dt>
                    <dd className={cn("num mt-0.5 text-[15px] font-bold", need !== null && active.pace < need && "text-warn")}>{rp(active.pace)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[13px] leading-5 text-muted">
                  {need !== null && <>Untuk mencapai target pada {shortDate(active.targetDate!)}, dibutuhkan sekitar <span className="num text-ink-2">{rp(need)}</span> per bulan. </>}
                  {active.eta
                    ? <>Berdasarkan rata-rata setoran bersih tiga bulan terakhir (<span className="num text-ink-2">{rp(active.pace)}</span>/bulan), target diperkirakan tercapai pada <span className="text-ink-2">{monthLabel(active.eta)}</span>.</>
                    : <>Belum ada setoran bersih dalam tiga bulan terakhir, sehingga perkiraan waktu belum tersedia.</>}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Goal</p>
                <p className="mt-1 text-[15px]">{s.goals.length ? "Semua goal telah tercapai." : <>Belum ada goal. <Link href="/pengaturan#pos" className="text-brand underline underline-offset-4">Tetapkan target pada salah satu pos</Link>.</>}</p>
              </>
            )}
          </Card>

          {/* The queue, with progress and what each goal waits for */}
          {/* The goals after the current one (the current one is the card above), in the order they'll be saved for */}
          {s.goals.some((g) => g.id !== active?.id) && (
            <section aria-labelledby="queue">
              <SectionHeader id="queue" title={active ? "Goal berikutnya" : "Goal"} note="diselesaikan berurutan" more={<MoreLink href="/pengaturan#pos">Atur</MoreLink>} />
              <ol className="rounded-2xl border border-line bg-surface">
                {s.goals.map((g, i) => g.id === active?.id ? null : (
                  <li key={g.id} className="border-b border-rule px-5 py-3.5 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className={cn("num grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium", g.status === "active" ? "bg-brand text-on-brand" : g.status === "done" ? "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]" : "bg-field text-muted")}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{g.name}</span>
                          {g.status === "done" && <Badge tone="pos">Tercapai</Badge>}
                          {g.status === "active" && <Badge tone="hue">Prioritas</Badge>}
                        </div>
                        <p className="num text-xs text-muted">
                          {g.status === "queued" && i > 0 ? `Dimulai setelah ${s.goals[i - 1].name}` : g.targetDate ? `Target ${shortDate(g.targetDate)}` : "Tanpa tanggal target"}
                          {g.eta && g.status !== "done" && ` · perkiraan ${monthLabel(g.eta)}`}
                        </p>
                      </div>
                      <p className="num shrink-0 text-right text-sm">{rp(g.balance)} <span className="text-muted">/ {rp(g.target ?? 0)}</span></p>
                    </div>
                    <div className="mt-2.5 pl-9"><Progress className="h-1" value={g.progress} hue={g.status === "active"} label={`Progress ${g.name}`} /></div>
                  </li>
                ))}
              </ol>
            </section>
          )}

        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          {/* Pots: balance, what kind of pot it is, and this month's movement */}
          <section aria-labelledby="pots">
            <SectionHeader id="pots" title="Pos tabungan" note={`total ${rp(s.total)}`} more={<MoreLink href="/pengaturan#pos">Atur</MoreLink>} />
            <ul className="rounded-2xl border border-line bg-surface">
              {s.pots.map((p) => {
                const goal = goalById.get(p.id);
                const mv = f.cur.byPot.get(p.id);
                return (
                  <li key={p.id} className="flex min-h-16 items-center gap-3 border-b border-rule px-5 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs leading-5 text-muted sm:truncate">
                        {goal ? `Goal ${goal.n} · ${pct(goal.g.progress)} dari ${rp(goal.g.target ?? 0)}` : "Tanpa target"}
                        {mv ? ` · Bulan ini: ${[mv.deposits ? `setor ${rp(mv.deposits)}` : "", mv.withdrawals ? `tarik ${rp(mv.withdrawals)}` : ""].filter(Boolean).join(", ")}` : " · Tidak ada aktivitas bulan ini"}
                      </p>
                    </div>
                    <span className={cn("num text-sm font-bold", p.balance === 0 && "font-normal text-muted")}>{rp(p.balance)}</span>
                    <PotActions potId={p.id} name={p.name} balance={p.balance} depositId={deposit?.id} withdrawId={withdraw?.id} />
                  </li>
                );
              })}
            </ul>
          </section>
          {recent.length > 0 && (
            <section aria-labelledby="recent-saving">
              <SectionHeader id="recent-saving" title="Aktivitas tabungan terakhir" more={<MoreLink href="/transaksi">Semua</MoreLink>} />
              <div className="overflow-hidden rounded-2xl border border-line bg-surface"><TxList rows={recent} grouped={false} /></div>
            </section>
          )}
        </div>
      </div>

      {/* The spreadsheet's table, on request */}
      <details className="group mt-8">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
          Rincian saldo per pos (format spreadsheet)
        </summary>
        <Card className="mt-3 overflow-hidden">
          <Table>
            <thead>
              <tr><Th>Keterangan</Th>{s.pots.map((p) => <Th key={p.id} num>{p.name}</Th>)}<Th num>Total</Th></tr>
            </thead>
            <tbody>
              <tr><Td>Saldo acuan</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.openingBalance && "text-muted")}>{rp(x.openingBalance)}</Td>)}<Td num>{rp(sum((x) => x.openingBalance))}</Td></tr>
              <tr><Td>Tanggal acuan</Td>{s.details.map((x) => <Td key={x.potId} num className="text-ink-2">{x.openingDate ? shortDate(x.openingDate) : <span className="text-muted">—</span>}</Td>)}<Td /></tr>
              <tr><Td>Setor</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.deposits && "text-muted")}>{x.deposits ? "+" : ""}{rp(x.deposits)}</Td>)}<Td num>+{rp(sum((x) => x.deposits))}</Td></tr>
              <tr><Td>Tarik</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.withdrawals && "text-muted")}>{x.withdrawals ? "−" : ""}{rp(x.withdrawals)}</Td>)}<Td num>−{rp(sum((x) => x.withdrawals))}</Td></tr>
              <tr><Td>Penyesuaian</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.adjusted && "text-muted")}>{x.adjusted > 0 ? "+" : x.adjusted < 0 ? "−" : ""}{rp(Math.abs(x.adjusted))}</Td>)}<Td num>{rp(sum((x) => x.adjusted))}</Td></tr>
              <TotalRow><Td>Saldo saat ini</Td>{s.details.map((x) => <Td key={x.potId} num>{rp(x.balance)}</Td>)}<Td num>{rp(s.total)}</Td></TotalRow>
              <tr><Td className="text-muted">Total penarikan sejak awal</Td>{s.details.map((x) => <Td key={x.potId} num className="text-muted">{rp(x.withdrawnAllTime)}</Td>)}<Td num className="text-muted">{rp(sum((x) => x.withdrawnAllTime))}</Td></tr>
            </tbody>
          </Table>
          {s.adjustments.length > 0 && (
            <div className="border-t border-line">
              <p className="px-5 pt-4 pb-1 text-sm font-medium">Penyesuaian</p>
              <AdjustmentList items={s.adjustments.map((a) => ({ ...a, potName: s.pots.find((p) => p.id === a.potId)?.name ?? "—" }))} />
            </div>
          )}
        </Card>
      </details>
    </div>
  );
}
