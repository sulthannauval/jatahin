// The Jatahin! backup workbook: one sheet per table, read back by header name. No DB access here.
import { isDateKey, isMonthKey } from "../dates";
import type { Kind, PotKind } from "../finance";
import { splitLegacy, splitLegacyBudgets, type LegacyRole } from "../legacy";
import type { Cell, Sheet as OutSheet } from "write-excel-file/node";

type Value = string | number | boolean | Date | null | undefined;
/** A sheet as read-excel-file returns it. Its own types declare date cells as `typeof Date`, so they are not reused. */
export type InSheet = { sheet: string; data: Value[][] };

export const BACKUP_TITLE = "Jatahin! backup";
export const BACKUP_VERSION = 2;

export type BackupCategory = { id: number; name: string; kind: Kind; group: string; sortOrder: number; archived: boolean };
export type BackupPot = {
  id: number; name: string; kind: PotKind; note: string; target: number | null; targetDate: string | null; priority: number | null;
  openingBalance: number; openingDate: string | null; sortOrder: number; archived: boolean;
};
export type BackupTx = { id: number; date: string; categoryId: number; potId: number | null; description: string; amount: number; createdAt: Date };
export type BackupTransfer = { id: number; date: string; fromPotId: number | null; toPotId: number | null; amount: number; note: string; createdAt: Date };
export type BackupAdjustment = { id: number; potId: number; date: string; amount: number; note: string; createdAt: Date };
export type BackupBudget = { month: string; categoryId: number; amount: number };
export type BackupPlan = { month: string; amount: number };
export type BackupBill = {
  id: number; name: string; categoryId: number; potId: number | null; schedule: "payday" | "date"; dueDay: number | null;
  amount: number | null; note: string; sortOrder: number; createdAt: Date;
};
/** transactionId null: skipped that month. */
export type BackupBillPayment = { billId: number; month: string; transactionId: number | null; createdAt: Date };
export type BackupData = {
  categories: BackupCategory[];
  pots: BackupPot[];
  transactions: BackupTx[];
  transfers: BackupTransfer[];
  adjustments: BackupAdjustment[];
  budgets: BackupBudget[];
  savingPlans: BackupPlan[];
  bills: BackupBill[];
  billPayments: BackupBillPayment[];
  settings: { carryStartMonth: string | null; carryStartBalance: number; paydayDay: number | null; salaryCategoryId: number | null };
};


const SHEET = {
  info: "Info",
  categories: "Kategori",
  pots: "Kantong",
  transactions: "Transaksi",
  transfers: "Pindah Kantong",
  adjustments: "Penyesuaian Kantong",
  budgets: "Budget",
  savingPlans: "Rencana Menabung",
  bills: "Tagihan",
  billPayments: "Pembayaran Tagihan",
  settings: "Pengaturan",
} as const;
/** Version 1 named kantong "pos" and had no transfers: savings were income and spending with a role. */
const V1 = { pots: "Pos", adjustments: "Penyesuaian Pos", potId: "ID pos" } as const;

const KIND: Record<Kind, string> = { expense: "Pengeluaran", income: "Pemasukan" };
const POT_KIND: Record<PotKind, string> = { saving: "Tabungan", spending: "Belanja" };
const ROLE: Record<NonNullable<LegacyRole>, string> = { saving_deposit: "Setoran tabungan", saving_withdraw: "Penarikan tabungan" };
const SETTING = {
  carryStartMonth: "Mulai saldo bawaan (YYYY-MM)", carryStartBalance: "Saldo awal di bulan itu", paydayDay: "Tanggal gajian", salaryCategoryId: "ID kategori gaji",
};
const SCHEDULE = { payday: "Pas gajian", date: "Tanggal tertentu" } as const;

const money = (v: number | null): Cell => (v === null ? null : { value: v, type: Number, format: "#,##0" });
// Dates stay as YYYY-MM-DD text so no spreadsheet app can shift them across time zones.
const text = (v: string | null): Cell => (v === null || v === "" ? null : { value: v, type: String, format: "@" });
const yesNo = (v: boolean) => (v ? "Ya" : "Tidak");
const UTAMA = "Kantong Utama";
const head = (labels: string[]): Cell[] => labels.map((value) => ({ value, fontWeight: "bold" as const }));

