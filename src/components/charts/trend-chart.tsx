"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/dates";
import { rp, rpShort } from "@/lib/money";

type Point = { month: string; income: number; expense: number; net?: number; withdraw?: number };

/**
 * Spending per month as columns: the selected month in the one hue, earlier months in grey.
 * Income is a 2px ink tick on each column, so "did spending stay under income" reads at a glance.
 */
export function TrendChart({ data, current }: { data: Point[]; current: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    // Draw at the real pixel width so labels stay 11px on a phone.
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 180 : 210, padL = 44, padR = 4, padT = 10, padB = 28;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const step = niceStep(max / 4);
  const top = Math.ceil((max * 1.05) / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = plotW / Math.max(data.length, 1);
  const barW = Math.min(44, band * 0.5);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" role="img" aria-label="Pengeluaran dan pemasukan per bulan" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--control)" : "var(--grid)"} strokeWidth={1} />
            <text x={padL - 10} y={y(t)} dy="0.32em" textAnchor="end" fill="var(--muted)" fontSize={11}>{t === 0 ? "0" : rpShort(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const isCur = d.month === current;
          return (
            <g key={d.month}>
              <Column x={cx - barW / 2} w={barW} y={y(d.expense)} base={y(0)} fill={isCur ? "var(--hue)" : "var(--grey-mark)"} faded={hover !== null && hover !== i} />
              {d.income > 0 && <line x1={cx - barW / 2 - 6} x2={cx + barW / 2 + 6} y1={y(d.income)} y2={y(d.income)} stroke="var(--ink)" strokeWidth={2} />}
              <text x={cx} y={H - 9} textAnchor="middle" fill={isCur ? "var(--ink)" : "var(--muted)"} fontSize={11}>{monthLabel(d.month, true)}</text>
              <rect x={padL + band * i} y={padT} width={band} height={plotH + padB} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 rounded-xl border border-line bg-elevated px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(85, Math.max(15, ((padL + band * hover + band / 2) / W) * 100))}%` }}
        >
          <p className="mb-1 font-medium">{monthLabel(h.month)}</p>
          <Row label="Pemasukan" value={rp(h.income)} />
          {!!h.withdraw && <Row label="Tabungan terambil" value={rp(h.withdraw)} />}
          <Row label="Pengeluaran" value={rp(h.expense)} />
          <Row label="Selisih" value={((h.net ?? h.income - h.expense) >= 0 ? "+" : "") + rp(h.net ?? h.income - h.expense)} />
        </div>
      )}
    </div>
  );
}

export function TrendLegend() {
  return (
    <span className="flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2 rounded-t-[2px] bg-hue" /> Pengeluaran</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-ink" /> Pemasukan</span>
    </span>
  );
}

function Column({ x, w, y, base, fill, faded }: { x: number; w: number; y: number; base: number; fill: string; faded: boolean }) {
  const h = Math.max(0, base - y);
  if (h < 0.5) return null;
  const r = Math.min(4, h, w / 2);
  return (
    <path
      d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`}
      fill={fill}
      opacity={faded ? 0.45 : 1}
      style={{ transition: "opacity 150ms" }}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
