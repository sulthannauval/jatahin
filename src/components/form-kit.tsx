"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ActionResult } from "@/app/actions";
import { groupDigits } from "@/lib/money";
import { useTx } from "@/components/tx-context";
import { Input } from "@/components/ui";

/** useActionState that toasts the result and runs onOk. */
export function useFormAction(fn: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>, onOk?: () => void) {
  const { toast } = useTx();
  return useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await fn(prev, fd);
    if (r.ok) { toast(r.message ?? "Tersimpan"); onOk?.(); }
    return r;
  }, null);
}

/** A bottom sheet on the phone, a centred dialog on wider screens. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium">{title}</h2>
            <button onClick={onClose} className="grid size-9 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised" aria-label="Tutup"><X className="size-4" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ErrorText({ state }: { state: ActionResult | null }) {
  return state && !state.ok ? <p role="alert" className="rounded-xl bg-[var(--pill-neg-bg)] px-3 py-2 text-sm text-[var(--pill-neg-ink)]">{state.error}</p> : null;
}

export function MoneyInput(props: { name: string; defaultValue?: number | null; placeholder?: string; id?: string }) {
  const [v, setV] = useState(props.defaultValue ? groupDigits(String(props.defaultValue)) : "");
  return <Input id={props.id} name={props.name} inputMode="numeric" value={v} placeholder={props.placeholder ?? "0"} onChange={(e) => setV(groupDigits(e.target.value))} />;
}
