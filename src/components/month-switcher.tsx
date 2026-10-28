import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, currentMonth, monthLabel } from "@/lib/dates";

/** Prev / next month links that keep the other query params. */
export function MonthSwitcher({ month, path, params = {}, compact }: { month: string; path: string; params?: Record<string, string | undefined>; compact?: boolean }) {
  const href = (m: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (m !== currentMonth()) q.set("m", m);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const isCurrent = month === currentMonth();
  const step = "grid h-10 w-10 place-items-center text-ink-2 transition-colors hover:bg-raised hover:text-ink";
  return (
    <div className="flex items-center gap-2">
      {!isCurrent && (
        <Link href={href(currentMonth())} className="h-9 content-center rounded-full px-2.5 text-[13px] text-ink-2 hover:bg-raised hover:text-ink" scroll={false}>
          Bulan ini
        </Link>
      )}
      <div className="flex h-10 items-center overflow-hidden rounded-full border border-line bg-surface">
        <Link href={href(addMonths(month, -1))} className={step} aria-label="Bulan sebelumnya" scroll={false}>
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </Link>
        {compact ? <span className="h-5 w-px bg-line" /> : <span className="num min-w-34 border-x border-line text-center text-sm leading-9">{monthLabel(month)}</span>}
        <Link href={href(addMonths(month, 1))} className={step} aria-label="Bulan berikutnya" scroll={false}>
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
