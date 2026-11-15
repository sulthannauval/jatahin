"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/*
 * The mark: a month's money as a coin, cut by a J. The piece in the J's crook is the jatah, set apart in mint.
 * Drawn on a 64 grid; the viewBox is the coin itself, so it lines up with text without an empty margin.
 */
export const COIN_VIEWBOX = "12.5 12.5 39 39";
/** The jatah: everything above and left of the cut (the coin limits it). */
export const SLICE = "M0 0H35V30C35 36 31 40 25 40C21 40 17 38 12 35L0 35Z";
/** The J-shaped cut. */
export const CUT = "M35 4V30C35 36 31 40 25 40C21 40 17 38 12 35";

/** Mask ids from useId, made safe for url(#…). */
export function useMaskIds() {
  const id = "m" + useId().replace(/[^\w-]/g, "");
  return { rest: `${id}r`, slice: `${id}s` };
}

/** The two masks that split the coin; each leaves the cut empty, so whatever is behind shows through it. */
export function CoinMasks({ rest, slice }: { rest: string; slice: string }) {
  const cut = <path d={CUT} fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" />;
  return (
    <>
      <mask id={rest} maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
        <rect x="-8" y="-8" width="80" height="80" fill="#fff" />
        <path d={SLICE} fill="#000" />
        {cut}
      </mask>
      <mask id={slice} maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
        <path d={SLICE} fill="#fff" />
        {cut}
      </mask>
    </>
  );
}

/** The product mark, following the theme. The opening animation lands on it (data-brand-mark). */
export function Mark({ className }: { className?: string }) {
  const ids = useMaskIds();
  return (
    <svg viewBox={COIN_VIEWBOX} aria-hidden data-brand-mark="" className={cn("size-5 shrink-0", className)}>
      <defs>
        <CoinMasks {...ids} />
      </defs>
      <circle cx="32" cy="32" r="19.5" fill="var(--ink)" mask={`url(#${ids.rest})`} />
      <circle cx="32" cy="32" r="19.5" fill="var(--brand)" mask={`url(#${ids.slice})`} />
    </svg>
  );
}
