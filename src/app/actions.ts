"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/dal";
import { confirmPassword } from "@/lib/auth/confirm";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { budgets, categories, potAdjustments, pots, savingPlans, settings, transactions, transfers } from "@/lib/db/schema";
import { isDateKey, isMonthKey, monthStart, today } from "@/lib/dates";
import { parseAmount, parseBalance, rp } from "@/lib/money";
import { getKantong } from "@/lib/queries";
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
  // Empty: Kantong Utama.
  const potId = optInt(str(fd, "potId"));

  if (!isDateKey(date)) return fail("Tanggal tidak valid.");
  if (!amount) return fail("Nominal wajib diisi.");
  if (!categoryId) return fail("Kategori wajib dipilih.");

  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
  if (!cat) return fail("Kategori tidak ditemukan.");
  if (potId && !(await potExists(potId))) return fail("Kantong tidak ditemukan.");

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

async function potExists(id: number) {
  const db = await getDb();
  const [pot] = await db.select({ id: pots.id }).from(pots).where(eq(pots.id, id));
  return !!pot;
}

/** Money moved between two kantong (empty side: Kantong Utama). Not income or spending. */
export async function saveTransfer(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const id = optInt(str(fd, "id"));
  const date = str(fd, "date");
  const amount = parseAmount(str(fd, "amount"));
  const note = str(fd, "description").slice(0, 200);
  const fromPotId = optInt(str(fd, "fromPotId"));
  const toPotId = optInt(str(fd, "toPotId"));

  if (!isDateKey(date)) return fail("Tanggal tidak valid.");
  if (!amount) return fail("Nominal wajib diisi.");
  if (fromPotId === toPotId) return fail("Kantong asal dan tujuan tidak boleh sama.");
  for (const p of [fromPotId, toPotId]) if (p && !(await potExists(p))) return fail("Kantong tidak ditemukan.");

  const db = await getDb();
  const values = { date, fromPotId, toPotId, amount, note };
  if (id) {
    const res = await db.update(transfers).set(values).where(eq(transfers.id, id)).returning({ id: transfers.id });
    if (!res.length) return fail("Data tidak ditemukan. Kemungkinan sudah dihapus.");
  } else {
    await db.insert(transfers).values(values);
  }
  refresh();
  return { ok: true, message: id ? "Perubahan disimpan" : "Uang dipindahkan" };
}

export async function deleteTransfer(id: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(id)) return fail("ID tidak valid.");
  const db = await getDb();
  await db.delete(transfers).where(eq(transfers.id, id));
  refresh();
  return { ok: true, message: "Pindah kantong dihapus" };
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

/** How much is meant to go into saving kantong this month. Empty or 0 removes the plan. */
export async function setSavingPlan(month: string, raw: string): Promise<ActionResult> {
  await requireSession();
  if (!isMonthKey(month)) return fail("Bulan tidak valid.");
  const db = await getDb();
  const amount = raw.trim() === "" || /^0+$/.test(raw.replace(/\D/g, "")) ? 0 : parseAmount(raw);
  if (amount === null) return fail("Nominal tidak dapat dibaca.");
  if (amount === 0) await db.delete(savingPlans).where(eq(savingPlans.month, monthStart(month)));
  else {
    await db.insert(savingPlans).values({ month: monthStart(month), amount }).onConflictDoUpdate({ target: savingPlans.month, set: { amount } });
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
  if (!src) return fail("Tidak ada jatah pada bulan sebelumnya.");
  const rows = await db.select().from(budgets).where(eq(budgets.month, src.month));
  await db
    .insert(budgets)
    .values(rows.map((r) => ({ month: monthStart(month), categoryId: r.categoryId, amount: r.amount })))
    .onConflictDoNothing();
  const [plan] = await db.select().from(savingPlans).where(eq(savingPlans.month, src.month));
  if (plan) await db.insert(savingPlans).values({ month: monthStart(month), amount: plan.amount }).onConflictDoNothing();
  refresh();
  return { ok: true, message: "Jatah disalin" };
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
  const db = await getDb();
  const id = optInt(str(fd, "id"));
  try {
    if (id) {
      await db.update(categories).set({ name, group }).where(eq(categories.id, id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` }).from(categories);
      await db.insert(categories).values({ name, kind, group, sortOrder: max + 1 });
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

/** Quick add from the record sheet: returns the new id so the sheet can select it right away. */
export async function createCategory(input: { name: string; kind: string; group: string }): Promise<{ ok: true; id: number; message: string } | { ok: false; error: string }> {
  await requireSession();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, kind, group } = parsed.data;
  const allowed: readonly string[] = kind === "expense" ? EXPENSE_GROUPS : INCOME_GROUPS;
  if (!allowed.includes(group)) return { ok: false, error: "Tipe tidak valid." };
  const db = await getDb();
  try {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` }).from(categories);
    const [row] = await db.insert(categories).values({ name, kind, group, sortOrder: max + 1 }).returning({ id: categories.id });
    refresh();
    return { ok: true, id: row.id, message: "Kategori ditambah" };
  } catch {
    return { ok: false, error: "Nama kategori sudah digunakan." };
  }
}

/** Delete for good, only while no transaction uses it (a typo). Its jatah rows go with it. Used ones can only be hidden. */
export async function deleteCategory(id: number): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.categoryId, id));
  if (n > 0) return fail(`Kategori ini dipakai di ${n} transaksi. Sembunyikan saja.`);
  try {
    await db.delete(categories).where(eq(categories.id, id));
  } catch {
    // A transaction was saved with it in the meantime; the foreign key refuses the delete.
    return fail("Kategori ini sudah dipakai. Sembunyikan saja.");
  }
  refresh();
  return { ok: true, message: "Kategori dihapus" };
}

