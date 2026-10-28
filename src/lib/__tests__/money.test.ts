import { describe, expect, it } from "vitest";
import { parseAmount, parseBalance, rp, rpShort } from "../money";
import { addMonths, dayLabel, isDateKey, monthLabel } from "../dates";

describe("money", () => {
  it("parses common ways of typing amounts", () => {
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("1500000")).toBe(1500000);
    expect(parseAmount("Rp 25.000")).toBe(25000);
    expect(parseAmount("1,5jt")).toBe(1500000);
    expect(parseAmount("1.5jt")).toBe(1500000);
    expect(parseAmount("150rb")).toBe(150000);
    expect(parseAmount("25k")).toBe(25000);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5000")).toBeNull();
  });
  it("reads bank balances with sen", () => {
    expect(parseBalance("6.781,72")).toBe(6782);
    expect(parseBalance("Rp 4.300.000")).toBe(4300000);
    expect(parseBalance("0,35")).toBe(0);
    expect(parseBalance("1500000")).toBe(1500000);
    expect(parseBalance("12.34")).toBeNull();
    expect(parseBalance("-5")).toBeNull();
  });
  it("formats rupiah", () => {
    expect(rp(1500000)).toBe("Rp1.500.000");
    expect(rp(-5000)).toBe("−Rp5.000");
    expect(rpShort(1500000)).toBe("1,5 jt");
    expect(rpShort(250000)).toBe("250 rb");
  });
});

describe("dates", () => {
  it("handles month math and labels", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("Oktober 2026");
    expect(dayLabel("2026-10-28", "2026-10-28")).toBe("Hari ini");
    expect(dayLabel("2026-10-27", "2026-10-28")).toBe("Kemarin");
    expect(dayLabel("2026-10-21", "2026-10-28")).toBe("Rabu, 21 Okt");
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-02-28")).toBe(true);
  });
});
