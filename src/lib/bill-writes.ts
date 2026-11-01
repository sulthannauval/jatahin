import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "./db";
import { billPayments, bills } from "./db/schema";
import { isMonthKey, monthStart } from "./dates";
import { matchPayment, type MatchTx } from "./bills";
import { matchCandidates } from "./bill-queries";

/** Marks a tagihan month as paid by a transaction. False when that month is already settled or the tx is in use. */
export async function linkPayment(db: DB, billId: number, month: string, transactionId: number | null): Promise<boolean> {
  if (!isMonthKey(month)) return false;
  const rows = await db.insert(billPayments).values({ billId, month: monthStart(month), transactionId }).onConflictDoNothing().returning({ billId: billPayments.billId });
  return rows.length > 0;
}

export async function unlinkPayment(db: DB, billId: number, month: string) {
  if (!isMonthKey(month)) return;
  await db.delete(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.month, monthStart(month))));
}

/**
 * After a new expense is saved: the tagihan it pays. Either the one it was recorded for (from a reminder), or the one
 * it clearly matches. Returns what was marked, so the toast can offer "Bukan ini".
 */
export async function settleNewExpense(
  db: DB,
  tx: MatchTx & { id: number },
  explicit: { billId: number; month: string } | null,
): Promise<{ billId: number; month: string; name: string; auto: boolean } | null> {
  if (explicit) {
    const [b] = await db.select({ name: bills.name }).from(bills).where(eq(bills.id, explicit.billId));
    if (b && (await linkPayment(db, explicit.billId, explicit.month, tx.id))) return { ...explicit, name: b.name, auto: false };
    return null;
  }
  const hit = matchPayment(tx, await matchCandidates(db, tx.date));
  if (hit && (await linkPayment(db, hit.billId, hit.month, tx.id))) return { billId: hit.billId, month: hit.month, name: hit.name, auto: true };
  return null;
}