// ── Kantong & goals ───────────────────────────────────────────

export async function savePot(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const name = str(fd, "name").slice(0, 60);
  if (!name) return fail("Nama kantong wajib diisi.");
  if (name.toLowerCase() === "kantong utama" || name.toLowerCase() === "utama") return fail("Nama ini sudah dipakai Kantong Utama.");
  const kind: "saving" | "spending" = str(fd, "kind") === "spending" ? "spending" : "saving";
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
  // Only saving kantong have targets; a spending kantong is just spent from.
  const goal = kind === "saving" ? target : null;
  const priority = goal ? optInt(str(fd, "priority")) : null;
  const note = str(fd, "note").slice(0, 300);
  const values = { name, kind, note, target: goal, targetDate: goal ? targetDate : null, priority, openingBalance, openingDate };

  const db = await getDb();
  const id = optInt(str(fd, "id"));
  try {
    if (id) await db.update(pots).set(values).where(eq(pots.id, id));
    else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${pots.sortOrder}), 0)::int` }).from(pots);
      await db.insert(pots).values({ ...values, sortOrder: max + 1 });
    }
  } catch {
    return fail("Nama kantong sudah digunakan.");
  }
  refresh();
  return { ok: true, message: id ? "Kantong diperbarui" : "Kantong dibuat" };
}

export async function setPotArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  await db.update(pots).set({ archived }).where(eq(pots.id, id));
  refresh();
  return { ok: true, message: archived ? "Kantong disembunyikan" : "Kantong diaktifkan kembali" };
}

/**
 * Match a kantong against the bank: the difference between the bank's balance and the app's is saved as an adjustment
 * (a mismatch), never as income or spending. Bank interest is deliberately not tracked.
 */
export async function reconcilePot(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const potId = optInt(str(fd, "potId"));
  const bank = parseBalance(str(fd, "bankBalance"));
  if (!potId) return fail("Kantong tidak valid.");
  if (bank === null) return fail("Saldo bank tidak dapat dibaca. Contoh: 6.781,72");
  const db = await getDb();
  const pot = (await getKantong(db)).pots.find((p) => p.id === potId);
  if (!pot) return fail("Kantong tidak ditemukan.");
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
  const acc = await requireSession();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Pilih file .xlsx terlebih dahulu.");
  if (file.size > 4 * 1024 * 1024) return fail("Ukuran file melebihi batas 4 MB.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return fail("Harus file .xlsx (Google Sheets → File → Download → Microsoft Excel).");
  const replace = fd.get("replace") === "on";
  // Replacing wipes every transaction, so it needs the password, like changing the email or password.
  if (replace) {
    const err = await confirmPassword(acc.passwordHash, String(fd.get("password") ?? ""));
    if (err) return fail(err);
  }
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
        message: `Backup dipulihkan: ${res.transactions} transaksi, ${res.transfers} pindah kantong, ${res.categories} kategori, ${res.pots} kantong, ${res.adjustments} penyesuaian kantong, ${res.budgets} jatah`,
      };
    }
    const { parseWorkbook } = await import("@/lib/import/parse");
    const { applyImport } = await import("@/lib/import/apply");
    const data = parseWorkbook(sheets as never);
    const res = await applyImport(await getDb(), data, replace);
    refresh();
    const warn = data.warnings.length ? ` (${data.warnings.length} catatan: ${data.warnings.slice(0, 3).join(" ")})` : "";
    return { ok: true, message: `Impor berhasil: ${res.transactions} transaksi, ${res.transfers} pindah kantong, ${res.categories} kategori, ${res.pots} kantong, ${res.budgets} jatah${warn}` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Import gagal.");
  }
}

// ── Session ───────────────────────────────────────────────────

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
