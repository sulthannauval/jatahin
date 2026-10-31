"use client";

import { dayLabel, today } from "@/lib/dates";
import { rp } from "@/lib/money";
import type { ActivityRow, TransferRow, TxRow } from "@/lib/queries";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dot } from "./ui";
import { useTx, type TxDraft } from "./tx-context";

export const UTAMA = "Kantong Utama";
/** "Dana Darurat → Kantong Utama" */
export const moveLabel = (r: TransferRow) => `${r.fromName ?? UTAMA} → ${r.toName ?? UTAMA}`;
const rowKey = (r: ActivityRow) => `${r.type}-${r.id}`;

/**
 * Two-line rows: category over the note, amount on the right. Income green with a plus; spending in ink.
 * Money moved between kantong is grey, without a sign, since it is neither.
 */
export function TxList({ rows, grouped = true }: { rows: ActivityRow[]; grouped?: boolean }) {
  const t = today();
  if (!grouped) {
    return (
      <ul>
        {rows.map((r) => <Item key={rowKey(r)} row={r} sub={dayLabel(r.date, t)} />)}
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
  // One panel; each day is a small header row, not a card of its own.
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {groups.map((g) => (
        <section key={g.date} aria-label={dayLabel(g.date, t)} className="border-t border-line first:border-t-0">
          <div className="flex h-9 items-center justify-between bg-raised/50 px-5 text-xs">
            <h3 className="font-medium text-ink-2">{dayLabel(g.date, t)}</h3>
            <span className="num space-x-2.5 text-muted">
              {g.in > 0 && <span className="text-pos">+{rp(g.in)}</span>}
              {g.out > 0 && <span>−{rp(g.out)}</span>}
            </span>
          </div>
          <ul>{g.rows.map((r) => <Item key={rowKey(r)} row={r} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Item({ row, sub }: { row: ActivityRow; sub?: string }) {
  return row.type === "tx" ? <TxItem row={row} sub={sub} /> : <MoveItem row={row} sub={sub} />;
}

function MoveItem({ row: r, sub: date }: { row: TransferRow; sub?: string }) {
  const { openTx } = useTx();
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        onClick={() => openTx({ id: r.id, kind: "transfer", fromPotId: r.fromPotId, toPotId: r.toPotId, date: r.date, amount: r.amount, description: r.note })}
        className="flex min-h-14 w-full cursor-pointer items-center gap-4 px-5 py-2.5 text-left transition-colors hover:bg-raised/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm"><ArrowRightLeft className="size-3 shrink-0 text-muted" strokeWidth={2} aria-hidden /><span className="truncate">{moveLabel(r)}</span></span>
          <span className="block truncate pl-5 text-xs text-muted">{r.note || "Pindah kantong"}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-sm text-muted">{rp(r.amount)}</span>
          {date && <span className="block text-xs text-muted">{date}</span>}
        </span>
      </button>
    </li>
  );
}

function TxItem({ row: r, sub: date }: { row: TxRow; sub?: string }) {
  const { openTx } = useTx();
  const income = r.kind === "income";
  const note = [r.potName, r.description].filter(Boolean).join(" · ");
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        onClick={() => openTx({ id: r.id, kind: r.kind, categoryId: r.categoryId, potId: r.potId, date: r.date, amount: r.amount, description: r.description })}
        className="flex min-h-14 w-full cursor-pointer items-center gap-4 px-5 py-2.5 text-left transition-colors hover:bg-raised/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm"><Dot group={r.group} /><span className="truncate">{r.categoryName}</span></span>
          {note && <span className="block truncate pl-4 text-xs text-muted">{note}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("num block text-sm font-medium", income && "text-pos")}>{income ? "+" : ""}{rp(r.amount)}</span>
          {date && <span className="block text-xs text-muted">{date}</span>}
        </span>
      </button>
    </li>
  );
}

export function AddTxButton({ label, draft, variant = "secondary", className }: { label: string; draft?: Partial<TxDraft>; variant?: "primary" | "secondary" | "quiet"; className?: string }) {
  const { openTx } = useTx();
  return (
    <button
      onClick={() => openTx(draft)}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-full font-medium transition-[opacity,background-color] active:scale-[0.98]",
        variant === "primary" && "h-10 bg-primary px-4 text-sm text-on-primary hover:opacity-90",
        variant === "secondary" && "h-8 bg-active px-3 text-[13px] hover:bg-control/60",
        variant === "quiet" && "h-8 px-2.5 text-[13px] text-ink-2 hover:bg-raised hover:text-ink",
        className,
      )}
    >
      {label}
    </button>
  );
}
