// The Jatahin! backup workbook: one sheet per table, read back by header name. No DB access here.
import { isDateKey, isMonthKey } from "../dates";
import type { Kind, Role } from "../finance";
import type { Cell, Sheet as OutSheet } from "write-excel-file/node";

type Value = string | number | boolean | Date | null | undefined;
/** A sheet as read-excel-file returns it. Its own types declare date cells as `typeof Date`, so they are not reused. */
export type InSheet = { sheet: string; data: Value[][] };

export const BACKUP_TITLE = "Jatahin! backup";
export const BACKUP_VERSION = 1;

export type BackupCategory = { id: number; name: string; kind: Kind; group: string; role: Role; sortOrder: number; archived: boolean };
export type BackupPot = {
  id: number; name: string; note: string; target: number | null; targetDate: string | null; priority: number | null;
  openingBalance: number; openingDate: string | null; sortOrder: number; archived: boolean;
};
export type BackupTx = { id: number; date: string; categoryId: number; potId: number | null; description: string; amount: number; createdAt: Date };
export type BackupAdjustment = { id: number; potId: number; date: string; amount: number; note: string; createdAt: Date };
export type BackupBudget = { month: string; categoryId: number; amount: number };
export type BackupData = {
  categories: BackupCategory[];
  pots: BackupPot[];
  transactions: BackupTx[];
  adjustments: BackupAdjustment[];
  budgets: BackupBudget[];
  settings: { carryStartMonth: string | null; carryStartBalance: number };
};


const SHEET = {
  info: "Info",
  categories: "Kategori",
  pots: "Pos",
  transactions: "Transaksi",
  adjustments: "Penyesuaian Pos",
  budgets: "Budget",
  settings: "Pengaturan",
} as const;

const KIND: Record<Kind, string> = { expense: "Pengeluaran", income: "Pemasukan" };
const ROLE: Record<NonNullable<Role>, string> = { saving_deposit: "Setoran tabungan", saving_withdraw: "Penarikan tabungan" };
const SETTING = { carryStartMonth: "Mulai saldo bawaan (YYYY-MM)", carryStartBalance: "Saldo awal di bulan itu" };

const money = (v: number | null): Cell => (v === null ? null : { value: v, type: Number, format: "#,##0" });
// Dates stay as YYYY-MM-DD text so no spreadsheet app can shift them across time zones.
const text = (v: string | null): Cell => (v === null || v === "" ? null : { value: v, type: String, format: "@" });
const yesNo = (v: boolean) => (v ? "Ya" : "Tidak");
const head = (labels: string[]): Cell[] => labels.map((value) => ({ value, fontWeight: "bold" as const }));