/** Turns backup data into workbook sheets for write-excel-file. Name columns next to IDs are for reading only. */
export function toSheets(d: BackupData, exportedAt: Date): OutSheet<Buffer>[] {
  const catName = new Map(d.categories.map((c) => [c.id, c.name]));
  const catKind = new Map(d.categories.map((c) => [c.id, c.kind]));
  const potName = new Map(d.pots.map((p) => [p.id, p.name]));
  const billName = new Map(d.bills.map((b) => [b.id, b.name]));
  const w = (...widths: number[]) => widths.map((width) => ({ width }));

  return [
    {
      sheet: SHEET.info,
      columns: w(28, 40),
      data: [
        [{ value: BACKUP_TITLE, fontWeight: "bold" }],
        ["Versi format", BACKUP_VERSION],
        ["Diekspor", text(exportedAt.toISOString())],
        ["Kategori", d.categories.length],
        ["Kantong", d.pots.length],
        ["Transaksi", d.transactions.length],
        ["Pindah kantong", d.transfers.length],
        ["Penyesuaian kantong", d.adjustments.length],
        ["Budget", d.budgets.length],
        ["Rencana menabung", d.savingPlans.length],
        ["Tagihan", d.bills.length],
        [],
        ["Catatan", "Impor file ini di Pengaturan → Ekspor & impor untuk memulihkan data. Kolom ID menghubungkan antar sheet, jangan diubah."],
      ],
    },
    {
      sheet: SHEET.categories,
      columns: w(6, 28, 14, 14, 8, 11),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Nama", "Jenis", "Grup", "Urutan", "Diarsipkan"]),
        ...d.categories.map((c) => [c.id, c.name, KIND[c.kind], c.group, c.sortOrder, yesNo(c.archived)]),
      ],
    },
    {
      sheet: SHEET.pots,
      columns: w(6, 24, 12, 30, 16, 14, 10, 16, 14, 8, 11),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Nama", "Jenis kantong", "Catatan", "Target", "Tanggal target", "Prioritas", "Saldo acuan", "Tanggal acuan", "Urutan", "Diarsipkan"]),
        ...d.pots.map((p) => [
          p.id, p.name, POT_KIND[p.kind], text(p.note), money(p.target), text(p.targetDate), p.priority, money(p.openingBalance), text(p.openingDate), p.sortOrder, yesNo(p.archived),
        ]),
      ],
    },
    {
      sheet: SHEET.transactions,
      columns: w(7, 12, 12, 13, 26, 8, 20, 34, 16, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Tanggal", "ID kategori", "Jenis", "Kategori", "ID kantong", "Kantong", "Keterangan", "Nominal", "Dicatat"]),
        ...d.transactions.map((t) => [
          t.id, text(t.date), t.categoryId, KIND[catKind.get(t.categoryId) ?? "expense"], catName.get(t.categoryId) ?? null,
          t.potId, t.potId === null ? null : potName.get(t.potId) ?? null, text(t.description), money(t.amount), text(t.createdAt.toISOString()),
        ]),
      ],
    },
    {
      sheet: SHEET.transfers,
      columns: w(7, 12, 9, 20, 9, 20, 16, 34, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Tanggal", "ID dari", "Dari", "ID ke", "Ke", "Nominal", "Catatan", "Dicatat"]),
        ...d.transfers.map((t) => [
          t.id, text(t.date), t.fromPotId, potName.get(t.fromPotId ?? -1) ?? UTAMA, t.toPotId, potName.get(t.toPotId ?? -1) ?? UTAMA,
          money(t.amount), text(t.note), text(t.createdAt.toISOString()),
        ]),
      ],
    },
    {
      sheet: SHEET.adjustments,
      columns: w(7, 10, 20, 12, 16, 34, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "ID kantong", "Kantong", "Tanggal", "Nominal", "Catatan", "Dicatat"]),
        ...d.adjustments.map((a) => [a.id, a.potId, potName.get(a.potId) ?? null, text(a.date), money(a.amount), text(a.note), text(a.createdAt.toISOString())]),
      ],
    },
    {
      sheet: SHEET.budgets,
      columns: w(10, 12, 26, 16),
      stickyRowsCount: 1,
      data: [
        head(["Bulan", "ID kategori", "Kategori", "Nominal"]),
        ...d.budgets.map((b) => [text(b.month), b.categoryId, catName.get(b.categoryId) ?? null, money(b.amount)]),
      ],
    },
    {
      sheet: SHEET.savingPlans,
      columns: w(10, 16),
      stickyRowsCount: 1,
      data: [head(["Bulan", "Nominal"]), ...d.savingPlans.map((b) => [text(b.month), money(b.amount)])],
    },
    {
      sheet: SHEET.bills,
      columns: w(6, 24, 12, 24, 10, 20, 16, 10, 16, 30, 8, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Nama", "ID kategori", "Kategori", "ID kantong", "Kantong", "Jadwal", "Tanggal", "Nominal awal", "Catatan", "Urutan", "Dibuat"]),
        ...d.bills.map((b) => [
          b.id, b.name, b.categoryId, catName.get(b.categoryId) ?? null, b.potId, b.potId === null ? UTAMA : potName.get(b.potId) ?? null,
          SCHEDULE[b.schedule], b.dueDay, money(b.amount), text(b.note), b.sortOrder, text(b.createdAt.toISOString()),
        ]),
      ],
    },
    {
      sheet: SHEET.billPayments,
      columns: w(10, 24, 10, 14, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID tagihan", "Tagihan", "Bulan", "ID transaksi", "Dicatat"]),
        ...d.billPayments.map((p) => [p.billId, billName.get(p.billId) ?? null, text(p.month), p.transactionId, text(p.createdAt.toISOString())]),
      ],
    },
    {
      sheet: SHEET.settings,
      columns: w(32, 18),
      data: [
        head(["Pengaturan", "Nilai"]),
        [SETTING.carryStartMonth, text(d.settings.carryStartMonth)],
        [SETTING.carryStartBalance, money(d.settings.carryStartBalance)],
        [SETTING.paydayDay, d.settings.paydayDay],
        [SETTING.salaryCategoryId, d.settings.salaryCategoryId],
      ],
    },
  ];
}

