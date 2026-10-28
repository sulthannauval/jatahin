"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/dal";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { budgets, categories, potAdjustments, pots, settings, transactions } from "@/lib/db/schema";
import { isDateKey, isMonthKey, monthStart, today } from "@/lib/dates";
import { parseAmount, parseBalance, rp } from "@/lib/money";
import { getSavings } from "@/lib/queries";
import type { InSheet } from "@/lib/backup/format";
import { EXPENSE_GROUPS, INCOME_GROUPS } from "@/lib/finance";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optInt = (v: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

// ── Transactions ──────────────────────────────────────────────

export async function saveTransaction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  const id = optInt(str(fd, "id"));
  const date = str(fd, "date");
  const categoryId = optInt(str(fd, "categoryId"));
  const amount = parseAmount(str(fd, "amount"));
  const description = str(fd, "description").slice(0, 200);
  let potId = optInt(str(fd, "potId"));

  if (!isDateKey(date)) return fail("Tanggal tidak valid.");
  if (!amount) return fail("Nominal wajib diisi.");
  if (!categoryId) return fail("Kategori wajib dipilih.");

  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!cat) return fail("Kategori tidak ditemukan.");
  if (cat.role) {
    if (!potId) return fail("Pos tabungan wajib dipilih.");
    const [pot] = await db.select({ id: pots.id }).from(pots).where(eq(pots.id, potId));
    if (!pot) return fail("Pos tabungan tidak ditemukan.");
  } else {
    potId = null;
  }

  const values = { date, categoryId, potId, description, amount };
  if (id) {
    const res = await db.update(transactions).set(values).where(eq(transactions.id, id)).returning({ id: transactions.id });
    if (!res.length) return fail("Transaksi tidak ditemukan. Kemungkinan sudah dihapus.");
  } else {
    await db.insert(transactions).values(values);
  }
  refresh();
  return { ok: true, message: id ? "Perubahan disimpan" : "Transaksi dicatat" };
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(id)) return fail("ID tidak valid.");
  const db = await getDb();
  await db.delete(transactions).where(eq(transactions.id, id));
  refresh();
  return { ok: true, message: "Transaksi dihapus" };
}

// ── Budgets ───────────────────────────────────────────────────

export async function setBudget(month: string, categoryId: number, raw: string): Promise<ActionResult> {
  await requireSession();
  if (!isMonthKey(month) || !Number.isInteger(categoryId)) return fail("Data tidak valid.");
  const db = await getDb();
  const amount = raw.trim() === "" || /^0+$/.test(raw.replace(/\D/g, "")) ? 0 : parseAmount(raw);
  if (amount === null) return fail("Nominal tidak dapat dibaca.");
  if (amount === 0) {
    await db.delete(budgets).where(and(eq(budgets.month, monthStart(month)), eq(budgets.categoryId, categoryId)));
  } else {
    await db
      .insert(budgets)
      .values({ month: monthStart(month), categoryId, amount })
      .onConflictDoUpdate({ target: [budgets.month, budgets.categoryId], set: { amount } });
  }
  refresh();
  return { ok: true };
}

export async function copyBudgets(month: string): Promise<ActionResult> {
  await requireSession();
  if (!isMonthKey(month)) return fail("Bulan tidak valid.");
  const db = await getDb();
  // Take the most recent earlier month that has a budget.
  const [src] = await db
    .select({ month: budgets.month })
    .from(budgets)
    .where(sql`${budgets.month} < ${monthStart(month)}`)
    .orderBy(sql`${budgets.month} desc`)
    .limit(1);
  if (!src) return fail("Tidak ada budget pada bulan sebelumnya.");
  const rows = await db.select().from(budgets).where(eq(budgets.month, src.month));
  await db
    .insert(budgets)
    .values(rows.map((r) => ({ month: monthStart(month), categoryId: r.categoryId, amount: r.amount })))
    .onConflictDoNothing();
  refresh();
  return { ok: true, message: "Budget disalin" };
}

// ── Categories ────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi.").max(60),
  kind: z.enum(["income", "expense"]),
  group: z.string().trim().min(1).max(30),
});

