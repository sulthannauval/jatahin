import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import readExcelFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { budgets, categories, potAdjustments, pots, settings, transactions } from "../db/schema";
import { isBackup, parseBackup, toSheets, type InSheet } from "../backup/format";
import { readBackup, restoreBackup } from "../backup/db";

async function freshDb(): Promise<DB> {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return drizzle(client, { schema }) as unknown as DB;
}

async function seed(db: DB) {
  await db.insert(categories).values([
    { id: 3, name: "Makan", kind: "expense", group: "Kebutuhan", sortOrder: 0 },
    { id: 5, name: "Nabung", kind: "expense", group: "Saving", role: "saving_deposit", sortOrder: 1 },
    { id: 7, name: "Gaji", kind: "income", group: "Rutin", sortOrder: 0 },
    { id: 8, name: "Ambil dari Tabungan", kind: "income", group: "Bukan Income", role: "saving_withdraw", sortOrder: 1 },
    { id: 9, name: "Rokok", kind: "expense", group: "Keinginan", sortOrder: 2, archived: true },
  ]);
  await db.insert(pots).values([
    { id: 2, name: "Dana Darurat", note: "6x pengeluaran", target: 30000000, targetDate: "2027-06-30", priority: 1, openingBalance: 4500000, openingDate: "2026-01-01" },
    { id: 4, name: "Liburan", sortOrder: 1, archived: true },
  ]);
  await db.insert(transactions).values([
    { id: 10, date: "2026-10-01", categoryId: 7, description: "Gaji Oktober", amount: 8000000, createdAt: new Date("2026-10-01T02:03:04.567Z") },
    { id: 11, date: "2026-10-02", categoryId: 3, description: "Nasi padang, \"pedas\"", amount: 25000, createdAt: new Date("2026-10-02T05:00:00.001Z") },
    { id: 14, date: "2026-10-03", categoryId: 5, potId: 2, amount: 1500000, createdAt: new Date("2026-10-03T00:00:00Z") },
    { id: 15, date: "2026-10-04", categoryId: 8, potId: 2, description: "0123", amount: 300000, createdAt: new Date("2026-10-04T00:00:00Z") },
  ]);
  await db.insert(potAdjustments).values([
    { id: 1, potId: 2, date: "2026-10-05", amount: -12500, note: "Biaya admin", createdAt: new Date("2026-10-05T10:00:00Z") },
  ]);
  await db.insert(budgets).values([
    { month: "2026-10-01", categoryId: 3, amount: 1200000 },
    { month: "2026-11-01", categoryId: 3, amount: 0 },
  ]);
  await db.insert(settings).values({ id: 1, carryStartMonth: "2026-01", carryStartBalance: 421062 });
}

/** Writes the backup to real .xlsx bytes and reads them back, like a download followed by an upload. */
async function throughXlsx(db: DB): Promise<InSheet[]> {
  const buffer = await writeXlsxFile(toSheets(await readBackup(db), new Date("2026-10-28T10:00:00Z"))).toBuffer();
  return (await readExcelFile(buffer)) as unknown as InSheet[];
}

describe("backup", () => {
  it("restores every finance row exactly, with the same IDs", async () => {
    const source = await freshDb();
    await seed(source);
    const sheets = await throughXlsx(source);
    expect(isBackup(sheets)).toBe(true);

    const target = await freshDb();
    const res = await restoreBackup(target, parseBackup(sheets), false);
    expect(res).toEqual({ categories: 5, pots: 2, transactions: 4, adjustments: 1, budgets: 2 });
    expect(await readBackup(target)).toEqual(await readBackup(source));
  });

  it("moves ID sequences past restored rows", async () => {
    const source = await freshDb();
    await seed(source);
    const target = await freshDb();
    await restoreBackup(target, parseBackup(await throughXlsx(source)), false);
    const [tx] = await target.insert(transactions).values({ date: "2026-10-06", categoryId: 3, amount: 1000 }).returning();
    const [cat] = await target.insert(categories).values({ name: "Baru", kind: "expense" }).returning();
    expect(tx.id).toBe(16);
    expect(cat.id).toBe(10);
  });

  it("refuses to overwrite existing data unless asked, and replaces it when asked", async () => {
    const source = await freshDb();
    await seed(source);
    const data = parseBackup(await throughXlsx(source));
    const target = await freshDb();
    await restoreBackup(target, data, false);
    await expect(restoreBackup(target, data, false)).rejects.toThrow("sudah berisi data");
    await target.insert(transactions).values({ date: "2026-10-09", categoryId: 3, amount: 999 });
    await restoreBackup(target, data, true);
    expect(await readBackup(target)).toEqual(await readBackup(source));
  });

  it("round-trips an empty database", async () => {
    const source = await freshDb();
    const target = await freshDb();
    await restoreBackup(target, parseBackup(await throughXlsx(source)), false);
    expect(await readBackup(target)).toEqual(await readBackup(source));
  });

  it("names the sheet, row and column of a broken reference", async () => {
    const source = await freshDb();
    await seed(source);
    const sheets = await throughXlsx(source);
    const tx = sheets.find((s) => s.sheet === "Transaksi")!;
    tx.data[2][2] = 99;
    expect(() => parseBackup(sheets)).toThrow("Sheet Transaksi baris 3, kolom ID kategori: kategori 99 tidak ada di sheet Kategori.");
  });

  it("rejects an unknown format version and a missing sheet", async () => {
    const source = await freshDb();
    const sheets = await throughXlsx(source);
    sheets.find((s) => s.sheet === "Info")!.data[1][1] = 2;
    expect(() => parseBackup(sheets)).toThrow("Versi format backup 2 tidak didukung.");
    const missing = (await throughXlsx(source)).filter((s) => s.sheet !== "Pos");
    expect(() => parseBackup(missing)).toThrow('Sheet "Pos" tidak ditemukan di file backup.');
  });

  it("does not mistake the old MoneyFlows spreadsheet for a backup", () => {
    expect(isBackup([{ sheet: "Daily Log", data: [["", "Tanggal"]] }, { sheet: "Categories", data: [] }])).toBe(false);
  });
});
