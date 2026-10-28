"use client";

import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export type TxDraft = {
  id?: number;
  kind: "income" | "expense";
  categoryId?: number;
  potId?: number | null;
  date?: string;
  amount?: number;
  description?: string;
  /** Changes on every open, so the form resets. */
  nonce?: number;
};

type Toast = { id: number; text: string; tone: "ok" | "error" };
type Ctx = {
  draft: TxDraft | null;
  openTx: (d?: Partial<TxDraft>) => void;
  closeTx: () => void;
  toast: (text: string, tone?: "ok" | "error") => void;
};

const TxContext = createContext<Ctx | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
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
