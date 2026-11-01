"use client";

import { useEffect, useRef, useState } from "react";
import { rp } from "@/lib/money";

/**
 * Spending added up day by day: this month as a solid line in the hue (up to today when it is still running), last
 * month as a dashed grey line over its whole length, so "ahead or behind of last month" reads at any date.
 * `markDay` labels a known jump, such as payday's tagihan.
 */
export function PaceChart({ cur, prev, days, markDay, markLabel, curName, prevName }: {
  cur: number[]; prev: number[]; days: number; markDay?: number; markLabel?: string; curName: string; prevName: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    // Draw at the real pixel width so the labels keep their size on a phone.
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 150, padL = 4, padR = 8, padT = 12, padB = 22;
  // The month shown sets the days; last month is cut to them (its 31st has no partner in a 30-day month).
  const span = Math.max(days, 2);
  prev = prev.slice(0, span);
  const top = Math.max(1, ...cur, ...prev) * 1.08;
  const x = (i: number) => padL + (i / (span - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const line = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = cur.length - 1;

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" role="img" aria-label={`Pengeluaran ${curName} dibanding ${prevName}, dijumlah per hari`}>
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--control)" />
        {markDay !== undefined && markDay <= span && (
          <g>
            <line x1={x(markDay - 1)} x2={x(markDay - 1)} y1={padT} y2={y(0)} stroke="var(--grid)" strokeDasharray="2 3" />
            <text x={x(markDay - 1) + 4} y={padT + 9} fill="var(--muted)" fontSize={11}>{markLabel}</text>
          </g>
        )}
        {prev.length > 1 && <polyline points={line(prev)} fill="none" stroke="var(--grey-mark)" strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />}
        {cur.length > 1 && <polyline points={line(cur)} fill="none" stroke="var(--hue)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {last >= 0 && <circle cx={x(last)} cy={y(cur[last])} r={4} fill="var(--hue)" />}
        {last >= 0 && cur[last] > 0 && (
          <text x={Math.min(x(last) + 7, W - padR - 92)} y={y(cur[last]) - 7} fill="var(--ink)" fontSize={11} fontWeight={600}>{rp(cur[last])}</text>
        )}
        <text x={padL} y={H - 6} fill="var(--muted)" fontSize={11}>1</text>
        <text x={W - padR} y={H - 6} textAnchor="end" fill="var(--muted)" fontSize={11}>{span}</text>
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-hue" /> {curName}</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-grey-mark" /> {prevName}</span>
      </p>
    </div>
  );
}
