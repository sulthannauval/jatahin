"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("mf-theme", t); } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#000000" : "#f7f8f8");
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => "light",
  );
}

/** Two-option switch: Terang / Gelap. `compact` shows a single icon button. */
export function ThemeToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const theme = useTheme();
  if (compact) {
    const next = theme === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={theme === "dark" ? "Gunakan mode terang" : "Gunakan mode gelap"}
        className={cn("grid size-10 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink", className)}
      >
        {theme === "dark" ? <Sun className="size-5" strokeWidth={1.5} /> : <Moon className="size-5" strokeWidth={1.5} />}
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Tampilan" className={cn("flex rounded-full bg-field p-1", className)}>
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => setTheme(t)}
          className={cn(
            "flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[13px] transition-[background-color,color,box-shadow]",
            theme === t ? "bg-surface text-ink shadow-[0_0_0_1px_var(--border)]" : "text-muted hover:text-ink",
          )}
        >
          {t === "light" ? <Sun className="size-3.5" strokeWidth={1.75} /> : <Moon className="size-3.5" strokeWidth={1.75} />}
          {t === "light" ? "Terang" : "Gelap"}
        </button>
      ))}
    </div>
  );
}
