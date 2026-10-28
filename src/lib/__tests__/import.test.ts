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
import { getDashboard, getSavings, getTransactions } from "../queries";
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
    expect(res.transactions).toBe(248);
    await expect(applyImport(db, data, false)).rejects.toThrow();

    const d = await getDashboard(db, "2026-10", "2026-10-28");
    expect(d.summary.income).toBe(11300000);
    expect(d.summary.expense).toBe(11039670);
    expect(d.summary.withdraw).toBe(6300000);
    expect(d.summary.deposit).toBe(1500000);
    // Saved from real income: (5.000.000 − (11.039.670 − 6.300.000 from savings − 1.500.000 deposit)) / 5.000.000
    expect(d.summary.realIncome).toBe(5000000);
    expect(d.summary.fromSavings).toBe(6300000);
    expect(d.summary.savingRate).toBeCloseTo(0.352066, 5);
    expect(d.carry).toEqual({ opening: 421062, closing: 681392 });
    expect(d.summary.byGroup.get("Wajib")).toBe(2279602);
    expect(d.summary.byGroup.get("Kebutuhan")).toBe(596100);
    expect(d.summary.byGroup.get("Keinginan")).toBe(1452990);
    expect(d.summary.byGroup.get("Lainnya")).toBe(5210978);
    expect(d.budgetTotal).toBe(5000000);
    // Budget is checked only against categories that have one; Keluarga & Sosial + Transfer Adik sit outside it.
    const split = budgetSplit(d.lines);
    expect(split).toMatchObject({ planned: 5603692, unplanned: 5435978 });
    const util = d.cats.find((c) => c.name === "Utility")!;
    const line = d.lines.find((l) => l.categoryId === util.id)!;
    expect(line).toMatchObject({ budget: 1100000, actual: 991292, left: 108708 });
    // Trend income is real income; income + withdrawals is the sheet's income, and net is the sheet's difference.
    expect(d.trend.map((t) => [t.month, t.income + t.withdraw, t.expense, t.net])).toEqual([
      ["2026-07", 5800988, 5794679, 6309],
      ["2026-08", 5267500, 5228886, 38614],
      ["2026-09", 9545000, 9123938, 421062],
      ["2026-10", 11300000, 11039670, 260330],
    ]);
    expect(d.trend.at(-1)!.income).toBe(5000000);

    expect(d.table.map((t) => [t.month, t.opening, t.closing])).toEqual([
      ["2026-07", null, null],
      ["2026-08", null, null],
      ["2026-09", 0, 421062],
      ["2026-10", 421062, 681392],
    ]);

    const s = await getSavings(db, "2026-10-28");
    const fam = s.details.find((x) => x.potId === s.pots.find((p) => p.name === "Tabungan Keluarga")!.id)!;
    // The 25 Sep withdrawal (on the opening date) now counts.
    expect(fam).toMatchObject({ openingBalance: 4300000, deposits: 300000, withdrawals: 4600000, balance: 0, withdrawnAllTime: 5875000 });
    const dd = s.details.find((x) => x.potId === s.pots.find((p) => p.name === "Dana Darurat")!.id)!;
    expect(dd).toMatchObject({ deposits: 3320000, withdrawals: 3320000, balance: 0 });
    const bal = Object.fromEntries(s.pots.map((p) => [p.name, p.balance]));
    // Matches the Jago Family pocket: 0 on 27 Oct (before interest).
    expect(bal).toEqual({ "Dana Darurat": 0, "Tabungan Keluarga": 0, Laptop: 0, Motor: 0 });
    expect(s.goals.map((g) => [g.name, g.target, g.status])).toEqual([
      ["Dana Darurat", 15000000, "active"],
      ["Laptop", 15000000, "queued"],
      ["Motor", 25000000, "queued"],
    ]);

    const okt = await getTransactions(db, { month: "2026-10" });
    expect(okt.reduce((a, t) => a + (t.kind === "income" ? t.amount : 0), 0)).toBe(11300000);
    const search = await getTransactions(db, { month: "2026-10", q: "bandung" });
    expect(search.length).toBe(2);
    await client.close();
  });
});