// ── Reading ───────────────────────────────────────────────────

const cellStr = (v: Value) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).trim());

/** True when the workbook was written by toSheets(), as opposed to the old MoneyFlows spreadsheet. */
export function isBackup(sheets: InSheet[]): boolean {
  const info = sheets.find((s) => s.sheet === SHEET.info);
  return cellStr(info?.data[0]?.[0]) === BACKUP_TITLE;
}

class BackupError extends Error {}

function table(sheets: InSheet[], name: string, columns: string[]) {
  const s = sheets.find((x) => x.sheet === name);
  if (!s) throw new BackupError(`Sheet "${name}" tidak ditemukan di file backup.`);
  const header = (s.data[0] ?? []).map(cellStr);
  const idx = columns.map((c) => {
    const i = header.indexOf(c);
    if (i < 0) throw new BackupError(`Kolom "${c}" tidak ditemukan di sheet ${name}.`);
    return i;
  });
  const rows = s.data.slice(1).map((r, n) => ({ n: n + 2, r })).filter(({ r }) => r.some((v) => cellStr(v) !== ""));
  return rows.map(({ n, r }) => {
    const at = (label: string) => r[idx[columns.indexOf(label)]];
    const bad = (label: string, what: string): never => {
      throw new BackupError(`Sheet ${name} baris ${n}, kolom ${label}: ${what}.`);
    };
    const str = (label: string) => cellStr(at(label));
    const int = (label: string, opt?: "optional"): number | null => {
      const v = at(label);
      if (cellStr(v) === "") return opt ? null : bad(label, "tidak boleh kosong");
      const x = typeof v === "number" ? v : Number(cellStr(v).replace(/[.,\s]/g, ""));
      return Number.isSafeInteger(x) ? x : bad(label, "harus berupa bilangan bulat");
    };
    const date = (label: string, opt?: "optional"): string | null => {
      const v = at(label);
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : cellStr(v);
      if (s === "" && opt) return null;
      return isDateKey(s) ? s : bad(label, "tanggal harus berformat YYYY-MM-DD");
    };
    const time = (label: string): Date => {
      const v = at(label);
      const d = v instanceof Date ? v : new Date(cellStr(v));
      return Number.isNaN(d.getTime()) ? bad(label, "waktu tidak valid") : d;
    };
    const pick = <T extends string>(label: string, map: Record<T, string>, opt?: "optional"): T | null => {
      const s = str(label);
      if (s === "" && opt) return null;
      const hit = (Object.keys(map) as T[]).find((k) => map[k] === s);
      return hit ?? bad(label, `harus salah satu dari ${Object.values(map).join(", ")}`);
    };
    return { n, str, int: (l: string) => int(l)!, intOrNull: (l: string) => int(l, "optional"), date: (l: string) => date(l)!, dateOrNull: (l: string) => date(l, "optional"), time, pick, bad };
  });
}

