"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
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
  const [menu, setMenu] = useState(false);
  // On wider screens the menu sits under the chip; on a phone it spans the width.
  const [menuLeft, setMenuLeft] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
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
    <div ref={wrapRef} className="relative" style={{ "--menu-left": `${menuLeft}px` } as React.CSSProperties}>
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
          <button
            type="button"
            onClick={(e) => {
              const chipBox = e.currentTarget.getBoundingClientRect();
              const box = wrapRef.current!.getBoundingClientRect();
              setMenuLeft(Math.max(0, Math.min(chipBox.left - box.left, box.width - 288)));
              setMenu((v) => !v);
            }}
            aria-expanded={menu} aria-controls="cat-menu" className={cn(chip(!!cat), "pr-2.5")}>
            <span className="max-w-40 truncate">{cat ? categories.find((c) => String(c.id) === cat)?.name ?? "Kategori" : "Kategori"}</span>
            <ChevronDown className={cn("size-3.5 transition-transform", menu && "rotate-180")} strokeWidth={2} />
          </button>
        )}
      </div>
      {menu && type !== "pindah" && (
        <CategoryMenu
          categories={shown}
          value={cat}
          onPick={(v) => { setMenu(false); push({ c: v }); }}
          onClose={() => setMenu(false)}
        />
      )}
    </div>
  );
}

/**
 * The category filter as a list (not a native select), so it can end with "Atur kategori": the categories are
 * managed from where they are filtered.
 */
function CategoryMenu({ categories, value, onPick, onClose }: { categories: Cat[]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    // The chip toggles it itself; any other tap outside closes it.
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('[aria-controls="cat-menu"]')) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Next tick, so the tap that opened it doesn't close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", away));
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  const needle = q.trim().toLowerCase();
  const found = needle ? categories.filter((c) => c.name.toLowerCase().includes(needle)) : categories;
  const row = (on: boolean) => cn("flex h-10 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm transition-colors hover:bg-field", on ? "text-ink" : "text-ink-2");

  return (
    <div ref={ref} id="cat-menu" className="absolute top-full left-0 z-30 mt-2 w-full overflow-hidden rounded-2xl bg-elevated shadow-[0_12px_32px_rgb(0_0_0/0.14),0_0_0_1px_var(--border)] sm:left-[var(--menu-left)] sm:w-72">
      <label className="flex h-11 items-center gap-2 border-b border-rule px-3">
        <Search className="size-4 text-muted" strokeWidth={1.75} />
        <span className="sr-only">Cari kategori</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kategori…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      <div className="max-h-72 overflow-y-auto p-1">
        {!needle && (
          <button type="button" onClick={() => onPick("")} className={row(!value)}>
            Semua kategori {!value && <Check className="size-4" strokeWidth={2} />}
          </button>
        )}
        {(["expense", "income"] as const).map((k) => {
          const list = found.filter((c) => c.kind === k);
          return list.length ? (
            <div key={k} role="group" aria-label={k === "expense" ? "Pengeluaran" : "Pemasukan"}>
              <p className="px-3 pt-2 pb-1 text-[11px] text-muted">{k === "expense" ? "Pengeluaran" : "Pemasukan"}</p>
              {list.map((c) => (
                <button key={c.id} type="button" onClick={() => onPick(String(c.id))} className={row(value === String(c.id))}>
                  <span className="truncate">{c.name}</span>
                  {value === String(c.id) && <Check className="size-4 shrink-0" strokeWidth={2} />}
                </button>
              ))}
            </div>
          ) : null;
        })}
        {found.length === 0 && <p className="px-3 py-3 text-sm text-muted">Tidak ditemukan.</p>}
      </div>
      <Link href="/transaksi/kategori" className="flex h-11 items-center justify-between border-t border-rule px-4 text-sm text-ink-2 transition-colors hover:bg-field hover:text-ink">
        Atur kategori <ChevronRight className="size-4" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
