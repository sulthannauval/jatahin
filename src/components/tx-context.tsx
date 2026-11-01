"use client";

import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export type TxDraft = {
  id?: number;
  /** "transfer": money moved between kantong. */
  kind: "income" | "expense" | "transfer";
  categoryId?: number;
  /** The kantong the money left or arrived in. Null: Kantong Utama. */
  potId?: number | null;
  /** For a transfer. Null: Kantong Utama. */
  fromPotId?: number | null;
  toPotId?: number | null;
  date?: string;
  amount?: number;
  description?: string;
  /** Recorded from a tagihan reminder: the tagihan and month it pays. */
  billId?: number;
  billMonth?: string;
  /** Changes on every open, so the form resets. */
  nonce?: number;
};

/** A button in the toast, such as "Bukan ini" after a tagihan was marked paid on its own. */
export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "ok" | "error"; action?: ToastAction };
type Ctx = {
  draft: TxDraft | null;
  openTx: (d?: Partial<TxDraft>) => void;
  closeTx: () => void;
  toast: (text: string, tone?: "ok" | "error", action?: ToastAction) => void;
};

const TxContext = createContext<Ctx | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok", action?: ToastAction) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
    // A toast with a button stays long enough to reach it.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 3200);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const openTx = useCallback((d?: Partial<TxDraft>) => setDraft({ kind: "expense", ...d, nonce: ++seq.current }), []);
  const closeTx = useCallback(() => setDraft(null), []);
  const value = useMemo(() => ({ draft, openTx, closeTx, toast }), [draft, openTx, closeTx, toast]);

  return (
    <TxContext value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-on-primary shadow-lg">
            {t.tone === "ok" ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action!.run(); dismiss(t.id); }}
                className="-my-1 -mr-2 ml-1 h-8 shrink-0 cursor-pointer rounded-full px-3 text-[13px] font-semibold underline-offset-4 hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </TxContext>
  );
}

export function useTx() {
  const ctx = use(TxContext);
  if (!ctx) throw new Error("useTx must be used inside TxProvider");
  return ctx;
}
