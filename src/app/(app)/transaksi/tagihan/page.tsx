import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { getBillsPage } from "@/lib/bill-queries";
import { getCategories, getPots } from "@/lib/queries";
import { today } from "@/lib/dates";
import { BillsManager, type FromTx } from "./bills-manager";

export const metadata: Metadata = { title: "Tagihan" };

/**
 * Tagihan: what is paid every month, grouped by when. Each one's amount follows its last payment. Reached from
 * Transaksi; day to day they are paid from Beranda (reminders and the payday sheet).
 */
export default async function TagihanPage({ searchParams }: PageProps<"/transaksi/tagihan">) {
  await requireSession();
  const sp = await searchParams;
  const db = await getDb();
  const t = today();
  const dari = typeof sp.dari === "string" && /^\d+$/.test(sp.dari) ? Number(sp.dari) : null;
  const [data, cats, pots, fromRows] = await Promise.all([
    getBillsPage(db, t),
    getCategories(db),
    getPots(db),
    dari ? db.select().from(transactions).where(eq(transactions.id, dari)) : Promise.resolve([]),
  ]);
  // "Jadikan tagihan" on a transaction: open the form filled in from it.
  const from: FromTx | null = fromRows[0]
    ? { id: fromRows[0].id, date: fromRows[0].date, description: fromRows[0].description, categoryId: fromRows[0].categoryId, potId: fromRows[0].potId, amount: fromRows[0].amount }
    : null;

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/transaksi" className="-ml-1 inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink">
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Transaksi
      </Link>
      <BillsManager
        data={data}
        today={t}
        from={from}
        expenseCats={cats.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name }))}
        incomeCats={cats.filter((c) => c.kind === "income").map((c) => ({ id: c.id, name: c.name }))}
        pots={pots.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
