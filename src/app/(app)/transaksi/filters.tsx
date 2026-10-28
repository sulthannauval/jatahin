"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Select, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";

type Cat = { id: number; name: string; kind: "income" | "expense" };

export function TxFilters({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${path}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => push("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari catatan atau kategori…" className={cn(inputClass, "pl-9 pr-9")} aria-label="Cari" />
        {pending ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : q ? (
          <button onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink" aria-label="Hapus pencarian">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <Select value={params.get("c") ?? ""} onChange={(e) => push("c", e.target.value)} className="sm:w-56" aria-label="Filter kategori">
        <option value="">Semua kategori</option>
        <optgroup label="Pengeluaran">
          {categories.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
        <optgroup label="Pemasukan">
          {categories.filter((c) => c.kind === "income").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      </Select>
    </div>
  );
}