/**
 * Reads a backup workbook. Throws an Indonesian message naming the sheet, row and column of the first problem.
 * Version 1 backups (savings as income and spending with a role) are turned into moves between kantong.
 */
export function parseBackup(sheets: InSheet[]): BackupData {
  const version = Number(cellStr(sheets.find((s) => s.sheet === SHEET.info)?.data[1]?.[1]));
  if (version !== 1 && version !== BACKUP_VERSION) throw new BackupError(`Versi format backup ${version || "?"} tidak didukung.`);
  const v1 = version === 1;
  const potSheet = v1 ? V1.pots : SHEET.pots;
  const potIdCol = v1 ? V1.potId : "ID kantong";
  const potWhat = v1 ? "pos" : "kantong";

  const YN = { true: "Ya", false: "Tidak" } as const;
  const categories = table(sheets, SHEET.categories, ["ID", "Nama", "Jenis", "Grup", ...(v1 ? ["Peran"] : []), "Urutan", "Diarsipkan"]).map((r) => ({
    id: r.int("ID"),
    name: r.str("Nama") || r.bad("Nama", "tidak boleh kosong"),
    kind: r.pick("Jenis", KIND)!,
    group: r.str("Grup") || "Lainnya",
    role: v1 ? r.pick("Peran", ROLE, "optional") : null,
    sortOrder: r.int("Urutan"),
    archived: r.pick("Diarsipkan", YN) === "true",
  }));
  const pots = table(sheets, potSheet, ["ID", "Nama", ...(v1 ? [] : ["Jenis kantong"]), "Catatan", "Target", "Tanggal target", "Prioritas", "Saldo acuan", "Tanggal acuan", "Urutan", "Diarsipkan"]).map((r) => ({
    id: r.int("ID"),
    name: r.str("Nama") || r.bad("Nama", "tidak boleh kosong"),
    kind: v1 ? ("saving" as const) : r.pick("Jenis kantong", POT_KIND)!,
    note: r.str("Catatan"),
    target: r.intOrNull("Target"),
    targetDate: r.dateOrNull("Tanggal target"),
    priority: r.intOrNull("Prioritas"),
    openingBalance: r.intOrNull("Saldo acuan") ?? 0,
    openingDate: r.dateOrNull("Tanggal acuan"),
    sortOrder: r.int("Urutan"),
    archived: r.pick("Diarsipkan", YN) === "true",
  }));

  const catIds = new Set(categories.map((c) => c.id));
  const expenseIds = new Set(categories.filter((c) => c.kind === "expense").map((c) => c.id));
  const potIds = new Set(pots.map((p) => p.id));
  const unique = <T>(rows: T[], key: (x: T) => string | number, what: string) => {
    const seen = new Set<string | number>();
    for (const x of rows) {
      const k = key(x);
      if (seen.has(k)) throw new BackupError(`${what} "${k}" muncul lebih dari sekali.`);
      seen.add(k);
    }
  };
  unique(categories, (c) => c.id, "ID kategori");
  unique(categories, (c) => `${KIND[c.kind]} ${c.name}`, "Kategori");
  unique(pots, (p) => p.id, `ID ${potWhat}`);
  unique(pots, (p) => p.name, v1 ? "Pos" : "Kantong");
  const knownPot = (r: { bad: (l: string, w: string) => never }, label: string, id: number | null) => {
    if (id !== null && !potIds.has(id)) r.bad(label, `${potWhat} ${id} tidak ada di sheet ${potSheet}`);
    return id;
  };

  const allTxs = table(sheets, SHEET.transactions, ["ID", "Tanggal", "ID kategori", potIdCol, "Keterangan", "Nominal", "Dicatat"]).map((r) => {
    const categoryId = r.int("ID kategori");
    if (!catIds.has(categoryId)) r.bad("ID kategori", `kategori ${categoryId} tidak ada di sheet Kategori`);
    const potId = knownPot(r, potIdCol, r.intOrNull(potIdCol));
    const amount = r.int("Nominal");
    if (amount <= 0) r.bad("Nominal", "harus lebih dari 0");
    return { id: r.int("ID"), date: r.date("Tanggal"), categoryId, potId, description: r.str("Keterangan"), amount, createdAt: r.time("Dicatat") };
  });
  unique(allTxs, (t) => t.id, "ID transaksi");

  const adjustments = table(sheets, v1 ? V1.adjustments : SHEET.adjustments, ["ID", potIdCol, "Tanggal", "Nominal", "Catatan", "Dicatat"]).map((r) => {
    const potId = knownPot(r, potIdCol, r.int(potIdCol))!;
    const amount = r.int("Nominal");
    if (amount === 0) r.bad("Nominal", "tidak boleh 0");
    return { id: r.int("ID"), potId, date: r.date("Tanggal"), amount, note: r.str("Catatan"), createdAt: r.time("Dicatat") };
  });
  unique(adjustments, (a) => a.id, `ID penyesuaian ${potWhat}`);

  const allBudgets = table(sheets, SHEET.budgets, ["Bulan", "ID kategori", "Nominal"]).map((r) => {
    const month = r.str("Bulan");
    if (!isMonthKey(month)) r.bad("Bulan", "harus berformat YYYY-MM");
    const categoryId = r.int("ID kategori");
    if (!expenseIds.has(categoryId)) r.bad("ID kategori", `kategori pengeluaran ${categoryId} tidak ada di sheet Kategori`);
    const amount = r.int("Nominal");
    if (amount < 0) r.bad("Nominal", "tidak boleh negatif");
    return { month, categoryId, amount };
  });
  unique(allBudgets, (b) => `${b.month} kategori ${b.categoryId}`, "Budget");

  let transactions: BackupTx[], transfers: BackupTransfer[], budgets: BackupBudget[], savingPlans: BackupPlan[];
  let cats = categories;
  if (v1) {
    const role = new Map(categories.map((c) => [c.id, c.role]));
    const split = splitLegacy<number, (typeof allTxs)[number]>(allTxs, (t) => role.get(t.categoryId) ?? null);
    transactions = split.kept;
    transfers = split.transfers.map((t, i) => ({
      id: i + 1, date: t.source.date, fromPotId: t.fromPotId, toPotId: t.toPotId, amount: t.source.amount, note: t.source.description, createdAt: t.source.createdAt,
    }));
    const b = splitLegacyBudgets(allBudgets, (x) => role.get(x.categoryId) === "saving_deposit");
    budgets = b.kept;
    savingPlans = b.plans;
    // Savings categories go once nothing uses them, as the database migration does.
    const used = new Set(transactions.map((t) => t.categoryId));
    cats = categories.filter((c) => !c.role || used.has(c.id));
  } else {
    transactions = allTxs;
    budgets = allBudgets;
    transfers = table(sheets, SHEET.transfers, ["ID", "Tanggal", "ID dari", "ID ke", "Nominal", "Catatan", "Dicatat"]).map((r) => {
      const fromPotId = knownPot(r, "ID dari", r.intOrNull("ID dari"));
      const toPotId = knownPot(r, "ID ke", r.intOrNull("ID ke"));
      if (fromPotId === toPotId) r.bad("ID ke", "kantong asal dan tujuan tidak boleh sama");
      const amount = r.int("Nominal");
      if (amount <= 0) r.bad("Nominal", "harus lebih dari 0");
      return { id: r.int("ID"), date: r.date("Tanggal"), fromPotId, toPotId, amount, note: r.str("Catatan"), createdAt: r.time("Dicatat") };
    });
    unique(transfers, (t) => t.id, "ID pindah kantong");
    savingPlans = table(sheets, SHEET.savingPlans, ["Bulan", "Nominal"]).map((r) => {
      const month = r.str("Bulan");
      if (!isMonthKey(month)) r.bad("Bulan", "harus berformat YYYY-MM");
      const amount = r.int("Nominal");
      if (amount < 0) r.bad("Nominal", "tidak boleh negatif");
      return { month, amount };
    });
    unique(savingPlans, (b) => b.month, "Rencana menabung bulan");
  }

  // Tagihan came after version 2 was first written: older backups simply have none.
  const txIds = new Set(transactions.map((t) => t.id));
  const has = (name: string) => sheets.some((x) => x.sheet === name);
  const bills: BackupBill[] = has(SHEET.bills)
    ? table(sheets, SHEET.bills, ["ID", "Nama", "ID kategori", "ID kantong", "Jadwal", "Tanggal", "Nominal awal", "Catatan", "Urutan", "Dibuat"]).map((r) => {
        const categoryId = r.int("ID kategori");
        if (!expenseIds.has(categoryId)) r.bad("ID kategori", `kategori pengeluaran ${categoryId} tidak ada di sheet Kategori`);
        const schedule = r.pick("Jadwal", SCHEDULE)!;
        const dueDay = r.intOrNull("Tanggal");
        if (schedule === "date" && (dueDay === null || dueDay < 1 || dueDay > 31)) r.bad("Tanggal", "harus 1 sampai 31");
        const amount = r.intOrNull("Nominal awal");
        if (amount !== null && amount <= 0) r.bad("Nominal awal", "harus lebih dari 0");
        return {
          id: r.int("ID"), name: r.str("Nama") || r.bad("Nama", "tidak boleh kosong"), categoryId, potId: knownPot(r, "ID kantong", r.intOrNull("ID kantong")),
          schedule, dueDay: schedule === "date" ? dueDay : null, amount, note: r.str("Catatan"), sortOrder: r.int("Urutan"), createdAt: r.time("Dibuat"),
        };
      })
    : [];
  unique(bills, (b) => b.id, "ID tagihan");
  const billIds = new Set(bills.map((b) => b.id));
  const billPayments: BackupBillPayment[] = has(SHEET.billPayments)
    ? table(sheets, SHEET.billPayments, ["ID tagihan", "Bulan", "ID transaksi", "Dicatat"]).map((r) => {
        const billId = r.int("ID tagihan");
        if (!billIds.has(billId)) r.bad("ID tagihan", `tagihan ${billId} tidak ada di sheet ${SHEET.bills}`);
        const month = r.str("Bulan");
        if (!isMonthKey(month)) r.bad("Bulan", "harus berformat YYYY-MM");
        const transactionId = r.intOrNull("ID transaksi");
        if (transactionId !== null && !txIds.has(transactionId)) r.bad("ID transaksi", `transaksi ${transactionId} tidak ada di sheet ${SHEET.transactions}`);
        return { billId, month, transactionId, createdAt: r.time("Dicatat") };
      })
    : [];
  unique(billPayments, (p) => `${p.billId} ${p.month}`, "Pembayaran tagihan");
  unique(billPayments.filter((p) => p.transactionId !== null), (p) => p.transactionId!, "ID transaksi pembayaran tagihan");

  const set = sheets.find((s) => s.sheet === SHEET.settings);
  if (!set) throw new BackupError(`Sheet "${SHEET.settings}" tidak ditemukan di file backup.`);
  const setting = (label: string) => cellStr(set.data.find((r) => cellStr(r[0]) === label)?.[1]);
  const carryStartMonth = setting(SETTING.carryStartMonth) || null;
  if (carryStartMonth !== null && !isMonthKey(carryStartMonth)) throw new BackupError(`Sheet ${SHEET.settings}: ${SETTING.carryStartMonth} tidak valid.`);
  const carryStartBalance = Number(setting(SETTING.carryStartBalance) || 0);
  if (!Number.isSafeInteger(carryStartBalance)) throw new BackupError(`Sheet ${SHEET.settings}: ${SETTING.carryStartBalance} harus berupa bilangan bulat.`);
  const paydayDay = setting(SETTING.paydayDay) ? Number(setting(SETTING.paydayDay)) : null;
  if (paydayDay !== null && !(Number.isInteger(paydayDay) && paydayDay >= 1 && paydayDay <= 31)) throw new BackupError(`Sheet ${SHEET.settings}: ${SETTING.paydayDay} harus 1 sampai 31.`);
  const salaryRaw = setting(SETTING.salaryCategoryId) ? Number(setting(SETTING.salaryCategoryId)) : null;
  // A salary category that isn't in the backup is dropped rather than failing the whole restore.
  const salaryCategoryId = salaryRaw !== null && catIds.has(salaryRaw) ? salaryRaw : null;

  return {
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.group, sortOrder: c.sortOrder, archived: c.archived })),
    pots, transactions, transfers, adjustments, budgets, savingPlans, bills, billPayments,
    settings: { carryStartMonth, carryStartBalance, paydayDay, salaryCategoryId },
  };
}
