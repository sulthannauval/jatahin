// Checks the app reproduces the numbers from the original spreadsheet.
// Needs your own export at .local/MoneyFlows.xlsx (never committed); skipped otherwise.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { parseWorkbook, type Sheet } from "../import/parse";
import { applyImport } from "../import/apply";
import { getActivity, getDashboard, getKantong } from "../queries";
import { budgetSplit } from "../finance";

const FILE = ".local/MoneyFlows.xlsx";

describe.skipIf(!existsSync(FILE))("import from MoneyFlows.xlsx", () => {
  it("matches the spreadsheet's October 2026 dashboard", async () => {
    const sheets = (await readExcelFile(FILE)) as Sheet[];
    const data = parseWorkbook(sheets);
    console.log("warnings:", data.warnings);
    expect(data.transactions.length).toBe(248);

    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as DB;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const res = await applyImport(db, data, false);
    // 24 savings deposits and withdrawals became moves between kantong.
    expect(res).toMatchObject({ transactions: 224, transfers: 24 });
    await expect(applyImport(db, data, false)).rejects.toThrow();

    const d = await getDashboard(db, "2026-10", "2026-10-28");
    // The sheet's 11.300.000 income held 6.300.000 taken out of savings; its 11.039.670 spending held a 1.500.000 deposit.
    expect(d.summary.income).toBe(5000000);
    expect(d.summary.expense).toBe(9539670);
    expect(d.summary.savingsOut).toBe(6300000);
    // Saved from income: (5.000.000 − (9.539.670 − 6.300.000 from savings)) / 5.000.000, as the sheet had it.
    expect(d.summary.fromSavings).toBe(6300000);
    expect(d.summary.savingRate).toBeCloseTo(0.352066, 5);
    // Kantong Utama ends where the sheet's balance did.
    expect(d.carry).toEqual({ opening: 421062, closing: 681392 });
    expect(d.summary.net + d.moved).toBe(260330);
    expect(d.savingPlan).toBe(1500000);
    expect(d.saved).toBe(1500000);
    expect(d.summary.byGroup.get("Wajib")).toBe(2279602);
    expect(d.summary.byGroup.get("Kebutuhan")).toBe(596100);
    expect(d.summary.byGroup.get("Keinginan")).toBe(1452990);
    expect(d.summary.byGroup.get("Lainnya")).toBe(5210978);
    // The sheet's 5.000.000 budget held the 1.500.000 deposit, now the saving plan.
    expect(d.budgetTotal).toBe(3500000);
    // Budget is checked only against categories that have one; Keluarga & Sosial + Transfer Adik sit outside it.
    const split = budgetSplit(d.lines);
    expect(split).toMatchObject({ planned: 4103692, unplanned: 5435978 });
    const util = d.cats.find((c) => c.name === "Utility")!;
    const line = d.lines.find((l) => l.categoryId === util.id)!;
    expect(line).toMatchObject({ budget: 1100000, actual: 991292, left: 108708 });
    // Income plus money taken out of savings is the sheet's income; Kantong Utama's change is the sheet's difference.
    expect(d.trend.map((t) => [t.month, t.income + t.withdraw])).toEqual([
      ["2026-07", 5800988],
      ["2026-08", 5267500],
      ["2026-09", 9545000],
      ["2026-10", 11300000],
    ]);
    expect(d.trend.at(-1)!.income).toBe(5000000);

    expect(d.table.map((t) => [t.month, t.net + t.moved, t.opening, t.closing])).toEqual([
      ["2026-07", 6309, null, null],
      ["2026-08", 38614, null, null],
      ["2026-09", 421062, 0, 421062],
      ["2026-10", 260330, 421062, 681392],
    ]);

    const s = await getKantong(db, "2026-10-28");
    expect(s.utama).toBe(681392);
    const fam = s.details.find((x) => x.potId === s.pots.find((p) => p.name === "Tabungan Keluarga")!.id)!;
    // The 25 Sep withdrawal (on the opening date) now counts.
    expect(fam).toMatchObject({ openingBalance: 4300000, inflow: 300000, outflow: 4600000, balance: 0, outAllTime: 5875000 });
    const dd = s.details.find((x) => x.potId === s.pots.find((p) => p.name === "Dana Darurat")!.id)!;
    expect(dd).toMatchObject({ inflow: 3320000, outflow: 3320000, balance: 0 });
    const bal = Object.fromEntries(s.pots.map((p) => [p.name, p.balance]));
    // Matches the Jago Family pocket: 0 on 27 Oct (before interest).
    expect(bal).toEqual({ "Dana Darurat": 0, "Tabungan Keluarga": 0, Laptop: 0, Motor: 0 });
    expect(s.goals.map((g) => [g.name, g.target, g.status])).toEqual([
      ["Dana Darurat", 15000000, "active"],
      ["Laptop", 15000000, "queued"],
      ["Motor", 25000000, "queued"],
    ]);

    const okt = await getActivity(db, { month: "2026-10" });
    expect(okt.reduce((a, t) => a + (t.type === "tx" && t.kind === "income" ? t.amount : 0), 0)).toBe(5000000);
    expect(okt.filter((t) => t.type === "transfer").reduce((a, t) => a + t.amount, 0)).toBe(7800000);
    const search = await getActivity(db, { month: "2026-10", q: "bandung" });
    expect(search.length).toBe(2);
    const fromDana = await getActivity(db, { month: "2026-10", q: "dana darurat" });
    expect(fromDana.map((t) => (t.type === "transfer" ? t.amount : null))).toEqual([1500000, 1500000, 300000, 200000]);
    await client.close();
  });
});