export async function saveCategory(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const parsed = categorySchema.safeParse({ name: str(fd, "name"), kind: str(fd, "kind"), group: str(fd, "group") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { name, kind, group } = parsed.data;
  const allowed: readonly string[] = kind === "expense" ? EXPENSE_GROUPS : INCOME_GROUPS;
  if (!allowed.includes(group)) return fail("Tipe tidak valid.");
  const role = kind === "expense" && group === "Saving" ? "saving_deposit" : kind === "income" && group === "Bukan Income" ? "saving_withdraw" : null;
  const db = await getDb();
  const id = optInt(str(fd, "id"));
  try {
    if (id) {
      await db.update(categories).set({ name, group, role }).where(eq(categories.id, id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` }).from(categories);
      await db.insert(categories).values({ name, kind, group, role, sortOrder: max + 1 });
    }
  } catch {
    return fail("Nama kategori sudah digunakan.");
  }
  refresh();
  return { ok: true, message: id ? "Kategori diperbarui" : "Kategori ditambah" };
}

export async function setCategoryArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  await db.update(categories).set({ archived }).where(eq(categories.id, id));
  refresh();
  return { ok: true, message: archived ? "Kategori disembunyikan" : "Kategori diaktifkan kembali" };
}

// ── Pots & goals ──────────────────────────────────────────────

export async function savePot(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const name = str(fd, "name").slice(0, 60);
  if (!name) return fail("Nama pos wajib diisi.");
  const targetRaw = str(fd, "target");
  const target = targetRaw ? parseAmount(targetRaw) : null;
  if (targetRaw && !target) return fail("Target tidak dapat dibaca.");
  const targetDate = str(fd, "targetDate") || null;
  if (targetDate && !isDateKey(targetDate)) return fail("Tanggal target tidak valid.");
  const openingRaw = str(fd, "openingBalance");
  const openingBalance = openingRaw && !/^0+$/.test(openingRaw.replace(/\D/g, "")) ? parseAmount(openingRaw) : 0;
  if (openingBalance === null) return fail("Saldo awal tidak dapat dibaca.");
  const openingDate = str(fd, "openingDate") || null;
  if (openingDate && !isDateKey(openingDate)) return fail("Tanggal saldo awal tidak valid.");
  const priority = target ? optInt(str(fd, "priority")) : null;
  const note = str(fd, "note").slice(0, 300);
  const values = { name, note, target, targetDate: target ? targetDate : null, priority, openingBalance, openingDate };

  const db = await getDb();
  const id = optInt(str(fd, "id"));
  try {
    if (id) await db.update(pots).set(values).where(eq(pots.id, id));
    else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${pots.sortOrder}), 0)::int` }).from(pots);
      await db.insert(pots).values({ ...values, sortOrder: max + 1 });
    }
  } catch {
    return fail("Nama pos sudah digunakan.");
  }
  refresh();
  return { ok: true, message: id ? "Pos tabungan diperbarui" : "Pos tabungan ditambah" };
}

export async function setPotArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  await db.update(pots).set({ archived }).where(eq(pots.id, id));
  refresh();
  return { ok: true, message: archived ? "Pos disembunyikan" : "Pos diaktifkan kembali" };
}

/**
 * Match a pot against the bank: the difference between the bank's balance and the app's is saved as an adjustment
 * (a mismatch), never as income or spending. Bank interest is deliberately not tracked.
 */
export async function reconcilePot(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const potId = optInt(str(fd, "potId"));
  const bank = parseBalance(str(fd, "bankBalance"));
  if (!potId) return fail("Pos tidak valid.");
  if (bank === null) return fail("Saldo bank tidak dapat dibaca. Contoh: 6.781,72");
  const db = await getDb();
  const pot = (await getSavings(db)).pots.find((p) => p.id === potId);
  if (!pot) return fail("Pos tidak ditemukan.");
  const diff = bank - pot.balance;
  if (diff === 0) return { ok: true, message: `Saldo ${pot.name} sudah sesuai dengan bank` };
  const note = str(fd, "note").slice(0, 120) || "Selisih bank";
  await db.insert(potAdjustments).values({ potId, date: today(), amount: diff, note });
  refresh();
  return { ok: true, message: `${pot.name} disesuaikan ${diff > 0 ? "+" : "−"}${rp(Math.abs(diff))}` };
}

export async function deleteAdjustment(id: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(id)) return fail("ID tidak valid.");
  const db = await getDb();
  await db.delete(potAdjustments).where(eq(potAdjustments.id, id));
  refresh();
  return { ok: true, message: "Penyesuaian dihapus" };
}

// ── Settings ──────────────────────────────────────────────────

export async function saveSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const carryStartMonth = str(fd, "carryStartMonth") || null;
  if (carryStartMonth && !isMonthKey(carryStartMonth)) return fail("Bulan mulai tidak valid.");
  const bal = str(fd, "carryStartBalance");
  const carryStartBalance = bal && !/^0+$/.test(bal.replace(/\D/g, "")) ? parseAmount(bal) : 0;
  if (carryStartBalance === null) return fail("Saldo awal tidak dapat dibaca.");
  const values = { carryStartMonth, carryStartBalance };
  const db = await getDb();
  await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values });
  refresh();
  return { ok: true, message: "Pengaturan disimpan" };
}

// ── Import ────────────────────────────────────────────────────

export async function importSpreadsheet(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Pilih file .xlsx terlebih dahulu.");
  if (file.size > 4 * 1024 * 1024) return fail("Ukuran file melebihi batas 4 MB.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return fail("Harus file .xlsx (Google Sheets → File → Download → Microsoft Excel).");
  const replace = fd.get("replace") === "on";
  try {
    const { default: readExcelFile } = await import("read-excel-file/node");
    // read-excel-file types date cells as `typeof Date`; at runtime they are Date objects.
    const sheets = (await readExcelFile(Buffer.from(await file.arrayBuffer()))) as unknown as InSheet[];
    const backup = await import("@/lib/backup/format");
    if (backup.isBackup(sheets)) {
      const { restoreBackup } = await import("@/lib/backup/db");
      const res = await restoreBackup(await getDb(), backup.parseBackup(sheets), replace);
      refresh();
      return {
        ok: true,
        message: `Backup dipulihkan: ${res.transactions} transaksi, ${res.categories} kategori, ${res.pots} pos, ${res.adjustments} penyesuaian pos, ${res.budgets} budget`,
      };
    }
    const { parseWorkbook } = await import("@/lib/import/parse");
    const { applyImport } = await import("@/lib/import/apply");
    const data = parseWorkbook(sheets as never);
    const res = await applyImport(await getDb(), data, replace);
    refresh();
    const warn = data.warnings.length ? ` (${data.warnings.length} catatan: ${data.warnings.slice(0, 3).join(" ")})` : "";
    return { ok: true, message: `Impor berhasil: ${res.transactions} transaksi, ${res.categories} kategori, ${res.pots} pos, ${res.budgets} budget${warn}` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Import gagal.");
  }
}

// ── Session ───────────────────────────────────────────────────

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
