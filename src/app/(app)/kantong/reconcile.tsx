"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { deleteAdjustment, reconcilePot, type ActionResult } from "@/app/actions";
import { parseBalance, rp } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { useTx } from "@/components/tx-context";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib/cn";

/** The "match with the bank" dialog for one pot, opened by its parent. */
export function ReconcileDialog({ open, onClose, potId, name, balance }: { open: boolean; onClose: () => void; potId: number; name: string; balance: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby={`rc-${potId}`}>
      {open && <ReconcileForm potId={potId} name={name} balance={balance} onDone={onClose} />}
    </dialog>
  );
}

/**
 * The things to do with one kantong: put money in, take it out, pay from it (spending kantong), match it with the bank.
 * "Isi" is the one filled button.
 */
export function KantongActions({ potId, name, balance, spending }: { potId: number; name: string; balance: number; spending: boolean }) {
  const { openTx } = useTx();
  const [matching, setMatching] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => openTx({ kind: "transfer", fromPotId: null, toPotId: potId })}>Isi</Button>
      {spending && <Button size="sm" variant="secondary" onClick={() => openTx({ kind: "expense", potId })}>Bayar</Button>}
      <Button size="sm" variant="secondary" onClick={() => openTx({ kind: "transfer", fromPotId: potId, toPotId: null })}>Ambil</Button>
      <Button size="sm" variant="ghost" onClick={() => setMatching(true)}>Cocokkan saldo bank</Button>
      <ReconcileDialog open={matching} onClose={() => setMatching(false)} potId={potId} name={name} balance={balance} />
    </div>
  );
}

function ReconcileForm({ potId, name, balance, onDone }: { potId: number; name: string; balance: number; onDone: () => void }) {
  const { toast } = useTx();
  const [bank, setBank] = useState("");
  const parsed = parseBalance(bank);
  const diff = parsed === null ? null : parsed - balance;
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await reconcilePot(prev, fd);
    if (r.ok) { toast(r.message ?? "Tersimpan"); onDone(); }
    return r;
  }, null);

  return (
    <form action={action} className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <input type="hidden" name="potId" value={potId} />
      <div className="mb-5 flex items-center justify-between">
        <h2 id={`rc-${potId}`} className="text-base font-medium">Cocokkan {name}</h2>
        <button type="button" onClick={onDone} className="grid size-9 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised" aria-label="Tutup"><X className="size-4" /></button>
      </div>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">Saldo tercatat</span>
        <span className="num font-bold">{rp(balance)}</span>
      </div>

      <div className="mt-4">
        <Label htmlFor={`bank-${potId}`}>Saldo di bank saat ini</Label>
        <Input id={`bank-${potId}`} name="bankBalance" inputMode="decimal" autoComplete="off" placeholder="Contoh: 6.781,72" value={bank} onChange={(e) => setBank(e.target.value)} autoFocus required aria-describedby={`bank-hint-${potId}`} />
        <p id={`bank-hint-${potId}`} className="mt-1.5 text-xs text-muted">Sesuai angka di aplikasi bank. Sen dibulatkan.</p>
      </div>

      <div className="mt-4 flex min-h-11 items-center justify-between rounded-xl bg-raised/60 px-4 text-sm">
        <span className="text-muted">Selisih</span>
        <span className={cn("num font-bold", diff !== null && diff !== 0 && (diff > 0 ? "text-pos" : "text-neg"))}>
          {diff === null ? "—" : diff === 0 ? "Sesuai" : `${diff > 0 ? "+" : "−"}${rp(Math.abs(diff))}`}
        </span>
      </div>

      {diff !== null && diff !== 0 && (
        <div className="mt-4">
          <Label htmlFor={`note-${potId}`}>Catatan</Label>
          <Input id={`note-${potId}`} name="note" placeholder="Selisih bank" maxLength={120} />
          <p className="mt-1.5 text-xs text-muted">Selisihnya disimpan sebagai penyesuaian, bukan pemasukan atau pengeluaran.</p>
        </div>
      )}

      {state && !state.ok && <p role="alert" className="mt-4 rounded-xl bg-[var(--pill-neg-bg)] px-3 py-2 text-sm text-[var(--pill-neg-ink)]">{state.error}</p>}

      <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending || parsed === null}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {diff === 0 ? "Tandai sesuai" : "Simpan penyesuaian"}
      </Button>
    </form>
  );
}

export function AdjustmentList({ items }: { items: { id: number; potName: string; date: string; amount: number; note: string }[] }) {
  const { toast } = useTx();
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-rule">
      {items.map((a) => (
        <li key={a.id} className="flex min-h-12 items-center gap-3 px-5 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{a.note || "Penyesuaian"} · {a.potName}</span>
            <span className="block text-xs text-muted">{shortDate(a.date)}</span>
          </span>
          <span className={cn("num", a.amount > 0 ? "text-pos" : "text-neg")}>{a.amount > 0 ? "+" : "−"}{rp(Math.abs(a.amount))}</span>
          <button
            disabled={pending}
            onClick={() => start(async () => { const r = await deleteAdjustment(a.id); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
            className="h-8 cursor-pointer rounded-full px-2 text-[13px] text-muted hover:bg-raised hover:text-neg"
          >
            Hapus
          </button>
        </li>
      ))}
    </ul>
  );
}
