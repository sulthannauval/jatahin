import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import readExcelFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { billPayments, bills, budgets, categories, potAdjustments, pots, savingPlans, settings, transactions, transfers } from "../db/schema";
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
    { id: 7, name: "Gaji", kind: "income", group: "Rutin", sortOrder: 0 },
    { id: 9, name: "Rokok", kind: "expense", group: "Keinginan", sortOrder: 2, archived: true },
  ]);
  await db.insert(pots).values([
    { id: 2, name: "Dana Darurat", note: "6x pengeluaran", target: 30000000, targetDate: "2027-06-30", priority: 1, openingBalance: 4500000, openingDate: "2026-01-01" },
    { id: 4, name: "Liburan", sortOrder: 1, archived: true },
    { id: 6, name: "Makan", kind: "spending", sortOrder: 2 },
  ]);
  await db.insert(transactions).values([
    { id: 10, date: "2026-10-01", categoryId: 7, description: "Gaji Oktober", amount: 8000000, createdAt: new Date("2026-10-01T02:03:04.567Z") },
    { id: 11, date: "2026-10-02", categoryId: 3, description: "Nasi padang, \"pedas\"", amount: 25000, createdAt: new Date("2026-10-02T05:00:00.001Z") },
    { id: 15, date: "2026-10-04", categoryId: 3, potId: 6, description: "0123", amount: 30000, createdAt: new Date("2026-10-04T00:00:00Z") },
  ]);
  await db.insert(transfers).values([
    { id: 3, date: "2026-10-03", toPotId: 2, amount: 1500000, createdAt: new Date("2026-10-03T00:00:00Z") },
    { id: 4, date: "2026-10-03", fromPotId: 2, toPotId: 6, amount: 600000, note: "Jatah makan", createdAt: new Date("2026-10-03T01:00:00Z") },
  ]);
  await db.insert(savingPlans).values([{ month: "2026-10-01", amount: 1500000 }]);
  await db.insert(potAdjustments).values([
    { id: 1, potId: 2, date: "2026-10-05", amount: -12500, note: "Biaya admin", createdAt: new Date("2026-10-05T10:00:00Z") },
  ]);
  await db.insert(budgets).values([
    { month: "2026-10-01", categoryId: 3, amount: 1200000 },
    { month: "2026-11-01", categoryId: 3, amount: 0 },
  ]);
  await db.insert(bills).values([
    { id: 5, name: "Listrik PLN", categoryId: 3, schedule: "payday", amount: 519280, sortOrder: 1, createdAt: new Date("2026-10-28T01:00:00Z") },
    { id: 8, name: "BPJS", categoryId: 9, potId: 6, schedule: "date", dueDay: 1, note: "ke Mandiri", sortOrder: 2, createdAt: new Date("2026-10-28T02:00:00Z") },
  ]);
  await db.insert(billPayments).values([
    { billId: 5, month: "2026-10-01", transactionId: 11, createdAt: new Date("2026-10-28T01:00:00Z") },
    { billId: 8, month: "2026-11-01", transactionId: null, createdAt: new Date("2026-10-29T00:00:00Z") },
  ]);
  await db.insert(settings).values({ id: 1, carryStartMonth: "2026-01", carryStartBalance: 421062, paydayDay: 10, salaryCategoryId: 7 });
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
    expect(res).toEqual({ categories: 3, pots: 3, transactions: 3, transfers: 2, adjustments: 1, budgets: 2, bills: 2 });
    expect(await readBackup(target)).toEqual(await readBackup(source));
  });

  it("moves ID sequences past restored rows", async () => {
    const source = await freshDb();
    await seed(source);
    const target = await freshDb();
    await restoreBackup(target, parseBackup(await throughXlsx(source)), false);
    const [tx] = await target.insert(transactions).values({ date: "2026-10-06", categoryId: 3, amount: 1000 }).returning();
    const [cat] = await target.insert(categories).values({ name: "Baru", kind: "expense" }).returning();
    const [move] = await target.insert(transfers).values({ date: "2026-10-06", toPotId: 2, amount: 1000 }).returning();
    expect(tx.id).toBe(16);
    expect(cat.id).toBe(10);
    expect(move.id).toBe(5);
    const [bill] = await target.insert(bills).values({ name: "Wifi", categoryId: 3 }).returning();
    expect(bill.id).toBe(9);
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

  it("reads a backup made before tagihan existed", async () => {
    const source = await freshDb();
    await seed(source);
    const sheets = (await throughXlsx(source)).filter((s) => s.sheet !== "Tagihan" && s.sheet !== "Pembayaran Tagihan");
    const d = parseBackup(sheets);
    expect(d.bills).toEqual([]);
    expect(d.billPayments).toEqual([]);
    expect(d.settings).toMatchObject({ paydayDay: 10, salaryCategoryId: 7 });
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
    sheets.find((s) => s.sheet === "Info")!.data[1][1] = 3;
    expect(() => parseBackup(sheets)).toThrow("Versi format backup 3 tidak didukung.");
    const missing = (await throughXlsx(source)).filter((s) => s.sheet !== "Pindah Kantong");
    expect(() => parseBackup(missing)).toThrow('Sheet "Pindah Kantong" tidak ditemukan di file backup.');
  });

  it("restores a version 1 backup, turning savings entries into moves between kantong", async () => {
    const at = (d: string) => `${d}T00:00:00.000Z`;
    const v1: InSheet[] = [
      { sheet: "Info", data: [["Jatahin! backup"], ["Versi format", 1]] },
      { sheet: "Kategori", data: [
        ["ID", "Nama", "Jenis", "Grup", "Peran", "Urutan", "Diarsipkan"],
        [3, "Makan", "Pengeluaran", "Kebutuhan", null, 0, "Tidak"],
        [5, "Nabung", "Pengeluaran", "Saving", "Setoran tabungan", 1, "Tidak"],
        [8, "Ambil", "Pemasukan", "Bukan Income", "Penarikan tabungan", 1, "Tidak"],
      ] },
      { sheet: "Pos", data: [
        ["ID", "Nama", "Catatan", "Target", "Tanggal target", "Prioritas", "Saldo acuan", "Tanggal acuan", "Urutan", "Diarsipkan"],
        [2, "Dana Darurat", null, 30000000, null, 1, 0, null, 0, "Tidak"],
      ] },
      { sheet: "Transaksi", data: [
        ["ID", "Tanggal", "ID kategori", "Jenis", "Kategori", "ID pos", "Pos", "Keterangan", "Nominal", "Dicatat"],
        [11, "2026-10-02", 3, "Pengeluaran", "Makan", null, null, "Nasi", 25000, at("2026-10-02")],
        [14, "2026-10-03", 5, "Pengeluaran", "Nabung", 2, "Dana Darurat", null, 1500000, at("2026-10-03")],
        [15, "2026-10-04", 8, "Pemasukan", "Ambil", 2, "Dana Darurat", "Darurat", 300000, at("2026-10-04")],
      ] },
      { sheet: "Penyesuaian Pos", data: [["ID", "ID pos", "Pos", "Tanggal", "Nominal", "Catatan", "Dicatat"]] },
      { sheet: "Budget", data: [["Bulan", "ID kategori", "Kategori", "Nominal"], ["2026-10", 3, "Makan", 900000], ["2026-10", 5, "Nabung", 1500000]] },
      { sheet: "Pengaturan", data: [["Pengaturan", "Nilai"], ["Mulai saldo bawaan (YYYY-MM)", "2026-09"], ["Saldo awal di bulan itu", 0]] },
    ];
    const d = parseBackup(v1);
    expect(d.categories.map((c) => c.name)).toEqual(["Makan"]);
    expect(d.pots[0]).toMatchObject({ id: 2, kind: "saving" });
    expect(d.transactions.map((t) => t.id)).toEqual([11]);
    expect(d.transfers).toEqual([
      { id: 1, date: "2026-10-03", fromPotId: null, toPotId: 2, amount: 1500000, note: "", createdAt: new Date(at("2026-10-03")) },
      { id: 2, date: "2026-10-04", fromPotId: 2, toPotId: null, amount: 300000, note: "Darurat", createdAt: new Date(at("2026-10-04")) },
    ]);
    expect(d.budgets).toEqual([{ month: "2026-10", categoryId: 3, amount: 900000 }]);
    expect(d.savingPlans).toEqual([{ month: "2026-10", amount: 1500000 }]);
    const target = await freshDb();
    expect(await restoreBackup(target, d, false)).toMatchObject({ transactions: 1, transfers: 2 });
  });

  it("does not mistake the old MoneyFlows spreadsheet for a backup", () => {
    expect(isBackup([{ sheet: "Daily Log", data: [["", "Tanggal"]] }, { sheet: "Categories", data: [] }])).toBe(false);
  });
});
