import type { Goal } from "@/lib/finance";
import { monthLabel } from "@/lib/dates";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * The goals laid end to end on one track, as long as all targets together, because they are saved for one after
 * another. Finished goals fill in ink, the active one in the hue, waiting ones stay as track.
 */
export function GoalQueue({ goals, compact }: { goals: Goal[]; compact?: boolean }) {
  if (!goals.length) return null;
  const total = goals.reduce((s, g) => s + (g.target ?? 0), 0);
  const saved = goals.reduce((s, g) => s + Math.min(g.balance, g.target ?? 0), 0);
  const active = goals.find((g) => g.status === "active");
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="num text-sm"><span className="font-bold">{rp(saved)}</span> <span className="text-muted">dari {rp(total)}</span></p>
        <p className="num text-xs text-muted">{pct(total ? saved / total : 0)}</p>
      </div>
      <div className="mt-2.5 flex gap-0.5" role="img" aria-label={`Antrian goal: ${goals.map((g) => `${g.name} ${pct(g.progress)}`).join(", ")}`}>
        {goals.map((g) => (
          <div key={g.id} className="relative h-2 overflow-hidden rounded-sm bg-raised" style={{ flexGrow: g.target ?? 1, flexBasis: 0 }}>
            {g.progress > 0 && <div className={cn("h-full", g.status === "done" ? "bg-ink" : "bg-hue")} style={{ width: `${g.progress * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-0.5">
        {goals.map((g) => (
          <div key={g.id} className="min-w-0" style={{ flexGrow: g.target ?? 1, flexBasis: 0 }}>
            <p className={cn("truncate text-xs", g.status === "active" ? "text-ink" : "text-muted")}>{g.name}</p>
            {!compact && <p className="num truncate text-xs text-muted">{rp(g.target ?? 0)}</p>}
          </div>
        ))}
      </div>
      {active && (
        <p className="mt-3 text-xs text-muted">
          Sekarang: <span className="text-ink">{active.name}</span>, kurang <span className="num text-ink">{rp(active.remaining)}</span>
          {active.eta ? <> · perkiraan tercapai {monthLabel(active.eta)}</> : <> · belum ada setoran dalam tiga bulan terakhir</>}
        </p>
      )}
    </div>
  );
}
