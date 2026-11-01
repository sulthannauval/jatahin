import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "./db";
import { billPayments, bills, categories, pots, savingPlans, settings, transactions, transfers } from "./db/schema";
import { addDays, addMonths, monthOf, monthStart } from "./dates";
import { billDay, dueDate, dueLabel, matchesQuery, openPeriods, periodFor, rankForBill, type BillInfo, type MatchCandidate, type OpenPeriod } from "./bills";

/** A settled month: paid by a transaction, or skipped (tx null). */
export type Settled = { month: string; tx: { id: number; date: string; amount: number } | null };

export type BillRow = BillInfo & {
  categoryName: string;
  potId: number | null;
  potName: string | null;
  amount: number | null;
  note: string;
  /** The last payment's amount, or the amount set on the tagihan before the first one. */
  lastAmount: number | null;
  settled: Settled[];
};

/** Every tagihan with what was paid, and the payday settings. */
export async function loadBills(db: DB) {
  const [rows, pays, [cfg]] = await Promise.all([
    db
      .select({ b: bills, categoryName: categories.name, potName: pots.name })
      .from(bills)
      .innerJoin(categories, eq(categories.id, bills.categoryId))
      .leftJoin(pots, eq(pots.id, bills.potId))
      .orderBy(asc(bills.sortOrder), asc(bills.id)),
    db
      .select({ billId: billPayments.billId, month: billPayments.month, txId: transactions.id, date: transactions.date, amount: transactions.amount })
      .from(billPayments)
      .leftJoin(transactions, eq(transactions.id, billPayments.transactionId))
      .orderBy(desc(billPayments.month)),
    db.select().from(settings).where(eq(settings.id, 1)),
  ]);
  const byBill = new Map<number, Settled[]>();
  for (const p of pays) {
    const list = byBill.get(p.billId) ?? [];
    list.push({ month: monthOf(p.month), tx: p.txId === null ? null : { id: p.txId, date: p.date!, amount: p.amount! } });
    byBill.set(p.billId, list);
  }
  const list: BillRow[] = rows.map(({ b, categoryName, potName }) => {
    const settled = byBill.get(b.id) ?? [];
    return {
      id: b.id, name: b.name, categoryId: b.categoryId, schedule: b.schedule, dueDay: b.dueDay, createdOn: b.createdAt.toISOString().slice(0, 10),
      categoryName, potId: b.potId, potName, amount: b.amount, note: b.note, settled,
      lastAmount: settled.find((s) => s.tx)?.tx?.amount ?? b.amount,
    };
  });
  return { bills: list, paydayDay: cfg?.paydayDay ?? null, salaryCategoryId: cfg?.salaryCategoryId ?? null };
}

/** Dated tagihan are asked for from the day before; tagihan pas gajian on payday itself. */
const leadOf = (b: BillInfo) => (b.schedule === "date" ? 1 : 0);
const openOf = (b: BillRow, paydayDay: number | null, today: string, lead = leadOf(b)) =>
  openPeriods(b, paydayDay, new Set(b.settled.map((s) => s.month)), today, lead);

export type BillStatus =
  | { kind: "open"; due: string; month: string; label: string; tone: "soon" | "today" | "late" }
  | { kind: "paid"; date: string }
  | { kind: "skipped"; month: string }
  | { kind: "next"; due: string }
  | { kind: "unscheduled" };

