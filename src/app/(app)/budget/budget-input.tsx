"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { copyBudgets, setBudget } from "@/app/actions";
import { groupDigits } from "@/lib/money";
import { useTx } from "@/components/tx-context";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export function BudgetInput({ month, categoryId, value, label }: { month: string; categoryId: number; value: number; label: string }) {
  const initial = value ? groupDigits(String(value)) : "";
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useTx();

  const commit = () => {
    if (v === saved) return;
    start(async () => {
      const r = await setBudget(month, categoryId, v);
      if (r.ok) { setSaved(v); setDone(true); setTimeout(() => setDone(false), 1200); }
      else { toast(r.error, "error"); setV(saved); }
    });
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted">Rp</span>
      <input
        value={v}
        inputMode="numeric"
        placeholder="0"
        aria-label={`Budget ${label}`}
        onChange={(e) => setV(groupDigits(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(saved); } }}
        className={cn(
          "num h-10 w-full rounded-xl border border-transparent bg-field pr-7 pl-8 lg:h-9 text-right text-sm outline-none transition-[background-color,border-color] hover:bg-active/70 focus:border-control focus:bg-surface",
        )}
      />
      <span className="absolute top-1/2 right-2 -translate-y-1/2">
        {pending ? <Loader2 className="size-3.5 animate-spin text-muted" /> : done ? <Check className="size-3.5 text-pos" /> : null}
      </span>
    </div>
  );
}

export function CopyBudgetButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  const { toast } = useTx();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => {
        const r = await copyBudgets(month);
        toast(r.ok ? r.message ?? "Disalin" : r.error, r.ok ? "ok" : "error");
      })}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
      Salin dari bulan sebelumnya
    </Button>
  );
}
