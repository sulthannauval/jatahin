"use client";

import { dayLabel, today } from "@/lib/dates";
import { rp } from "@/lib/money";
import type { ActivityRow, TransferRow, TxRow } from "@/lib/queries";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTx, type TxDraft } from "./tx-context";

export const UTAMA = "Kantong Utama";
/** "Dana Darurat → Utama": short, since the arrow already says it's a move. */
export const moveLabel = (r: TransferRow) => `${r.fromName ?? "Utama"} → ${r.toName ?? "Utama"}`;
const rowKey = (r: ActivityRow) => `${r.type}-${r.id}`;

/**
 * Two-line rows: what it was (the note, which is what people remember) over its category, amount on the right.
 * Income green with a plus; spending in ink. Money moved between kantong is grey, without a sign, since it is neither.
 * Grouped, each day is its own card under a small date line with the day's spending.
 */
export function TxList({ rows, grouped = true, pot }: { rows: ActivityRow[]; grouped?: boolean; /** Seen from one kantong: moves read "Ke …" or "Dari …" with a sign. */ pot?: number }) {
  const t = today();
  if (!grouped) {
    return (
      <ul>
        {rows.map((r) => <Item key={rowKey(r)} row={r} sub={dayLabel(r.date, t)} pot={pot} />)}
      </ul>
    );
  }
  const groups: { date: string; rows: ActivityRow[]; out: number; in: number }[] = [];
  for (const r of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== r.date) groups.push((g = { date: r.date, rows: [], out: 0, in: 0 }));
    g.rows.push(r);
    if (r.type === "tx") { if (r.kind === "income") g.in += r.amount; else g.out += r.amount; }
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.date} aria-label={dayLabel(g.date, t)}>
          <div className="mb-1.5 flex items-baseline justify-between px-1 text-[13px] text-muted">
            <h3 className="font-medium">{dayLabel(g.date, t)}</h3>
            <span className="num space-x-2.5">
              {g.in > 0 && <span className="text-pos">+{rp(g.in)}</span>}
              {g.out > 0 && <span>−{rp(g.out)}</span>}
            </span>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">{g.rows.map((r) => <Item key={rowKey(r)} row={r} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Item({ row, sub, pot }: { row: ActivityRow; sub?: string; pot?: number }) {
  return row.type === "tx" ? <TxItem row={row} sub={sub} /> : <MoveItem row={row} sub={sub} pot={pot} />;
}

function MoveItem({ row: r, sub: date, pot }: { row: TransferRow; sub?: string; pot?: number }) {
  const { openTx } = useTx();
  const out = pot !== undefined && r.fromPotId === pot;
  const title = pot === undefined ? moveLabel(r) : out ? `Ke ${r.toName ?? UTAMA}` : `Dari ${r.fromName ?? UTAMA}`;
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        onClick={() => openTx({ id: r.id, kind: "transfer", fromPotId: r.fromPotId, toPotId: r.toPotId, date: r.date, amount: r.amount, description: r.note })}
        className="flex min-h-14 w-full cursor-pointer items-center gap-4 px-4 py-2.5 text-left sm:px-5 transition-colors hover:bg-raised/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] leading-5"><ArrowRightLeft className="size-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden /><span className="truncate">{title}</span></span>
          <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-muted">{r.note || "Pindah kantong"}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("num block text-[15px]", pot === undefined ? "text-muted" : out ? "" : "text-pos")}>{pot === undefined ? "" : out ? "−" : "+"}{rp(r.amount)}</span>
          {date && <span className="block text-xs text-muted">{date}</span>}
        </span>
      </button>
    </li>
  );
}

function TxItem({ row: r, sub: date }: { row: TxRow; sub?: string }) {
  const { openTx } = useTx();
  const income = r.kind === "income";
  const title = r.description || r.categoryName;
  const sub = [r.description ? r.categoryName : null, r.potName].filter(Boolean).join(" · ");
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        onClick={() => openTx({ id: r.id, kind: r.kind, categoryId: r.categoryId, potId: r.potId, date: r.date, amount: r.amount, description: r.description })}
        className="flex min-h-14 w-full cursor-pointer items-center gap-4 px-4 py-2.5 text-left sm:px-5 transition-colors hover:bg-raised/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-5">{title}</span>
          {sub && <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-muted">{sub}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("num block text-[15px] font-medium", income && "text-pos")}>{income ? "+" : ""}{rp(r.amount)}</span>
          {date && <span className="block text-xs text-muted">{date}</span>}
        </span>
      </button>
    </li>
  );
}

export function AddTxButton({ label, draft, variant = "secondary", className, children }: { label: string; draft?: Partial<TxDraft>; variant?: "primary" | "ink" | "secondary" | "quiet"; className?: string; children?: React.ReactNode }) {
  const { openTx } = useTx();
  return (
    <button
      onClick={() => openTx(draft)}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-full font-medium transition-[opacity,background-color] active:scale-[0.98]",
        variant === "primary" && "h-10 bg-primary px-4 text-sm text-on-primary hover:opacity-90",
        variant === "ink" && "h-9 gap-1.5 bg-ink px-3.5 text-[13px] text-surface hover:opacity-85",
        variant === "secondary" && "h-8 bg-active px-3 text-[13px] hover:bg-control/60",
        variant === "quiet" && "h-8 px-2.5 text-[13px] text-ink-2 hover:bg-raised hover:text-ink",
        className,
      )}
    >
      {children}
      {label}
    </button>
  );
}
