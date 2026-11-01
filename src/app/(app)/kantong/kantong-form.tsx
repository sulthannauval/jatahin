"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2, Pencil, Plus } from "lucide-react";
import { savePot, setPotArchived } from "@/app/actions";
import { Dialog, ErrorText, MoneyInput, useFormAction } from "@/components/form-kit";
import { useTx } from "@/components/tx-context";
import { Button, Input, Label } from "@/components/ui";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";

export type KantongFields = {
  id: number; name: string; kind: "saving" | "spending"; note: string; target: number | null; targetDate: string | null; priority: number | null;
  openingBalance: number; openingDate: string | null;
};

const pill = "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-field px-3 text-[13px] text-ink-2 transition-colors hover:bg-active hover:text-ink";

/** "Kantong baru": a quiet pill by default, or any trigger passed as children. */
export function NewKantongButton({ kind = "saving", className, children }: { kind?: KantongFields["kind"]; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? pill}>
        {children ?? <><Plus className="size-3.5" strokeWidth={2} /> Kantong baru</>}
      </button>
      <KantongDialog open={open} onClose={() => setOpen(false)} initial={{ kind }} />
    </>
  );
}

/** "Ubah" on a kantong's page. Hiding it lives in the same dialog, then goes back to the list. */
export function EditKantongButton({ pot, balance }: { pot: KantongFields; balance: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={pill}>
        <Pencil className="size-3.5" strokeWidth={1.75} /> Ubah
      </button>
      <KantongDialog open={open} onClose={() => setOpen(false)} initial={pot} balance={balance} />
    </>
  );
}

/** Hidden kantong, folded at the bottom of the list, each with a way back. */
export function HiddenKantong({ pots }: { pots: { id: number; name: string }[] }) {
  const { toast } = useTx();
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-rule">
      {pots.map((p) => (
        <li key={p.id} className="flex min-h-12 items-center gap-3 px-5 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-ink-2">{p.name}</span>
          <button
            disabled={pending}
            onClick={() => start(async () => { const r = await setPotArchived(p.id, false); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink-2 hover:bg-raised hover:text-ink"
          >
            <ArchiveRestore className="size-3.5" /> Tampilkan lagi
          </button>
        </li>
      ))}
    </ul>
  );
}

function KantongDialog({ open, onClose, initial, balance }: { open: boolean; onClose: () => void; initial: Partial<KantongFields>; balance?: number }) {
  return (
    <Dialog open={open} onClose={onClose} title={initial.id ? `Ubah ${initial.name}` : "Kantong baru"}>
      {/* Mounted only while open, so every opening starts from the saved values */}
      {open && <KantongForm initial={initial} balance={balance} onDone={onClose} />}
    </Dialog>
  );
}

function KantongForm({ initial, balance, onDone }: { initial: Partial<KantongFields>; balance?: number; onDone: () => void }) {
  const [kind, setKind] = useState<KantongFields["kind"]>(initial.kind ?? "saving");
  const [state, action, pending] = useFormAction(savePot, onDone);
  const { toast } = useTx();
  const router = useRouter();
  const [hiding, startHide] = useTransition();
  const hide = () => startHide(async () => {
    const r = await setPotArchived(initial.id!, true);
    toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error");
    if (r.ok) { onDone(); router.push("/kantong"); }
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <div><Label htmlFor="pot-name">Nama kantong</Label><Input id="pot-name" name="name" defaultValue={initial.name} required maxLength={60} autoFocus={!initial.id} /></div>
      <input type="hidden" name="kind" value={kind} />
      <div role="radiogroup" aria-label="Jenis kantong" className="grid grid-cols-2 gap-2">
        {([["saving", "Tabungan", "Disimpan, bisa diberi target"], ["spending", "Belanja", "Dibelanjakan langsung"]] as const).map(([k, title, sub]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors", kind === k ? "border-ink bg-surface" : "border-line text-ink-2 hover:bg-raised")}
          >
            <span className="block text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted">{sub}</span>
          </button>
        ))}
      </div>
      {kind === "saving" && (
        <fieldset className="rounded-xl border border-line p-3 pt-2">
          <legend className="px-1 text-xs text-ink-2">Target (boleh kosong)</legend>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="pot-target">Target (Rp)</Label><MoneyInput id="pot-target" name="target" defaultValue={initial.target} placeholder="—" /></div>
            <div><Label htmlFor="pot-prio">Prioritas</Label><Input id="pot-prio" name="priority" type="number" min={1} max={99} defaultValue={initial.priority ?? ""} /></div>
            <div className="col-span-2"><Label htmlFor="pot-date">Target tanggal</Label><Input id="pot-date" name="targetDate" type="date" defaultValue={initial.targetDate ?? ""} /></div>
          </div>
        </fieldset>
      )}
      <fieldset className="rounded-xl border border-line p-3 pt-2">
        <legend className="px-1 text-xs text-ink-2">Saldo awal (sebelum dicatat di sini)</legend>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="pot-ob">Saldo</Label><MoneyInput id="pot-ob" name="openingBalance" defaultValue={initial.openingBalance} /></div>
          <div><Label htmlFor="pot-od">Per tanggal</Label><Input id="pot-od" name="openingDate" type="date" defaultValue={initial.openingDate ?? ""} /></div>
        </div>
        <p className="mt-2 text-xs text-muted">Transaksi sejak tanggal ini ikut dihitung.</p>
      </fieldset>
      <div><Label htmlFor="pot-note">Catatan</Label><Input id="pot-note" name="note" defaultValue={initial.note} maxLength={300} /></div>
      <ErrorText state={state} />
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
      {initial.id && (
        <div className="border-t border-rule pt-4">
          <Button type="button" variant="ghost" className="w-full" disabled={hiding} onClick={hide}>
            {hiding && <Loader2 className="size-4 animate-spin" />} Sembunyikan kantong
          </Button>
          <p className="mt-1.5 text-center text-xs leading-5 text-muted">
            {balance ? `Saldo ${rp(balance)} tidak ikut dihitung selama disembunyikan. ` : ""}Riwayatnya tetap aman.
          </p>
        </div>
      )}
    </form>
  );
}