/** The Tagihan page: each tagihan with where it stands this month. */
export async function getBillsPage(db: DB, today: string) {
  const data = await loadBills(db);
  const month = monthOf(today);
  const rows = data.bills.map((b) => {
    const open = openOf(b, data.paydayDay, today)[0];
    const day = billDay(b, data.paydayDay);
    const now = b.settled.find((s) => s.month === month);
    const settled = new Set(b.settled.map((s) => s.month));
    let status: BillStatus;
    if (open) {
      const l = dueLabel(open.due, today);
      status = { kind: "open", due: open.due, month: open.month, label: l.text, tone: l.tone };
    }
    else if (now?.tx) status = { kind: "paid", date: now.tx.date };
    else if (now) status = { kind: "skipped", month };
    else if (day === null) status = { kind: "unscheduled" };
    else {
      // The next due date, past any month already paid early.
      let m = dueDate(month, day) >= today ? month : addMonths(month, 1);
      while (settled.has(m)) m = addMonths(m, 1);
      status = { kind: "next", due: dueDate(m, day) };
    }
    // "Bayar sekarang" pays the first month not settled yet, from the one asked for now (or this month).
    let payMonth = open?.month ?? (status.kind === "next" ? status.due.slice(0, 7) : month);
    while (settled.has(payMonth)) payMonth = addMonths(payMonth, 1);
    return { ...b, status, payMonth };
  });
  const paid = rows.filter((r) => r.settled.some((s) => s.month === month)).length;
  const total = rows.reduce((s, r) => s + (r.lastAmount ?? 0), 0);
  const left = rows.filter((r) => !r.settled.some((s) => s.month === month)).reduce((s, r) => s + (r.lastAmount ?? 0), 0);
  return { ...data, rows, paid, total, left };
}

export type BillsPage = Awaited<ReturnType<typeof getBillsPage>>;

/** What Beranda asks for: dated tagihan that are due, and the payday sheet when tagihan pas gajian are waiting. */
export async function getBillReminders(db: DB, today: string) {
  const data = await loadBills(db);
  const dated = data.bills
    .filter((b) => b.schedule === "date")
    .flatMap((b) => openOf(b, data.paydayDay, today).map((p) => ({ ...p, name: b.name, categoryId: b.categoryId, categoryName: b.categoryName, potId: b.potId, lastAmount: b.lastAmount, ...dueLabel(p.due, today) })))
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  // The oldest payday still waiting, with every tagihan pas gajian open in it.
  const waiting = data.bills.filter((b) => b.schedule === "payday").flatMap((b) => openOf(b, data.paydayDay, today).map((p) => ({ p, b })));
  const month = waiting.map((w) => w.p.month).sort()[0];
  if (!month) return { dated, payday: null };
  const due = waiting.find((w) => w.p.month === month)!.p.due;
  const payBills = waiting.filter((w) => w.p.month === month).map(({ b }) => ({ id: b.id, name: b.name, note: b.note, categoryName: b.categoryName, lastAmount: b.lastAmount }));
  return { dated, payday: { month, due, label: dueLabel(due, today), bills: payBills, ...(await paydayExtras(db, month, due, data.salaryCategoryId)) } };
}

export type BillReminders = Awaited<ReturnType<typeof getBillReminders>>;

/**
 * The payday a salary recorded today belongs to (the nearest one, so an early or late salary still counts) and its
 * tagihan pas gajian not paid yet. For "Sekalian bayar tagihan gajian?" in the record sheet. Null when there is
 * nothing to offer or the salary category isn't set.
 */
export async function getPaydayPlan(db: DB, today: string): Promise<NonNullable<BillReminders["payday"]> | null> {
  const data = await loadBills(db);
  if (!data.paydayDay || !data.salaryCategoryId) return null;
  const month = periodFor(today, data.paydayDay);
  const due = dueDate(month, data.paydayDay);
  const bills = data.bills
    .filter((b) => b.schedule === "payday" && due >= b.createdOn && !b.settled.some((x) => x.month === month))
    .map((b) => ({ id: b.id, name: b.name, note: b.note, categoryName: b.categoryName, lastAmount: b.lastAmount }));
  if (!bills.length) return null;
  return { month, due, label: dueLabel(due, today), bills, ...(await paydayExtras(db, month, due, data.salaryCategoryId)) };
}

