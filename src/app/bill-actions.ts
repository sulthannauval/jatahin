"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { billPayments, bills, categories, pots, settings, transactions, transfers } from "@/lib/db/schema";
import { isDateKey, isMonthKey, monthName, monthStart } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { periodFor } from "@/lib/bills";
import { loadBills, paymentChoices, similarPayments } from "@/lib/bill-queries";
import { linkPayment, unlinkPayment } from "@/lib/bill-writes";
import type { ActionResult } from "./actions";

const fail = (error: string): ActionResult => ({ ok: false, error });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optInt = (v: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

/** Create or change a tagihan. With fromTxId (from "Pakai" or "Jadikan tagihan"), that transaction is its last payment. */
export async function saveBill(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const db = await getDb();
  const id = optInt(str(fd, "id"));
  const name = str(fd, "name").slice(0, 60);
  const categoryId = optInt(str(fd, "categoryId"));
  const potId = optInt(str(fd, "potId"));
  const schedule = str(fd, "schedule") === "date" ? "date" : "payday";
  const dueDay = schedule === "date" ? optInt(str(fd, "dueDay")) : null;
  const amountRaw = str(fd, "amount");
  const amount = amountRaw && !/^0+$/.test(amountRaw.replace(/\D/g, "")) ? parseAmount(amountRaw) : null;
  const note = str(fd, "note").slice(0, 120);
  const fromTxId = optInt(str(fd, "fromTxId"));

  if (!name) return fail("Nama tagihan wajib diisi.");
  if (!categoryId) return fail("Kategori wajib dipilih.");
  if (schedule === "date" && (!dueDay || dueDay < 1 || dueDay > 31)) return fail("Tanggal harus 1 sampai 31.");
  if (amountRaw && amount === null) return fail("Nominal tidak dapat dibaca.");
  const [cat] = await db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId));
  if (!cat || cat.kind !== "expense") return fail("Pilih kategori pengeluaran.");
  if (potId) {
    const [p] = await db.select({ id: pots.id }).from(pots).where(eq(pots.id, potId));
    if (!p) return fail("Kantong tidak ditemukan.");
  }

  const values = { name, categoryId, potId, schedule: schedule as "date" | "payday", dueDay, amount, note };
  let billId = id;
  if (id) {
    const res = await db.update(bills).set(values).where(eq(bills.id, id)).returning({ id: bills.id });
    if (!res.length) return fail("Tagihan tidak ditemukan. Kemungkinan sudah dihapus.");
  } else {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${bills.sortOrder}), 0)::int` }).from(bills);
    const [row] = await db.insert(bills).values({ ...values, sortOrder: max + 1 }).returning({ id: bills.id });
    billId = row.id;
  }
  if (fromTxId && billId) {
    const [tx] = await db.select({ date: transactions.date }).from(transactions).where(eq(transactions.id, fromTxId));
    const [cfg] = await db.select({ paydayDay: settings.paydayDay }).from(settings).where(eq(settings.id, 1));
    const day = schedule === "date" ? dueDay : cfg?.paydayDay ?? Number(tx?.date.slice(8, 10));
    if (tx && day) await linkPayment(db, billId, periodFor(tx.date, day), fromTxId);
  }
  refresh();
  return { ok: true, message: id ? "Tagihan diperbarui" : "Tagihan dibuat" };
}

export async function deleteBill(id: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(id)) return fail("ID tidak valid.");
  const db = await getDb();
  await db.delete(bills).where(eq(bills.id, id));
  refresh();
  return { ok: true, message: "Tagihan dihapus. Transaksinya tetap ada." };
}

/** Not paying this month: the reminder stops until next month. */
export async function skipBill(billId: number, month: string): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(billId) || !isMonthKey(month)) return fail("Data tidak valid.");
  const db = await getDb();
  const [b] = await db.select({ name: bills.name }).from(bills).where(eq(bills.id, billId));
  if (!b) return fail("Tagihan tidak ditemukan.");
  if (!(await linkPayment(db, billId, month, null))) return fail(`${b.name} ${monthName(month)} sudah lunas atau dilewati.`);
  refresh();
  return { ok: true, message: `${b.name} ${monthName(month)} dilewati` };
}

/** "Sudah dibayar": the transaction that paid it. */
export async function markBillPaid(billId: number, month: string, transactionId: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(billId) || !Number.isInteger(transactionId) || !isMonthKey(month)) return fail("Data tidak valid.");
  const db = await getDb();
  const [b] = await db.select({ name: bills.name }).from(bills).where(eq(bills.id, billId));
  if (!b) return fail("Tagihan tidak ditemukan.");
  const [taken] = await db.select({ billId: billPayments.billId }).from(billPayments).where(eq(billPayments.transactionId, transactionId));
  if (taken) return fail("Transaksi ini sudah dipakai untuk tagihan lain.");
  if (!(await linkPayment(db, billId, month, transactionId))) return fail(`${b.name} ${monthName(month)} sudah lunas atau dilewati.`);
  refresh();
  return { ok: true, message: `${b.name} ${monthName(month)} ditandai lunas` };
}

/** Undo a paid or skipped month ("Bukan ini", or a skip by mistake). The transaction stays. */
export async function reopenBill(billId: number, month: string): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(billId) || !isMonthKey(month)) return fail("Data tidak valid.");
  await unlinkPayment(await getDb(), billId, month);
  refresh();
  return { ok: true, message: "Tanda lunas dibatalkan" };
}

/** Payday: the day the salary comes in, and the category it is recorded in. */
export async function savePayday(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const day = optInt(str(fd, "paydayDay"));
  const salaryCategoryId = optInt(str(fd, "salaryCategoryId"));
  if (!day || day < 1 || day > 31) return fail("Tanggal gajian harus 1 sampai 31.");
  const db = await getDb();
  if (salaryCategoryId) {
    const [c] = await db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, salaryCategoryId));
    if (!c || c.kind !== "income") return fail("Pilih kategori pemasukan.");
  }
  const values = { paydayDay: day, salaryCategoryId };
  await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values });
  refresh();
  return { ok: true, message: "Gajian disimpan" };
}

export type SimilarPayment = Awaited<ReturnType<typeof similarPayments>>[number];

export async function findSimilarPayments(query: string): Promise<SimilarPayment[]> {
  await requireSession();
  return similarPayments(await getDb(), query.slice(0, 60));
}

export type PaymentChoice = Awaited<ReturnType<typeof paymentChoices>>[number];

export async function findPaymentChoices(billId: number, month: string, query: string): Promise<PaymentChoice[]> {
  await requireSession();
  if (!Number.isInteger(billId) || !isMonthKey(month)) return [];
  return paymentChoices(await getDb(), billId, month, query.slice(0, 60));
}

export type PaydayInput = {
  month: string;
  date: string;
  salary: { categoryId: number; amount: string } | null;
  bills: { billId: number; amount: string }[];
  saving: { potId: number; amount: string } | null;
};

/** The payday sheet: the salary, every tagihan ticked and the move to savings, in one go. */
export async function recordPayday(input: PaydayInput): Promise<ActionResult> {
  await requireSession();
  const { month, date } = input;
  if (!isMonthKey(month) || !isDateKey(date)) return fail("Tanggal tidak valid.");
  const db = await getDb();
  const read = (raw: string, what: string) => {
    const n = parseAmount(raw);
    if (!n) throw new Error(`Isi nominal ${what}.`);
    return n;
  };
  let salary: { categoryId: number; amount: number } | null = null;
  let lines: { billId: number; amount: number }[] = [];
  let saving: { potId: number; amount: number } | null = null;
  const all = (await loadBills(db)).bills;
  try {
    if (input.salary) salary = { categoryId: input.salary.categoryId, amount: read(input.salary.amount, "gaji") };
    lines = input.bills.map((l) => ({ billId: l.billId, amount: read(l.amount, all.find((b) => b.id === l.billId)?.name ?? "tagihan") }));
    if (input.saving) saving = { potId: input.saving.potId, amount: read(input.saving.amount, "tabungan") };
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!salary && !lines.length && !saving) return fail("Belum ada yang dicentang.");
  if (salary) {
    const [c] = await db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, salary.categoryId));
    if (!c || c.kind !== "income") return fail("Pilih kategori gaji.");
  }
  const chosen = all.filter((b) => lines.some((l) => l.billId === b.id));
  if (chosen.length !== lines.length) return fail("Ada tagihan yang sudah dihapus. Tutup lalu buka lagi.");
  if (saving) {
    const [p] = await db.select({ kind: pots.kind }).from(pots).where(eq(pots.id, saving.potId));
    if (!p) return fail("Kantong tabungan tidak ditemukan.");
  }

  const count = await db.transaction(async (tx) => {
    // A tagihan settled in the meantime (another tab, a reminder) is left as it is.
    const done = new Set(
      (await tx.select({ billId: billPayments.billId }).from(billPayments).where(and(eq(billPayments.month, monthStart(month)), inArray(billPayments.billId, chosen.map((b) => b.id).concat(-1))))).map((r) => r.billId),
    );
    let n = 0;
    if (salary) {
      await tx.insert(transactions).values({ date, categoryId: salary.categoryId, potId: null, description: "Gaji", amount: salary.amount });
      n++;
    }
    for (const l of lines) {
      if (done.has(l.billId)) continue;
      const b = chosen.find((x) => x.id === l.billId)!;
      const [row] = await tx.insert(transactions).values({ date, categoryId: b.categoryId, potId: b.potId, description: b.name, amount: l.amount }).returning({ id: transactions.id });
      await tx.insert(billPayments).values({ billId: b.id, month: monthStart(month), transactionId: row.id });
      await tx.update(bills).set({ amount: null }).where(eq(bills.id, b.id));
      n++;
    }
    if (saving) {
      await tx.insert(transfers).values({ date, fromPotId: null, toPotId: saving.potId, amount: saving.amount, note: `Gajian ${monthName(month)}` });
      n++;
    }
    return n;
  });
  refresh();
  return { ok: true, message: `Gajian ${monthName(month)}: ${count} catatan disimpan` };
}
