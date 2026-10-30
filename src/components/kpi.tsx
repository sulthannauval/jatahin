import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type Kpi = {
  label: string;
  value: ReactNode;
  tone?: "pos" | "neg";
  /** Change vs the previous period. `good` decides the colour (a rise in spending is bad). */
  delta?: { text: string; dir: "up" | "down" | "flat"; good: boolean | null };
  sub?: ReactNode;
};

/**
 * One card split by dividers: label over a large figure, a small change badge beside it, a quiet line under it.
 * Two columns on phones (an odd last item takes the full row), one row on wide screens.
 */
export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <section
      className={cn(
        // The 1px gap over a border-coloured background draws the dividers, whatever the column count.
        "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line",
        items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        className,
      )}
    >
      {items.map((k, i) => (
        <div
          key={k.label}
          className={cn(
            "min-w-0 bg-surface px-4 py-4 sm:px-5 sm:py-5",
            items.length % 2 === 1 && i === items.length - 1 && "col-span-2 lg:col-span-1",
          )}
        >
          <p className="text-sm text-muted">{k.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={cn("num text-[22px] leading-8 font-bold tracking-[-0.02em] sm:text-[26px]", k.tone === "pos" && "text-pos", k.tone === "neg" && "text-neg")}>{k.value}</p>
            {k.delta && <DeltaBadge {...k.delta} />}
          </div>
          {k.sub && <p className="num mt-1.5 text-xs leading-5 text-muted sm:text-[13px]">{k.sub}</p>}
        </div>
      ))}
    </section>
  );
}

function DeltaBadge({ text, dir, good }: NonNullable<Kpi["delta"]>) {
  const Icon = dir === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        "num inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-medium",
        good === null || dir === "flat" ? "bg-field text-ink-2" : good ? "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]" : "bg-[var(--pill-neg-bg)] text-[var(--pill-neg-ink)]",
      )}
    >
      {dir !== "flat" && <Icon className="size-3.5" strokeWidth={2} />}
      {text}
    </span>
  );
}

/** Percentage change a → b, as a badge-ready object. `higherIsGood` decides the colour. */
export function change(prev: number, cur: number, higherIsGood: boolean): Kpi["delta"] | undefined {
  if (prev <= 0) return undefined;
  const r = (cur - prev) / prev;
  if (Math.abs(r) < 0.005) return { text: "0%", dir: "flat", good: null };
  const pctText = new Intl.NumberFormat("id-ID", { maximumFractionDigits: Math.abs(r) < 0.1 ? 1 : 0 }).format(Math.abs(r) * 100) + "%";
  const up = r > 0;
  return { text: pctText, dir: up ? "up" : "down", good: up === higherIsGood };
}
