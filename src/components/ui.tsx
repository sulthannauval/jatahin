import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { groupColor } from "@/lib/colors";

/** Panel on the stone ground: 1px edge, soft 16px radius, no shadow. */
export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-line bg-surface", className)} {...p} />;
}

export function CardHeader({ title, action, sub, as: H = "h2" }: { title: ReactNode; action?: ReactNode; sub?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-4">
      <div className="min-w-0">
        <H className="text-base font-medium">{title}</H>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action && <div className="text-xs text-muted">{action}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "bg-field text-ink hover:bg-active",
  ghost: "text-ink-2 hover:bg-field hover:text-ink",
  danger: "text-neg hover:bg-field",
};

export function buttonClass(variant: BtnVariant = "primary", size: "sm" | "md" | "lg" = "md") {
  return cn(
    "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-full font-medium transition-[opacity,background-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3.5 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px]",
    btn[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...p} />;
}

/** Filled field: a quiet tone at rest, the surface with a hairline ring when focused. One focus indicator only. */
export const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-field px-3.5 text-[15px] text-ink placeholder:text-muted outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:bg-active/70 focus:border-control focus:bg-surface focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--hue)_14%,transparent)]";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...p} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return (
    <select
      className={cn(inputClass, "cursor-pointer appearance-none bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236b6b6b' stroke-width='1.5'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.6rem center", backgroundSize: "1rem" }}
      {...p}
    />
  );
}

export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("mb-2 block text-sm font-medium", className)} {...p} />;
}

/** Pale tint with the dark of the same hue. */
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: "neutral" | "pos" | "neg" | "warn" | "hue" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium",
        tone === "neutral" && "bg-raised text-ink-2",
        tone === "pos" && "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]",
        tone === "neg" && "bg-[var(--pill-neg-bg)] text-[var(--pill-neg-ink)]",
        tone === "warn" && "bg-[var(--pill-warn-bg)] text-[var(--pill-warn-ink)]",
        tone === "hue" && "bg-[var(--pill-hue-bg)] text-[var(--pill-hue-ink)]",
        className,
      )}
      {...p}
    />
  );
}

/**
 * How much of a plan is used: the track is the plan, the spent part is filled in ink,
 * an overrun runs past the plan's end in the negative colour. `marker` (0..1) = today's position in the month.
 */
export function PlanBar({ spent, plan, marker, hue, quiet, className, label }: { spent: number; plan: number; marker?: number; hue?: boolean; quiet?: boolean; className?: string; label?: string }) {
  const max = Math.max(plan, spent, 1);
  const planW = (plan / max) * 100;
  const inW = (Math.min(spent, plan) / max) * 100;
  const overW = spent > plan ? ((spent - plan) / max) * 100 : 0;
  return (
    <div className={cn("relative w-full", quiet ? "h-1" : "h-1.5", className)} role="img" aria-label={label ?? `Terpakai ${Math.round((spent / Math.max(plan, 1)) * 100)}% dari rencana`}>
      {plan > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-raised" style={{ width: `${planW}%` }} />}
      {inW > 0 && <div className={cn("absolute inset-y-0 left-0 rounded-full", hue ? "bg-hue" : quiet ? "bg-grey-mark" : "bg-ink")} style={{ width: `${inW}%` }} />}
      {overW > 0 && <div className="absolute inset-y-0 rounded-r-full bg-neg" style={{ left: `calc(${planW}% + 2px)`, width: `calc(${overW}% - 2px)` }} />}
      {plan > 0 && spent > plan && <div className="absolute -inset-y-1 w-px bg-ink" style={{ left: `${planW}%` }} />}
      {marker !== undefined && marker > 0 && marker < 1 && plan > 0 && (
        <div className="absolute -top-1 h-3.5 w-px bg-muted" style={{ left: `${marker * planW}%` }} title="Posisi hari ini" />
      )}
    </div>
  );
}

/** Progress toward a target; the fill is the true ratio, zero has no stub. */
export function Progress({ value, className, label, hue }: { value: number; className?: string; label?: string; hue?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-raised", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      {v > 0 && <div className={cn("h-full rounded-full transition-[width] duration-500", hue ? "bg-hue" : "bg-ink")} style={{ width: `${v * 100}%` }} />}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-10">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** The screen's one h1 (a noun), an optional finding line, and the controls on the right. */
export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** The one way to go deeper: a quiet pill with an arrow, always at the right of a section header. */
export function MoreLink({ href, children = "Lihat semua" }: { href: string; children?: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-field pr-2.5 pl-3 text-[13px] text-ink-2 transition-colors hover:bg-active hover:text-ink"
    >
      {children}
      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
    </Link>
  );
}

/** Section title with an optional quiet note and the way to go deeper. */
export function SectionHeader({ title, note, more, id }: { title: string; note?: ReactNode; more?: ReactNode; id?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <h2 id={id} className="text-[15px] font-medium">{title}</h2>
        {note && <span className="num text-[13px] text-muted">{note}</span>}
      </div>
      {more}
    </div>
  );
}

/** A small colour mark for a category type. */
export function Dot({ group, className }: { group: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: groupColor(group) }} />;
}
