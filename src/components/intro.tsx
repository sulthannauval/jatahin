"use client";

import { useEffect, useId, useRef } from "react";
import { COIN_VIEWBOX, CoinMasks, useMaskIds } from "./brand";

const BLADE = "M35 11V30C35 36 31 40 25 40C21 40 17 38 12 35";
const EXIT_AT = 2750;

/**
 * The opening, telling the tagline: a month's money drops in as a coin (gaji masuk), a mint line cuts a J
 * through it (dijatahin), the piece in the J's crook steps out and turns mint (jatah disisihkan), the name
 * comes out of the coin, and the coin flies to the logo's place in the app (baru belanja). A tap skips it.
 * Hidden unless html[data-intro] was set (by the root layout's head script); the CSS lives in globals.css (.intro-*).
 */
export function Intro() {
  const ref = useRef<HTMLDivElement>(null);
  const ids = useMaskIds();
  const disc = "c" + useId().replace(/[^\w-]/g, "");

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el || root.dataset.intro !== "play") return;
    let leaving = false;
    const done = () => {
      delete root.dataset.intro;
    };
    const exit = (quick: boolean) => {
      if (leaving) return;
      leaving = true;
      el.getAnimations({ subtree: true }).forEach((a) => a.finish());
      const d = quick ? 380 : 620;
      const coin = el.querySelector<HTMLElement>(".intro-coin")!;
      const from = coin.getBoundingClientRect();
      // Where the logo sits on this page: the sidebar on a wide screen, the top bar on a phone.
      const to = [...document.querySelectorAll("[data-brand-mark]")]
        .map((m) => m.getBoundingClientRect())
        .find((r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight);
      el.querySelectorAll(".intro-shadow, .intro-word, .intro-tag").forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }));
      el.querySelector(".intro-bg")!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d * 0.8, delay: d * 0.15, easing: "ease-out", fill: "forwards" });
      let fly: Animation;
      if (to) {
        // A gentle arc: it lifts first, then glides over to its place.
        const dx = to.left - from.left, dy = to.top - from.top, k = to.width / from.width;
        const frames = Array.from({ length: 13 }, (_, i) => {
          const t = i / 12, u = 1 - t, x = 2 * u * t * dx * 0.18 + t * t * dx, y = 2 * u * t * dy * 0.92 + t * t * dy;
          return { offset: t, transform: `translate(${x}px, ${y}px) scale(${1 + (k - 1) * t})` };
        });
        coin.style.transformOrigin = "0 0";
        fly = coin.animate(frames, { duration: d, easing: "cubic-bezier(.65, 0, .35, 1)", fill: "forwards" });
      } else {
        fly = coin.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: d * 0.6, fill: "forwards" });
      }
      fly.finished.then(done, done);
    };
    const timer = setTimeout(() => exit(false), EXIT_AT);
    // A hidden tab can hold the animations back: never leave the overlay over the app.
    const safety = setTimeout(done, 6000);
    const skip = () => exit(true);
    el.addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(timer);
      clearTimeout(safety);
      el.removeEventListener("pointerdown", skip);
    };
  }, []);

  return (
    <div ref={ref} className="intro" aria-hidden>
      <div className="intro-bg" />
      <div className="intro-lock">
        <div className="intro-coin-wrap">
          <div className="intro-shadow" />
          <div className="intro-coin">
            <svg viewBox={COIN_VIEWBOX} width="32" height="32">
              <defs>
                <clipPath id={disc}>
                  <circle cx="32" cy="32" r="19.5" />
                </clipPath>
                <CoinMasks {...ids} />
              </defs>
              <g className="intro-parts">
                <g className="intro-rest">
                  <circle cx="32" cy="32" r="19.5" fill="var(--ink)" mask={`url(#${ids.rest})`} />
                </g>
                <g className="intro-slice">
                  <circle className="intro-piece" cx="32" cy="32" r="19.5" fill="var(--ink)" mask={`url(#${ids.slice})`} />
                </g>
              </g>
              <circle className="intro-whole" cx="32" cy="32" r="19.5" fill="var(--ink)" />
              <path className="intro-blade" d={BLADE} pathLength={100} stroke="var(--brand)" strokeWidth="4.6" fill="none" strokeLinecap="round" clipPath={`url(#${disc})`} />
            </svg>
          </div>
        </div>
        <span className="intro-word">
          <span className="intro-w">Jatahin</span>
          <span className="intro-bang">!</span>
        </span>
      </div>
      <p className="intro-tag">Atur jatah, baru belanja.</p>
    </div>
  );
}
