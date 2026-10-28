import { describe, expect, it } from "vitest";
import { potBalances, potDetails, type PotInfo, type SavingTx } from "../finance";

const pot: PotInfo = { id: 1, name: "Keluarga", openingBalance: 4_300_000, openingDate: "2026-09-25", target: null, targetDate: null, priority: null };

describe("pot opening balance", () => {
  it("is the balance at the start of the opening date, so that day's transactions count", () => {
    const txs: SavingTx[] = [
      { date: "2026-09-22", potId: 1, amount: 200_000, role: "saving_withdraw" }, // before: already inside the opening balance
      { date: "2026-09-25", potId: 1, amount: 300_000, role: "saving_withdraw" }, // on the day: counts
      { date: "2026-09-26", potId: 1, amount: 300_000, role: "saving_deposit" },
    ];
    expect(potBalances([pot], txs).get(1)).toBe(4_300_000);
    expect(potDetails([pot], txs)[0]).toMatchObject({ deposits: 300_000, withdrawals: 300_000, withdrawnAllTime: 500_000 });
  });
});

import { neededPerMonth, savingFlows } from "../finance";

describe("saving flows", () => {
  it("sums deposits and withdrawals per month and per pot", () => {
    const f = savingFlows(
      [
        { date: "2026-10-04", potId: 1, amount: 200_000, role: "saving_withdraw" },
        { date: "2026-10-10", potId: 1, amount: 1_500_000, role: "saving_deposit" },
        { date: "2026-10-20", potId: 2, amount: 4_000_000, role: "saving_withdraw" },
        { date: "2026-09-30", potId: 1, amount: 999, role: "saving_deposit" },
      ],
      "2026-10",
    );
    expect(f).toMatchObject({ deposits: 1_500_000, withdrawals: 4_200_000, net: -2_700_000 });
    expect(f.byPot.get(1)).toEqual({ deposits: 1_500_000, withdrawals: 200_000, net: 1_300_000 });
  });
  it("spreads what's left over the months until the target", () => {
    expect(neededPerMonth(15_000_000, "2027-10-10", "2026-10-28")).toBe(1_153_847); // 13 months incl. this one
    expect(neededPerMonth(0, "2027-10-10", "2026-10-28")).toBeNull();
    expect(neededPerMonth(1_000, null, "2026-10-28")).toBeNull();
  });
});

import { monthInsights, summarizeMonth } from "../finance";

describe("month insights", () => {
  it("names the biggest category, the biggest rise and the saving rate", () => {
    const cats = [
      { id: 1, name: "Lifestyle", kind: "expense" as const, group: "Keinginan", role: null },
      { id: 2, name: "Keluarga", kind: "expense" as const, group: "Lainnya", role: null },
      { id: 3, name: "Gaji", kind: "income" as const, group: "Rutin", role: null },
    ];
    const sums = [
      { month: "2026-09", categoryId: 1, total: 500_000 },
      { month: "2026-09", categoryId: 3, total: 5_000_000 },
      { month: "2026-10", categoryId: 1, total: 1_000_000 },
      { month: "2026-10", categoryId: 2, total: 3_000_000 },
      { month: "2026-10", categoryId: 3, total: 5_000_000 },
    ];
    const ins = monthInsights(summarizeMonth(sums, cats, "2026-10"), summarizeMonth(sums, cats, "2026-09"), cats, (n) => `Rp${n}`, "September");
    expect(ins.map((i) => i.title)).toEqual(["Keluarga menjadi pengeluaran terbesar", "Lifestyle naik 100%", "20% pemasukan berhasil disimpan"]);
  });
});
