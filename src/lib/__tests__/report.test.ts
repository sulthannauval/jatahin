import { describe, expect, it } from "vitest";
import { comparePeriods, cumulative, rangeLabel } from "../report";

describe("comparePeriods", () => {
  it("compares the days so far of a running month with the same days of last month", () => {
    const p = comparePeriods("2026-11", "2026-11-02");
    expect(p).toMatchObject({ running: true, day: 2, days: 30 });
    expect(p.cur).toEqual({ from: "2026-11-01", to: "2026-11-02" });
    expect(p.prev).toEqual({ from: "2026-10-01", to: "2026-10-02" });
  });
  it("stops at the end of a shorter last month", () => {
    expect(comparePeriods("2027-03", "2027-03-31").prev).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });
  it("compares whole months once the month is over", () => {
    const p = comparePeriods("2026-10", "2026-11-02");
    expect(p.running).toBe(false);
    expect(p.cur).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(p.prev).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("cumulative", () => {
  it("adds spending up day by day", () => {
    const m = new Map([["2026-11-01", 100], ["2026-11-03", 50]]);
    expect(cumulative(m, "2026-11", 4)).toEqual([100, 100, 150, 150]);
  });
});

describe("rangeLabel", () => {
  const name = (m: string) => (m === "2026-10" ? "Oktober" : "November");
  const short = (m: string) => (m === "2026-10" ? "Okt" : "Nov");
  it("names a stretch of days or a whole month", () => {
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-02" }, false, name, short)).toBe("1–2 Okt");
    expect(rangeLabel({ from: "2026-11-01", to: "2026-11-01" }, false, name, short)).toBe("1 Nov");
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-31" }, true, name, short)).toBe("Oktober");
  });
});