/** The salary (if not recorded yet this payday) and the month's saving plan, for the payday sheet. */
async function paydayExtras(db: DB, month: string, due: string, salaryCategoryId: number | null) {
  const [incomeCats, lastSalary, plan, savingPots] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.kind, "income"), eq(categories.archived, false))).orderBy(asc(categories.sortOrder)),
    salaryCategoryId
      ? db.select({ date: transactions.date, amount: transactions.amount }).from(transactions).where(eq(transactions.categoryId, salaryCategoryId)).orderBy(desc(transactions.date)).limit(1)
      : Promise.resolve([]),
    db.select({ amount: savingPlans.amount }).from(savingPlans).where(eq(savingPlans.month, monthStart(month))),
    db.select({ id: pots.id, name: pots.name }).from(pots).where(and(eq(pots.kind, "saving"), eq(pots.archived, false))).orderBy(sql`${pots.priority} asc nulls last`, asc(pots.sortOrder)),
  ]);
  // Already in this payday: a salary dated from a few days before it.
  const recorded = lastSalary[0] && lastSalary[0].date >= addDays(due, -7) ? lastSalary[0] : null;
  // What already went into saving kantong this month counts towards the plan.
  const saving = savingPots.length
    ? await db
        .select({ total: sql<string>`coalesce(sum(${transfers.amount}), 0)` })
        .from(transfers)
        .where(and(isNull(transfers.fromPotId), inArray(transfers.toPotId, savingPots.map((p) => p.id)), gte(transfers.date, monthStart(month)), lt(transfers.date, monthStart(addMonths(month, 1)))))
    : [{ total: "0" }];
  const planLeft = plan[0] ? Math.max(plan[0].amount - Number(saving[0].total), 0) : 0;
  return {
    salary: {
      categoryId: salaryCategoryId,
      categories: incomeCats,
      amount: lastSalary[0]?.amount ?? null,
      recordedOn: recorded?.date ?? null,
    },
    saving: planLeft > 0 && savingPots.length ? { amount: planLeft, pots: savingPots } : null,
  };
}

/** Open tagihan months a new transaction dated `date` could pay (from three days before each is due). */
export async function matchCandidates(db: DB, date: string): Promise<MatchCandidate[]> {
  const data = await loadBills(db);
  return data.bills.flatMap((b) =>
    openOf(b, data.paydayDay, date, 3).map((p: OpenPeriod) => ({ ...p, name: b.name, categoryId: b.categoryId, lastAmount: b.lastAmount })),
  );
}

/** Past spending whose note starts with the words typed, newest first: "listrik" finds Listrik PLN. */
export async function similarPayments(db: DB, query: string, limit = 4) {
  if (!query.trim()) return [];
  const rows = await db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, description: transactions.description, categoryId: transactions.categoryId, categoryName: categories.name, potId: transactions.potId })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(categories.kind, "expense"), sql`${transactions.description} <> ''`, gte(transactions.date, sql`current_date - interval '180 days'`)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(3000);
  return rows.filter((r) => matchesQuery(r.description, query)).slice(0, limit);
}

/** Spending that could be a tagihan's payment, likeliest first, for "Sudah dibayar". */
export async function paymentChoices(db: DB, billId: number, month: string, query = "") {
  const data = await loadBills(db);
  const bill = data.bills.find((b) => b.id === billId);
  if (!bill) return [];
  const day = billDay(bill, data.paydayDay) ?? 1;
  const from = addDays(dueDate(month, day), -20);
  const rows = await db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, description: transactions.description, categoryId: transactions.categoryId, categoryName: categories.name })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(billPayments, eq(billPayments.transactionId, transactions.id))
    .where(and(eq(categories.kind, "expense"), gte(transactions.date, from), isNull(billPayments.billId)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(300);
  const found = query.trim() ? rows.filter((r) => matchesQuery(`${r.description} ${r.categoryName}`, query)) : rows;
  return rankForBill(found, bill, bill.lastAmount).slice(0, 12);
}
