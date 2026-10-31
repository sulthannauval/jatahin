"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";

type Cat = { id: number; name: string; kind: "income" | "expense" };

export const TYPES = [
  { key: "", label: "Semua" },
  { key: "keluar", label: "Keluar" },
  { key: "masuk", label: "Masuk" },
  { key: "pindah", label: "Pindah" },
] as const;

/** Search, then one row of chips: the kind of entry, and a category menu styled as a chip. */
export function TxFilters({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const type = params.get("t") ?? "";
  const cat = params.get("c") ?? "";

  const push = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    start(() => router.replace(`${path}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => push({ q: q.trim() }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (on: boolean) => cn(
    "flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-3.5 text-[13px] transition-colors",
    on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:bg-raised hover:text-ink",
  );
  // Moves have no category, so picking one leaves "Pindah" and picking "Pindah" clears the category.
  const shown = categories.filter((c) => (type === "masuk" ? c.kind === "income" : type === "keluar" ? c.kind === "expense" : true));

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari catatan, misalnya “kopi”" className={cn(inputClass, "rounded-2xl border-line bg-surface pr-9 pl-10")} aria-label="Cari" />
        {pending ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : q ? (
          <button onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink" aria-label="Hapus pencarian">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Jenis">
        {TYPES.map((t) => (
          <button key={t.key} type="button" aria-pressed={type === t.key} onClick={() => push({ t: t.key, ...(t.key === "pindah" ? { c: "" } : {}) })} className={chip(type === t.key)}>
            {t.label}
          </button>
        ))}
        {type !== "pindah" && (
          <label className={cn(chip(!!cat), "relative pr-8")}>
            <span className="max-w-40 truncate">{cat ? categories.find((c) => String(c.id) === cat)?.name ?? "Kategori" : "Kategori"}</span>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5" strokeWidth={2} />
            <select value={cat} onChange={(e) => push({ c: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Filter kategori">
              <option value="">Semua kategori</option>
              {(["expense", "income"] as const).map((k) => {
                const list = shown.filter((c) => c.kind === k);
                return list.length ? (
                  <optgroup key={k} label={k === "expense" ? "Pengeluaran" : "Pemasukan"}>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
