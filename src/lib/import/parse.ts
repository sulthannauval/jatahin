// Turns the MoneyFlows spreadsheet (as read by read-excel-file) into plain data. No DB access here.
import type { Kind } from "../finance";
import type { LegacyRole as Role } from "../legacy";

type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { sheet: string; data: Cell[][] };

export type ImportCategory = { name: string; kind: Kind; group: string; role: Role };
export type ImportPot = {
  name: string; note: string; target: number | null; targetDate: string | null;
  priority: number | null; openingBalance: number; openingDate: string | null;
};
export type ImportTx = { date: string; kind: Kind; category: string; pot: string | null; description: string; amount: number };
export type ImportBudget = { month: string; category: string; amount: number };
export type ImportData = {
  categories: ImportCategory[];
  pots: ImportPot[];
  transactions: ImportTx[];
  budgets: ImportBudget[];
  settings: { carryStartMonth: string | null; carryStartBalance: number };
  warnings: string[];
};

const MONTHS = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

const str = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v).trim());
const num = (v: Cell) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const dateKey = (v: Cell): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
};
const monthKeyFromHeader = (v: Cell): string | null => {
  const d = dateKey(v);
  if (d) return d.slice(0, 7);
  const m = str(v).toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1]);
  return idx < 0 ? null : `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
};

function findSheet(sheets: Sheet[], name: string): Cell[][] {
  const s = sheets.find((x) => x.sheet.trim().toLowerCase() === name.toLowerCase());
  if (!s) throw new Error(`Sheet "${name}" tidak ditemukan di file ini.`);
  return s.data;
}

function findRow(rows: Cell[][], col: number, text: string, from = 0): number {
  for (let i = from; i < rows.length; i++) if (str(rows[i]?.[col]).toLowerCase() === text.toLowerCase()) return i;
  return -1;
}

const B = 1, C = 2, D = 3, E = 4, F = 5, G = 6, J = 9;

export function parseWorkbook(sheets: Sheet[]): ImportData {
  const warnings: string[] = [];

  // ── Categories ──────────────────────────────────────────────
  const cat = findSheet(sheets, "Categories");
  const categories: ImportCategory[] = [];
  const header = findRow(cat, B, "Kategori");
  if (header < 0) throw new Error("Header 'Kategori' tidak ditemukan di sheet Categories.");
  for (let i = header + 1; i < cat.length; i++) {
    const name = str(cat[i]?.[B]);
    if (!name || name.startsWith("💡")) break;
    const group = str(cat[i]?.[C]) || "Lainnya";
    categories.push({ name, kind: "expense", group, role: group.toLowerCase() === "saving" ? "saving_deposit" : null });
  }
  for (let i = header + 1; i < cat.length; i++) {
    const name = str(cat[i]?.[E]);
    if (!name) break;
    const group = str(cat[i]?.[F]) || "Lainnya";
    const isWithdraw = group.toLowerCase() === "bukan income" || name.toLowerCase() === "ambil dari tabungan";
    categories.push({ name, kind: "income", group, role: isWithdraw ? "saving_withdraw" : null });
  }

  // Pots listed under POS TABUNGAN
  const potNames: { name: string; note: string }[] = [];
  const potHeader = findRow(cat, E, "Nama Pos");
  if (potHeader >= 0) {
    for (let i = potHeader + 1; i < cat.length; i++) {
      const name = str(cat[i]?.[E]);
      if (!name) break;
      potNames.push({ name, note: str(cat[i]?.[F]) });
    }
  }

  // ── Saving goals & pot opening balances ────────────────────
  const goals = new Map<string, { target: number | null; targetDate: string | null; note: string; priority: number }>();
  const opening = new Map<string, { balance: number; date: string | null }>();
  try {
    const sg = findSheet(sheets, "Saving Goals");
    const gh = findRow(sg, B, "Nama Goal");
    if (gh >= 0) {
      let prio = 1;
      for (let i = gh + 1; i < sg.length; i++) {
        const name = str(sg[i]?.[B]);
        if (!name || name.toUpperCase().startsWith("TOTAL")) break;
        goals.set(name, { target: num(sg[i]?.[C]), targetDate: dateKey(sg[i]?.[F]), note: str(sg[i]?.[G]), priority: prio++ });
      }
    }
    const oh = findRow(sg, B, "Keterangan");
    if (oh >= 0) {
      const balRow = findRow(sg, B, "Saldo acuan (Rp)", oh);
      const dateRow = findRow(sg, B, "Tanggal acuan", oh);
      for (let c = C; c < (sg[oh]?.length ?? 0); c++) {
        const name = str(sg[oh][c]);
        if (!name || name.toLowerCase() === "catatan") continue;
        opening.set(name, {
          balance: balRow >= 0 ? num(sg[balRow]?.[c]) ?? 0 : 0,
          date: dateRow >= 0 ? dateKey(sg[dateRow]?.[c]) : null,
        });
      }
    }
  } catch {
    warnings.push("Sheet Saving Goals tidak dapat dibaca, sehingga goal dan saldo awal tabungan dilewati.");
  }
  for (const g of goals.keys()) if (!potNames.some((p) => p.name === g)) potNames.push({ name: g, note: "" });
  const pots: ImportPot[] = potNames.map((p) => {
    const g = goals.get(p.name);
    const o = opening.get(p.name);
    return {
      name: p.name,
      note: g?.note || p.note,
      target: g?.target ?? null,
      targetDate: g?.targetDate ?? null,
      priority: g?.priority ?? null,
      openingBalance: Math.round(o?.balance ?? 0),
      openingDate: o?.date ?? null,
    };
  });

  // ── Monthly budget ─────────────────────────────────────────
  const budgets: ImportBudget[] = [];
  const settings = { carryStartMonth: null as string | null, carryStartBalance: 0 };
  try {
    const mb = findSheet(sheets, "Monthly Budget");
    const bh = findRow(mb, J, "Kategori");
    if (bh >= 0) {
      const cols: { col: number; month: string }[] = [];
      for (let c = J + 1; c < (mb[bh]?.length ?? 0); c++) {
        const m = monthKeyFromHeader(mb[bh][c]);
        if (m) cols.push({ col: c, month: m });
      }
      for (let i = bh + 1; i < mb.length; i++) {
        const name = str(mb[i]?.[J]);
        if (!name || name.toUpperCase() === "TOTAL") break;
        for (const { col, month } of cols) {
          const v = num(mb[i]?.[col]);
          if (v !== null && v >= 0) budgets.push({ month, category: name, amount: Math.round(v) });
        }
      }
    }
    const cs = findRow(mb, B, "Mulai hitung saldo bawaan");
    if (cs >= 0) settings.carryStartMonth = dateKey(mb[cs]?.[C])?.slice(0, 7) ?? null;
    const cb = findRow(mb, B, "Saldo awal di bulan itu (Rp)");
    if (cb >= 0) settings.carryStartBalance = Math.round(num(mb[cb]?.[C]) ?? 0);
  } catch {
    warnings.push("Sheet Monthly Budget tidak dapat dibaca, sehingga budget dilewati.");
  }

  // ── Daily log ──────────────────────────────────────────────
  const log = findSheet(sheets, "Daily Log");
  const lh = findRow(log, B, "Tanggal");
  if (lh < 0) throw new Error("Header 'Tanggal' tidak ditemukan di sheet Daily Log.");
  const transactions: ImportTx[] = [];
  const catKey = (name: string, kind: Kind) => `${kind}:${name}`;
  const known = new Map(categories.map((c) => [catKey(c.name, c.kind), c]));
  const potSet = new Set(pots.map((p) => p.name));
  for (let i = lh + 1; i < log.length; i++) {
    const r = log[i] ?? [];
    const date = dateKey(r[B]);
    if (!date) continue;
    const rowNo = i + 1;
    const income = num(r[F]) ?? 0;
    const expense = num(r[G]) ?? 0;
    if (income > 0 && expense > 0) { warnings.push(`Baris ${rowNo}: Income & Expense keisi dua-duanya, dilewati.`); continue; }
    if (income <= 0 && expense <= 0) continue;
    const kind: Kind = income > 0 ? "income" : "expense";
    const category = str(r[D]);
    if (!category) { warnings.push(`Baris ${rowNo}: kategori kosong, dilewati.`); continue; }
    let c = known.get(catKey(category, kind));
    if (!c) {
      c = { name: category, kind, group: "Lainnya", role: null };
      categories.push(c);
      known.set(catKey(category, kind), c);
      warnings.push(`Kategori "${category}" (${kind === "income" ? "pemasukan" : "pengeluaran"}) belum terdaftar dan dibuat otomatis.`);
    }
    let description = str(r[E]);
    let pot: string | null = null;
    if (c.role) {
      if (potSet.has(description)) { pot = description; description = ""; }
      else warnings.push(`Baris ${rowNo}: transaksi tabungan tanpa pos yang valid ("${description}").`);
    }
    transactions.push({ date, kind, category, pot, description, amount: Math.round(kind === "income" ? income : expense) });
  }

  // Budgets must point at known expense categories
  const expenseNames = new Set(categories.filter((c) => c.kind === "expense").map((c) => c.name));
  const validBudgets = budgets.filter((b) => {
    if (expenseNames.has(b.category)) return true;
    warnings.push(`Budget untuk "${b.category}" dilewati karena kategorinya tidak ada.`);
    return false;
  });

  return { categories, pots, transactions, budgets: validBudgets, settings, warnings: [...new Set(warnings)] };
}
