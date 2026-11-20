import { describe, expect, it } from "vitest";
import { historyRows, isTopUp, maskCardId, parseCardDate } from "../emoney";

describe("card dates", () => {
  it("reads the reader's WIB timestamps", () => {
    expect(parseCardDate("20/11/2026 07:42:05")?.toISOString()).toBe("2026-11-20T00:42:05.000Z");
    expect(parseCardDate("01/01/2026 03:00:00")?.toISOString()).toBe("2025-12-31T20:00:00.000Z");
    expect(parseCardDate("2026-11-20")).toBeNull();
  });
});

describe("card rows", () => {
  it("tells top-ups from payments", () => {
    expect(isTopUp("Top Up")).toBe(true);
    expect(isTopUp("Payment")).toBe(false);
  });

  it("shows only the end of the card id", () => {
    expect(maskCardId("04a1b2c3d4e5f6")).toBe("•••• E5F6");
    expect(maskCardId("12")).toBe("12");
  });

  it("puts the newest first and undated rows last", () => {
    const rows = historyRows([
      { date: "18/11/2026 12:05:00", amount: 50000, type: "Top Up" },
      { date: "??", amount: 1000, type: "Payment" },
      { date: "20/11/2026 07:42:00", amount: -4000, type: "Payment" },
    ]);
    expect(rows.map((r) => [r.amount, r.topUp])).toEqual([[4000, false], [50000, true], [1000, false]]);
  });
});