/** Turns backup data into workbook sheets for write-excel-file. Name columns next to IDs are for reading only. */
export function toSheets(d: BackupData, exportedAt: Date): OutSheet<Buffer>[] {
  const catName = new Map(d.categories.map((c) => [c.id, c.name]));
  const catKind = new Map(d.categories.map((c) => [c.id, c.kind]));
  const potName = new Map(d.pots.map((p) => [p.id, p.name]));
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
        ["Pos", d.pots.length],
        ["Transaksi", d.transactions.length],
        ["Penyesuaian pos", d.adjustments.length],
        ["Budget", d.budgets.length],
        [],
        ["Catatan", "Impor file ini di Pengaturan → Ekspor & impor untuk memulihkan data. Kolom ID menghubungkan antar sheet, jangan diubah."],
      ],
    },
    {
      sheet: SHEET.categories,
      columns: w(6, 28, 14, 14, 20, 8, 11),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Nama", "Jenis", "Grup", "Peran", "Urutan", "Diarsipkan"]),
        ...d.categories.map((c) => [c.id, c.name, KIND[c.kind], c.group, c.role ? ROLE[c.role] : null, c.sortOrder, yesNo(c.archived)]),
      ],
    },
    {
      sheet: SHEET.pots,
      columns: w(6, 24, 30, 16, 14, 10, 16, 14, 8, 11),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Nama", "Catatan", "Target", "Tanggal target", "Prioritas", "Saldo acuan", "Tanggal acuan", "Urutan", "Diarsipkan"]),
        ...d.pots.map((p) => [
          p.id, p.name, text(p.note), money(p.target), text(p.targetDate), p.priority, money(p.openingBalance), text(p.openingDate), p.sortOrder, yesNo(p.archived),
        ]),
      ],
    },
    {
      sheet: SHEET.transactions,
      columns: w(7, 12, 12, 13, 26, 8, 20, 34, 16, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "Tanggal", "ID kategori", "Jenis", "Kategori", "ID pos", "Pos", "Keterangan", "Nominal", "Dicatat"]),
        ...d.transactions.map((t) => [
          t.id, text(t.date), t.categoryId, KIND[catKind.get(t.categoryId) ?? "expense"], catName.get(t.categoryId) ?? null,
          t.potId, t.potId === null ? null : potName.get(t.potId) ?? null, text(t.description), money(t.amount), text(t.createdAt.toISOString()),
        ]),
      ],
    },
    {
      sheet: SHEET.adjustments,
      columns: w(7, 8, 20, 12, 16, 34, 26),
      stickyRowsCount: 1,
      data: [
        head(["ID", "ID pos", "Pos", "Tanggal", "Nominal", "Catatan", "Dicatat"]),
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
      sheet: SHEET.settings,
      columns: w(32, 18),
      data: [
        head(["Pengaturan", "Nilai"]),
        [SETTING.carryStartMonth, text(d.settings.carryStartMonth)],
        [SETTING.carryStartBalance, money(d.settings.carryStartBalance)],
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

/** Reads a backup workbook. Throws an Indonesian message naming the sheet, row and column of the first problem. */
export function parseBackup(sheets: InSheet[]): BackupData {
  const version = Number(cellStr(sheets.find((s) => s.sheet === SHEET.info)?.data[1]?.[1]));
  if (version !== BACKUP_VERSION) throw new BackupError(`Versi format backup ${version || "?"} tidak didukung.`);

  const YN = { true: "Ya", false: "Tidak" } as const;
  const categories = table(sheets, SHEET.categories, ["ID", "Nama", "Jenis", "Grup", "Peran", "Urutan", "Diarsipkan"]).map((r) => ({
    id: r.int("ID"),
    name: r.str("Nama") || r.bad("Nama", "tidak boleh kosong"),
    kind: r.pick("Jenis", KIND)!,
    group: r.str("Grup") || "Lainnya",
    role: r.pick("Peran", ROLE, "optional"),
    sortOrder: r.int("Urutan"),
    archived: r.pick("Diarsipkan", YN) === "true",
  }));
  const pots = table(sheets, SHEET.pots, ["ID", "Nama", "Catatan", "Target", "Tanggal target", "Prioritas", "Saldo acuan", "Tanggal acuan", "Urutan", "Diarsipkan"]).map((r) => ({
    id: r.int("ID"),
    name: r.str("Nama") || r.bad("Nama", "tidak boleh kosong"),
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
  unique(pots, (p) => p.id, "ID pos");
  unique(pots, (p) => p.name, "Pos");

  const transactions = table(sheets, SHEET.transactions, ["ID", "Tanggal", "ID kategori", "ID pos", "Keterangan", "Nominal", "Dicatat"]).map((r) => {
    const categoryId = r.int("ID kategori");
    if (!catIds.has(categoryId)) r.bad("ID kategori", `kategori ${categoryId} tidak ada di sheet Kategori`);
    const potId = r.intOrNull("ID pos");
    if (potId !== null && !potIds.has(potId)) r.bad("ID pos", `pos ${potId} tidak ada di sheet Pos`);
    const amount = r.int("Nominal");
    if (amount <= 0) r.bad("Nominal", "harus lebih dari 0");
    return { id: r.int("ID"), date: r.date("Tanggal"), categoryId, potId, description: r.str("Keterangan"), amount, createdAt: r.time("Dicatat") };
  });
  unique(transactions, (t) => t.id, "ID transaksi");

  const adjustments = table(sheets, SHEET.adjustments, ["ID", "ID pos", "Tanggal", "Nominal", "Catatan", "Dicatat"]).map((r) => {
    const potId = r.int("ID pos");
    if (!potIds.has(potId)) r.bad("ID pos", `pos ${potId} tidak ada di sheet Pos`);
    const amount = r.int("Nominal");
    if (amount === 0) r.bad("Nominal", "tidak boleh 0");
    return { id: r.int("ID"), potId, date: r.date("Tanggal"), amount, note: r.str("Catatan"), createdAt: r.time("Dicatat") };
  });
  unique(adjustments, (a) => a.id, "ID penyesuaian pos");

  const budgets = table(sheets, SHEET.budgets, ["Bulan", "ID kategori", "Nominal"]).map((r) => {
    const month = r.str("Bulan");
    if (!isMonthKey(month)) r.bad("Bulan", "harus berformat YYYY-MM");
    const categoryId = r.int("ID kategori");
    if (!expenseIds.has(categoryId)) r.bad("ID kategori", `kategori pengeluaran ${categoryId} tidak ada di sheet Kategori`);
    const amount = r.int("Nominal");
    if (amount < 0) r.bad("Nominal", "tidak boleh negatif");
    return { month, categoryId, amount };
  });
  unique(budgets, (b) => `${b.month} kategori ${b.categoryId}`, "Budget");

  const set = sheets.find((s) => s.sheet === SHEET.settings);
  if (!set) throw new BackupError(`Sheet "${SHEET.settings}" tidak ditemukan di file backup.`);
  const setting = (label: string) => cellStr(set.data.find((r) => cellStr(r[0]) === label)?.[1]);
  const carryStartMonth = setting(SETTING.carryStartMonth) || null;
  if (carryStartMonth !== null && !isMonthKey(carryStartMonth)) throw new BackupError(`Sheet ${SHEET.settings}: ${SETTING.carryStartMonth} tidak valid.`);
  const carryStartBalance = Number(setting(SETTING.carryStartBalance) || 0);
  if (!Number.isSafeInteger(carryStartBalance)) throw new BackupError(`Sheet ${SHEET.settings}: ${SETTING.carryStartBalance} harus berupa bilangan bulat.`);

  return { categories, pots, transactions, adjustments, budgets, settings: { carryStartMonth, carryStartBalance } };
}
