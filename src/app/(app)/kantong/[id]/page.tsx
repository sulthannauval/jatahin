import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getKantong, getPotActivity } from "@/lib/queries";
import { neededPerMonth } from "@/lib/finance";
import { monthLabel, shortDate, today } from "@/lib/dates";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card, EmptyState, Progress, SectionHeader } from "@/components/ui";
import { TxList } from "@/components/tx-list";
import { AdjustmentList, KantongActions } from "../reconcile";

export const metadata: Metadata = { title: "Kantong" };

/**
 * One kantong. Its question: "how much is in it, and (for a goal) when will it be full?" The balance and the
 * actions first, then the answer in three lines, then everything that moved through it.
 */
export default async function KantongDetailPage({ params }: PageProps<"/kantong/[id]">) {
  await requireSession();
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  const db = await getDb();
  const [s, activity] = await Promise.all([getKantong(db), getPotActivity(db, id)]);
  const pot = s.pots.find((p) => p.id === id);
  if (!pot) notFound();
  const goalIndex = s.goals.findIndex((g) => g.id === id);
  const goal = goalIndex >= 0 ? s.goals[goalIndex] : undefined;
  const waitsFor = goal?.status === "queued" ? s.goals[goalIndex - 1] : undefined;
  const need = goal && goal.status !== "done" ? neededPerMonth(goal.remaining, goal.targetDate, today()) : null;
  const mv = s.flows.cur.byPot.get(id);
  const adjustments = s.adjustments.filter((a) => a.potId === id);
  const spending = pot.kind === "spending";
  const kindLine = spending ? "Kantong belanja" : goal ? `Kantong tabungan · target ${goal.targetDate ? shortDate(goal.targetDate) : "tanpa tanggal"}` : "Kantong tabungan tanpa target";

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/kantong" className="-ml-1 inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink">
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Kantong
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">{pot.name}</h1>
        {goal && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-ink">{goal.status === "done" ? "Tercapai" : `Prioritas ${goalIndex + 1}`}</span>}
      </div>
      <p className="mt-0.5 mb-5 text-sm text-muted">{kindLine}{pot.note && <> · {pot.note}</>}</p>

      <Card className="px-5 py-5 sm:px-6">
        <p className="text-sm text-muted">Saldo</p>
        <p className="num mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-[34px] leading-[1.1] font-bold tracking-[-0.03em]", pot.balance < 0 && "text-neg")}>{rp(pot.balance)}</span>
          {goal && <span className="text-[15px] text-muted">dari {rp(goal.target ?? 0)}</span>}
        </p>
        {goal && (
          <>
            <Progress className="mt-4 h-2" value={goal.progress} hue label={`Progress ${pot.name}`} />
            <p className="num mt-2 text-[13px] text-muted">{goal.status === "done" ? "Target tercapai" : `${pct(goal.progress)} terkumpul, kurang ${rp(goal.remaining)}`}</p>
          </>
        )}
        <div className="mt-5"><KantongActions potId={id} name={pot.name} balance={pot.balance} spending={spending} /></div>
      </Card>

      {goal && goal.status !== "done" && (
        <section className="mt-8" aria-labelledby="eta">
          <SectionHeader id="eta" title="Kapan tercapai?" />
          <Card className="px-5 py-1 sm:px-6">
            <dl className="divide-y divide-rule text-sm">
              {need !== null && (
                <Line label="Perlu per bulan" value={`${rp(need)}/bulan`} />
              )}
              <Line label="Rata-rata 3 bulan terakhir" value={`${rp(goal.pace)}/bulan`} tone={need !== null && goal.pace < need ? "warn" : undefined} />
              <Line label={waitsFor ? `Perkiraan tercapai (setelah ${waitsFor.name})` : "Perkiraan tercapai"} value={goal.eta ? monthLabel(goal.eta) : "—"} />
            </dl>
          </Card>
          <p className="mt-2.5 text-[13px] leading-5 text-muted">
            {goal.eta
              ? "Target diisi satu per satu sesuai prioritas."
              : "Belum bisa diperkirakan: 3 bulan terakhir belum ada uang masuk."}
          </p>
        </section>
      )}

      <section className="mt-8" aria-labelledby="riwayat">
        <SectionHeader id="riwayat" title="Riwayat" note={mv ? `bulan ini masuk ${rp(mv.inflow)}, keluar ${rp(mv.outflow)}` : undefined} />
        <Card className="overflow-hidden">
          {activity.length ? <TxList rows={activity} grouped={false} pot={id} /> : <EmptyState title="Belum ada uang masuk atau keluar">Tekan Isi untuk menambah saldo.</EmptyState>}
        </Card>
        {adjustments.length > 0 && (
          <Card className="mt-3 overflow-hidden">
            <p className="px-5 pt-4 pb-1 text-sm font-medium">Penyesuaian dengan bank</p>
            <AdjustmentList items={adjustments.map((a) => ({ ...a, potName: pot.name }))} />
          </Card>
        )}
      </section>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("num shrink-0 font-bold", tone === "warn" && "text-warn")}>{value}</dd>
    </div>
  );
}
