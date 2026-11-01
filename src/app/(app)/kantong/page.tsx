import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getKantong, getPots, getRecentActivity, type KantongData } from "@/lib/queries";
import { monthLabel, shortDate } from "@/lib/dates";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Goal } from "@/lib/finance";
import { Card, MoreLink, PanelHeader, Progress, SectionHeader } from "@/components/ui";
import { AddTxButton, TxList } from "@/components/tx-list";
import { AdjustmentList } from "./reconcile";
import { HiddenKantong, NewKantongButton } from "./kantong-form";
import { Table, Td, Th, TotalRow } from "@/components/table";

export const metadata: Metadata = { title: "Kantong" };

/**
 * One question: "where is my money kept?" The total first, then Kantong Utama, then each kantong as a card
 * (saving ones with their target, spending ones apart). Each card opens its own page.
 */
export default async function KantongPage() {
  await requireSession();
  const db = await getDb();
  const [s, recent, allPots] = await Promise.all([getKantong(db), getRecentActivity(db, 5, true), getPots(db, true)]);
  const hidden = allPots.filter((p) => p.archived);
  const saving = s.pots.filter((p) => p.kind === "saving");
  const spending = s.pots.filter((p) => p.kind === "spending");
  const goals = new Map(s.goals.map((g, i) => [g.id, { g, n: i + 1, prev: s.goals[i - 1] }]));
  const sum = (f: (x: KantongData["details"][number]) => number) => s.details.reduce((a, x) => a + f(x), 0);

  return (
    <div className="mx-auto max-w-[760px] lg:max-w-[1120px]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Kantong</h1>
        <AddTxButton label="Pindahkan" variant="ink" draft={{ kind: "transfer" }}>
          <ArrowRightLeft className="size-3.5" strokeWidth={2} />
        </AddTxButton>
      </div>
      <p className="mt-0.5 mb-5 text-sm text-muted">Pisahkan uang sesuai tujuannya.</p>

      {/* The answer, then the kantong everything is paid from */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="px-5 py-5 sm:px-6">
          <p className="text-sm text-muted">Total di semua kantong</p>
          <p className={cn("num mt-1.5 text-[34px] leading-[1.1] font-bold tracking-[-0.03em]", s.total < 0 && "text-neg")}>{rp(s.total)}</p>
          <p className="mt-2 text-[13px] text-muted">Kantong Utama dan {s.pots.length} kantong lain</p>
        </Card>
        <Link href="/transaksi" className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-5 transition-colors hover:bg-raised/50 sm:px-6">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Kantong Utama</p>
            <p className="mt-0.5 text-[13px] leading-5 text-muted">Gaji masuk, belanja keluar dari sini</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn("num text-xl font-bold tracking-[-0.02em]", s.utama < 0 && "text-neg")}>{rp(s.utama)}</span>
            <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
          </div>
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="k-saving">
        <SectionHeader id="k-saving" title="Tabungan" note={`${saving.length} kantong · ${rp(s.savingTotal)}`} more={<NewKantongButton />} />
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {saving.map((p) => {
            const goal = goals.get(p.id);
            return (
              <PotCard key={p.id} id={p.id} name={p.name} balance={p.balance} tag={goal?.g.status === "active" ? "Prioritas" : goal?.g.status === "done" ? "Tercapai" : undefined}>
                {goal ? (
                  <>
                    <Progress className="mt-2 h-1" value={goal.g.progress} hue={goal.g.status === "active"} label={`Progress ${p.name}`} />
                    <p className="mt-2">{pct(goal.g.progress)} dari {rp(goal.g.target ?? 0)}</p>
                    <p>{goalLine(goal.g, goal.prev)}</p>
                  </>
                ) : (
                  <p className="mt-auto pt-2">Tanpa target</p>
                )}
              </PotCard>
            );
          })}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="k-spending">
        <SectionHeader id="k-spending" title="Belanja" note={spending.length ? `${spending.length} kantong` : undefined} more={spending.length ? <NewKantongButton kind="spending" /> : undefined} />
        {spending.length ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {spending.map((p) => {
              const mv = s.flows.cur.byPot.get(p.id);
              return (
                <PotCard key={p.id} id={p.id} name={p.name} balance={p.balance}>
                  <p className="mt-auto pt-2">{mv?.outflow ? `Terpakai ${rp(mv.outflow)} bulan ini` : "Belum dipakai bulan ini"}</p>
                </PotCard>
              );
            })}
          </ul>
        ) : (
          <NewKantongButton kind="spending" className="block w-full cursor-pointer rounded-2xl border-[1.5px] border-dashed border-control px-5 py-4 text-left text-[13px] leading-5 text-ink-2 transition-colors hover:bg-raised/50">
            <span className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-ink"><Plus className="size-4" strokeWidth={2} /> Buat kantong belanja</span>
            Contoh: Makan, Transport. Isi di awal bulan, bayar dari situ.
          </NewKantongButton>
        )}
      </section>

      {recent.length > 0 && (
        <Card className="mt-8 overflow-hidden" aria-labelledby="k-recent">
          <PanelHeader id="k-recent" title="Aktivitas terakhir" more={<MoreLink href="/transaksi">Semua</MoreLink>} />
          <TxList rows={recent} grouped={false} />
        </Card>
      )}

      {hidden.length > 0 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
            {hidden.length} kantong disembunyikan
          </summary>
          <Card className="mt-3 overflow-hidden"><HiddenKantong pots={hidden} /></Card>
        </details>
      )}

      {/* The spreadsheet's table, on request */}
      {s.pots.length > 0 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
            Rincian saldo per kantong (format spreadsheet)
          </summary>
          <Card className="mt-3 overflow-x-auto">
            <Table>
              <thead>
                <tr><Th>Keterangan</Th>{s.pots.map((p) => <Th key={p.id} num>{p.name}</Th>)}<Th num>Total</Th></tr>
              </thead>
              <tbody>
                <tr><Td>Saldo acuan</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.openingBalance && "text-muted")}>{rp(x.openingBalance)}</Td>)}<Td num>{rp(sum((x) => x.openingBalance))}</Td></tr>
                <tr><Td>Tanggal acuan</Td>{s.details.map((x) => <Td key={x.potId} num className="text-ink-2">{x.openingDate ? shortDate(x.openingDate) : <span className="text-muted">—</span>}</Td>)}<Td /></tr>
                <tr><Td>Masuk</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.inflow && "text-muted")}>{x.inflow ? "+" : ""}{rp(x.inflow)}</Td>)}<Td num>+{rp(sum((x) => x.inflow))}</Td></tr>
                <tr><Td>Keluar</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.outflow && "text-muted")}>{x.outflow ? "−" : ""}{rp(x.outflow)}</Td>)}<Td num>−{rp(sum((x) => x.outflow))}</Td></tr>
                <tr><Td>Penyesuaian</Td>{s.details.map((x) => <Td key={x.potId} num className={cn(!x.adjusted && "text-muted")}>{x.adjusted > 0 ? "+" : x.adjusted < 0 ? "−" : ""}{rp(Math.abs(x.adjusted))}</Td>)}<Td num>{rp(sum((x) => x.adjusted))}</Td></tr>
                <TotalRow><Td>Saldo saat ini</Td>{s.details.map((x) => <Td key={x.potId} num>{rp(x.balance)}</Td>)}<Td num>{rp(s.total - s.utama)}</Td></TotalRow>
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
      )}
    </div>
  );
}

/** When a goal is reached, or what it waits for. */
function goalLine(g: Goal, prev: Goal | undefined) {
  if (g.status === "done") return "Target tercapai";
  if (g.status === "queued" && prev) return `Setelah ${prev.name}`;
  if (g.targetDate) return `Target ${shortDate(g.targetDate)}`;
  return g.eta ? `Perkiraan ${monthLabel(g.eta)}` : "Tanpa tanggal target";
}

function PotCard({ id, name, balance, tag, children }: { id: number; name: string; balance: number; tag?: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={`/kantong/${id}`} className="flex h-full min-h-32 flex-col rounded-2xl border border-line bg-surface p-3.5 text-xs leading-[1.45] text-muted transition-colors hover:bg-raised/50 sm:p-4">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          {tag && <span className="rounded-full bg-brand-soft px-2 py-px text-[11px] font-medium text-brand-ink">{tag}</span>}
        </span>
        <span className={cn("num mt-1 text-lg font-bold tracking-[-0.02em] text-ink", balance === 0 && "text-ink-2", balance < 0 && "text-neg")}>{rp(balance)}</span>
        {children}
      </Link>
    </li>
  );
}
