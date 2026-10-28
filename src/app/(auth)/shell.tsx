import type { ReactNode } from "react";
import { Mark } from "@/components/nav";

/** The frame shared by sign-in, setup and recovery pages. */
export function AuthShell({ title, sub, children, footer }: { title: string; sub: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Mark className="size-10" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted">{sub}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls =
    tone === "error" ? "bg-[var(--pill-neg-bg)] text-[var(--pill-neg-ink)]" : tone === "ok" ? "bg-[var(--pill-pos-bg)] text-[var(--pill-pos-ink)]" : "bg-raised text-ink-2";
  return <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm leading-5 ${cls}`}>{children}</p>;
}
