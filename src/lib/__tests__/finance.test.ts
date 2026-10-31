import { describe, expect, it } from "vitest";
import {
  buildGoals, carryOver, categoryChanges, monthlyNets, neededPerMonth, potBalances, potDetails, potFlows, savingsOutByMonth,
  summarizeMonth, toMoves, trendTable, type PotInfo, type PotTx, type TransferInfo,
} from "../finance";

const pot = (id: number, over: Partial<PotInfo> = {}): PotInfo => ({
  id, name: `K${id}`, kind: "saving", openingBalance: 0, openingDate: null, target: null, targetDate: null, priority: null, ...over,
});

describe("moves", () => {
  it("adds income, takes spending and moves money out of one kantong into the other", () => {
    const txs: PotTx[] = [
      { date: "2026-10-01", potId: null, kind: "income", amount: 5_000_000 },
      { date: "2026-10-02", potId: 3, kind: "expense", amount: 40_000 },
    ];
    const moved: TransferInfo[] = [{ date: "2026-10-03", fromPotId: null, toPotId: 3, amount: 600_000 }];
    expect(toMoves(txs, moved)).toEqual([
      { date: "2026-10-01", potId: null, amount: 5_000_000 },
      { date: "2026-10-02", potId: 3, amount: -40_000 },
      { date: "2026-10-03", potId: null, amount: -600_000 },
      { date: "2026-10-03", potId: 3, amount: 600_000 },
    ]);
  });
});

describe("pot opening balance", () => {
  it("is the balance at the start of the opening date, so that day's moves count", () => {
    const p = pot(1, { openingBalance: 4_300_000, openingDate: "2026-09-25" });
    const moves = toMoves([], [
      { date: "2026-09-22", fromPotId: 1, toPotId: null, amount: 200_000 }, // before: already inside the opening balance
      { date: "2026-09-25", fromPotId: 1, toPotId: null, amount: 300_000 }, // on the day: counts
      { date: "2026-09-26", fromPotId: null, toPotId: 1, amount: 300_000 },
    ]);
    expect(potBalances([p], moves).get(1)).toBe(4_300_000);
    expect(potDetails([p], moves)[0]).toMatchObject({ inflow: 300_000, outflow: 300_000, outAllTime: 500_000 });
  });

  it("counts spending straight from a kantong and corrections against the bank", () => {
    const moves = toMoves([{ date: "2026-10-05", potId: 1, kind: "expense", amount: 70_000 }], [{ date: "2026-10-01", fromPotId: null, toPotId: 1, amount: 500_000 }]);
    expect(potBalances([pot(1, { kind: "spending" })], moves, [{ potId: 1, date: "2026-10-06", amount: -1_000 }]).get(1)).toBe(429_000);
  });
});

describe("Kantong Utama", () => {
  const moves = toMoves(
    [
      { date: "2026-09-01", potId: null, kind: "income", amount: 1_000_000 },
      { date: "2026-10-01", potId: null, kind: "income", amount: 5_000_000 },
      { date: "2026-10-02", potId: null, kind: "expense", amount: 2_000_000 },
      // Paid from another kantong: Kantong Utama doesn't move.
      { date: "2026-10-03", potId: 7, kind: "expense", amount: 999 },
    ],
    [
      { date: "2026-10-04", fromPotId: null, toPotId: 7, amount: 1_500_000 },
      { date: "2026-10-05", fromPotId: 7, toPotId: null, amount: 200_000 },
      { date: "2026-10-06", fromPotId: 7, toPotId: 8, amount: 50_000 },
    ],
  );

  it("changes by its own income and spending and by money moved in or out", () => {
    const nets = monthlyNets(moves);
    expect(nets.get("2026-10")).toBe(5_000_000 - 2_000_000 - 1_500_000 + 200_000);
    expect(carryOver(nets, "2026-09", 100, "2026-10")).toEqual({ opening: 1_000_100, closing: 2_700_100 });
    expect(carryOver(nets, "2026-11", 0, "2026-10")).toBeNull();
    expect(carryOver(nets, null, 0, "2026-10")).toBeNull();
  });

  it("explains the change the table can't show as income or spending", () => {
    const cats = [{ id: 1, name: "Gaji", kind: "income" as const, group: "Rutin" }, { id: 2, name: "Makan", kind: "expense" as const, group: "Kebutuhan" }];
    const sums = [{ month: "2026-10", categoryId: 1, total: 5_000_000 }, { month: "2026-10", categoryId: 2, total: 2_000_999 }];
    const [row] = trendTable(sums, cats, monthlyNets(moves), "2026-10", 0, "2026-10", "2026-10");
    expect(row).toMatchObject({ net: 2_999_001, moved: -1_299_001, opening: 0, closing: 1_700_000 });
    expect(row.net + row.moved).toBe(row.closing! - row.opening!);
  });
});

