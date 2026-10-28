"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dot } from "./ui";

export type PickerOption = { id: number; name: string; group?: string };
export type PickerSection = { title: string; options: PickerOption[] };

/**
 * A row in a grouped list that opens into a searchable list right below it (inline, so a sheet never clips it).
 * Keyboard: ↑/↓ to move, Enter to choose, Esc to close.
 */
export function Picker({
  label,
  placeholder,
  sections,
  value,
  onChange,
  searchable = true,
  invalid,
}: {
  label: string;
  placeholder: string;
  sections: PickerSection[];
  value: number | null | undefined;
  onChange: (id: number) => void;
  searchable?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => sections.flatMap((s) => s.options).find((o) => o.id === value), [sections, value]);

  // Filtered sections; an option shown in several sections only counts once for keyboard moves.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sections
      .map((s) => ({ ...s, options: needle ? s.options.filter((o) => o.name.toLowerCase().includes(needle)) : s.options }))
      .filter((s) => s.options.length);
  }, [sections, q]);
  const flat = useMemo(() => {
    const seen = new Set<number>();
    const out: PickerOption[] = [];
    for (const s of filtered) for (const o of s.options) if (!seen.has(o.id)) { seen.add(o.id); out.push(o); }
    return out;
  }, [filtered]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => (searchable ? searchRef.current : listRef.current)?.focus());
  }, [open, searchable]);

  const toggle = () => {
    if (!open) {
      // Start from a clear search with the current choice highlighted.
      setQ("");
      const all = sections.flatMap((sec) => sec.options);
      const seen = new Set<number>();
      const order = all.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
      setActive(Math.max(0, order.findIndex((o) => o.id === value)));
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (id: number) => {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[active]) choose(flat[active].id); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
  };

  const optionIndex = new Map(flat.map((o, i) => [o.id, i]));

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 text-left"
      >
        <span className="w-20 shrink-0 text-[13px] text-muted">{label}</span>
        <span className={cn("flex min-w-0 flex-1 items-center gap-2 text-[15px]", selected ? "text-ink" : invalid ? "text-neg" : "text-muted/70")}>
          {selected?.group && <Dot group={selected.group} />}
          <span className="truncate">{selected?.name ?? placeholder}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-elevated shadow-[0_0_0_1px_var(--border)]" onKeyDown={onKey}>
          {searchable && (
            <label className="flex h-10 items-center gap-2 border-b border-rule px-3">
              <Search className="size-4 text-muted" strokeWidth={1.75} />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                placeholder={`Cari ${label.toLowerCase()}…`}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={flat[active] ? `${listId}-${flat[active].id}` : undefined}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </label>
          )}
          <div ref={listRef} id={listId} role="listbox" tabIndex={-1} aria-label={label} className="max-h-64 overflow-y-auto p-1 outline-none">
            {filtered.length === 0 && <p className="px-3 py-3 text-sm text-muted">Tidak ditemukan.</p>}
            {filtered.map((s) => (
              <div key={s.title} role="group" aria-label={s.title} className="pb-1">
                {sections.length > 1 && <p className="px-3 pt-2 pb-1 text-[11px] text-muted">{s.title}</p>}
                {s.options.map((o) => {
                  const idx = optionIndex.get(o.id) ?? -1;
                  const isActive = idx === active;
                  const isSel = o.id === value;
                  return (
                    <div
                      key={`${s.title}-${o.id}`}
                      id={`${listId}-${o.id}`}
                      data-index={idx}
                      role="option"
                      aria-selected={isSel}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(o.id)}
                      className={cn("flex h-10 cursor-pointer items-center justify-between rounded-lg px-3 text-sm transition-colors", isActive ? "bg-field text-ink" : "text-ink-2")}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">{o.group && <Dot group={o.group} />}<span className="truncate">{o.name}</span></span>
                      {isSel && <Check className="size-4 shrink-0 text-ink" strokeWidth={2} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
