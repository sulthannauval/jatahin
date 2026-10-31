"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MoreHorizontal, X } from "lucide-react";
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

/** One "⋯" per pot row: Setor, Ambil, Cocokkan saldo. */
export function PotActions({ potId, name, balance }: { potId: number; name: string; balance: number }) {
  const { openTx } = useTx();
  const [menu, setMenu] = useState(false);
  const [matching, setMatching] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);
  const item = "flex h-10 w-full cursor-pointer items-center whitespace-nowrap rounded-xl px-3 text-left text-sm text-ink-2 transition-colors hover:bg-field hover:text-ink";
  return (
    <div ref={box} className="relative">
      <button onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} aria-label={`Aksi ${name}`} className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink">
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {menu && (
        <div role="menu" className="absolute top-10 right-0 z-20 w-56 rounded-2xl border border-line bg-elevated p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.18)]">
          <button role="menuitem" className={item} onClick={() => { setMenu(false); openTx({ kind: "transfer", fromPotId: null, toPotId: potId }); }}>Isi dari Kantong Utama</button>
          <button role="menuitem" className={item} onClick={() => { setMenu(false); openTx({ kind: "transfer", fromPotId: potId, toPotId: null }); }}>Ambil ke Kantong Utama</button>
          <button role="menuitem" className={item} onClick={() => { setMenu(false); setMatching(true); }}>Cocokkan saldo bank</button>
        </div>
      )}
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
        <p id={`bank-hint-${potId}`} className="mt-1.5 text-xs text-muted">Masukkan sesuai yang tertera di aplikasi bank. Nilai sen akan dibulatkan.</p>
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
          <p className="mt-1.5 text-xs text-muted">Disimpan sebagai penyesuaian saldo kantong dan tidak dihitung sebagai pemasukan atau pengeluaran.</p>
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