describe("money taken out of savings", () => {
  it("counts moves out of saving kantong and spending from them, not moves between them", () => {
    const out = savingsOutByMonth(
      [
        { date: "2026-10-02", potId: 1, kind: "expense", amount: 100 },
        { date: "2026-10-02", potId: 3, kind: "expense", amount: 7 }, // spending kantong
        { date: "2026-10-02", potId: 1, kind: "income", amount: 9 },
      ],
      [
        { date: "2026-10-03", fromPotId: 1, toPotId: null, amount: 1_000 },
        { date: "2026-10-03", fromPotId: 1, toPotId: 3, amount: 20_000 }, // to a spending kantong
        { date: "2026-10-04", fromPotId: 1, toPotId: 2, amount: 300_000 }, // saving to saving
        { date: "2026-09-30", fromPotId: 2, toPotId: null, amount: 5 },
      ],
      new Set([1, 2]),
    );
    expect(Object.fromEntries(out)).toEqual({ "2026-10": 21_100, "2026-09": 5 });
  });

  it("keeps the saving rate on income, leaving out spending paid from savings", () => {
    const cats = [{ id: 1, name: "Gaji", kind: "income" as const, group: "Rutin" }, { id: 2, name: "Keluarga", kind: "expense" as const, group: "Lainnya" }];
    const sums = [{ month: "2026-10", categoryId: 1, total: 5_000_000 }, { month: "2026-10", categoryId: 2, total: 9_539_670 }];
    const s = summarizeMonth(sums, cats, "2026-10", 6_300_000);
    expect(s).toMatchObject({ income: 5_000_000, expense: 9_539_670, net: -4_539_670, fromSavings: 6_300_000 });
    expect(s.savingRate).toBeCloseTo(0.352066, 5);
    expect(summarizeMonth(sums, cats, "2026-10", 99_000_000).fromSavings).toBe(9_539_670);
    expect(summarizeMonth(sums, cats, "2026-09").savingRate).toBeNull();
  });
});

describe("kantong flows", () => {
  it("sums money in and out per month and per kantong, leaving Kantong Utama out", () => {
    const f = potFlows(
      toMoves(
        [{ date: "2026-10-12", potId: 2, kind: "expense", amount: 50_000 }],
        [
          { date: "2026-10-04", fromPotId: 1, toPotId: null, amount: 200_000 },
          { date: "2026-10-10", fromPotId: null, toPotId: 1, amount: 1_500_000 },
          { date: "2026-10-20", fromPotId: 2, toPotId: null, amount: 4_000_000 },
          { date: "2026-09-30", fromPotId: null, toPotId: 1, amount: 999 },
        ],
      ),
      "2026-10",
    );
    expect(f).toMatchObject({ inflow: 1_500_000, outflow: 4_250_000, net: -2_750_000 });
    expect(f.byPot.get(1)).toEqual({ inflow: 1_500_000, outflow: 200_000, net: 1_300_000 });
    expect(f.byPot.has(-1)).toBe(false);
  });

  it("spreads what's left over the months until the target", () => {
    expect(neededPerMonth(15_000_000, "2027-10-10", "2026-10-28")).toBe(1_153_847); // 13 months incl. this one
    expect(neededPerMonth(0, "2027-10-10", "2026-10-28")).toBeNull();
    expect(neededPerMonth(1_000, null, "2026-10-28")).toBeNull();
  });
});

describe("goals", () => {
  it("only takes saving kantong with a target, in priority order, paced on the last three full months", () => {
    const pots = [
      pot(1, { target: 1_000_000, priority: 2 }),
      pot(2, { target: 300_000, priority: 1 }),
      pot(3, { kind: "spending", target: 50 }),
      pot(4),
    ];
    const moves = toMoves([], [
      { date: "2026-07-15", fromPotId: null, toPotId: 2, amount: 300_000 },
      { date: "2026-08-15", fromPotId: null, toPotId: 1, amount: 600_000 },
      { date: "2026-09-15", fromPotId: 1, toPotId: null, amount: 300_000 },
      { date: "2026-10-15", fromPotId: null, toPotId: 1, amount: 9_000_000 }, // this month: not in the pace
    ]);
    const goals = buildGoals(pots, new Map([[1, 300_000], [2, 300_000]]), moves, "2026-10-28");
    expect(goals.map((g) => [g.id, g.status, g.pace, g.eta])).toEqual([
      [2, "done", 200_000, null],
      [1, "active", 200_000, "2027-02"],
    ]);
  });
});

describe("category changes", () => {
  it("lists expense categories by size of change, skipping unchanged ones", () => {
    const cats = [
      { id: 1, name: "Lifestyle", kind: "expense" as const, group: "Keinginan" },
      { id: 2, name: "Keluarga", kind: "expense" as const, group: "Lainnya" },
      { id: 3, name: "Gaji", kind: "income" as const, group: "Rutin" },
      { id: 4, name: "Makan", kind: "expense" as const, group: "Kebutuhan" },
    ];
    const sums = [
      { month: "2026-09", categoryId: 1, total: 500_000 },
      { month: "2026-09", categoryId: 3, total: 5_000_000 },
      { month: "2026-10", categoryId: 1, total: 1_000_000 },
      { month: "2026-10", categoryId: 2, total: 3_000_000 },
      { month: "2026-10", categoryId: 3, total: 4_000_000 },
      { month: "2026-09", categoryId: 4, total: 900_000 },
      { month: "2026-10", categoryId: 4, total: 900_000 },
    ];
    const rows = categoryChanges(summarizeMonth(sums, cats, "2026-10"), summarizeMonth(sums, cats, "2026-09"), cats);
    expect(rows.map((r) => [r.name, r.prev, r.cur, r.diff])).toEqual([
      ["Keluarga", 0, 3_000_000, 3_000_000],
      ["Lifestyle", 500_000, 1_000_000, 500_000],
    ]);
  });
});
