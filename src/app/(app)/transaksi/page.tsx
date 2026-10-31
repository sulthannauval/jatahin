import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getActivity, getCategories } from "@/lib/queries";
import { currentMonth, isMonthKey, monthLabel } from "@/lib/dates";
import { rp } from "@/lib/money";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxList } from "@/components/tx-list";
import { TxFilters } from "./filters";
import { TxTable } from "@/components/tx-table";
import Link from "next/link";
import { LayoutList, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Transaksi" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transaksi">) {
  await requireSession();
  const sp = await searchParams;
  const month = isMonthKey(sp.m) ? sp.m : currentMonth();
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const c = typeof sp.c === "string" && /^\d+$/.test(sp.c) ? Number(sp.c) : undefined;
  const view = sp.v === "tabel" ? "tabel" : "daftar";
  const db = await getDb();
  const [rows, cats] = await Promise.all([getActivity(db, { month, q, categoryId: c }), getCategories(db, true)]);
  const income = rows.reduce((s, r) => s + (r.type === "tx" && r.kind === "income" ? r.amount : 0), 0);
  const expense = rows.reduce((s, r) => s + (r.type === "tx" && r.kind === "expense" ? r.amount : 0), 0);
  const count = rows.filter((r) => r.type === "tx").length;

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="Transaksi" sub={`${count} transaksi di ${monthLabel(month)}${q ? ` untuk pencarian “${q}”` : ""}`}>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} sp={{ m: isMonthKey(sp.m) ? sp.m : undefined, q: q || undefined, c: c ? String(c) : undefined }} />
          <MonthSwitcher month={month} path="/transaksi" params={{ q: q || undefined, c: c ? String(c) : undefined, v: view === "tabel" ? "tabel" : undefined }} />
        </div>
      </PageHeader>
      <div className="space-y-3">
        <TxFilters categories={cats.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))} />
        <Card className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Mini label="Pemasukan" value={(income ? "+" : "") + rp(income)} className={income ? "text-pos" : "text-muted"} />
          <Mini label="Pengeluaran" value={rp(expense)} className={expense ? "" : "text-muted"} />
          <Mini label="Selisih" value={(income - expense > 0 ? "+" : "") + rp(income - expense)} className={income - expense < 0 ? "text-neg" : ""} />
        </Card>
        {rows.length ? (
          view === "tabel" ? <Card className="overflow-hidden"><TxTable rows={rows} /></Card> : <TxList rows={rows} />
        ) : (
          <Card>
            <EmptyState title={q || c ? "Tidak ada hasil" : `Belum ada transaksi di ${monthLabel(month)}`}>
              {q || c ? "Coba kata kunci atau kategori lain." : "Tekan tombol + untuk mulai mencatat."}
            </EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    // Phone: a row with the label left and the full figure right. Wider: label over figure, three across.
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 sm:block sm:px-4 sm:py-2.5">
      <p className="text-sm text-muted sm:text-xs">{label}</p>
      <p className={cn("num text-[15px] font-bold whitespace-nowrap sm:text-base", className)}>{value}</p>
    </div>
  );
}

function ViewToggle({ view, sp }: { view: string; sp: Record<string, string | undefined> }) {
  const href = (v?: string) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...sp, v })) if (val) q.set(k, val);
    const s = q.toString();
    return s ? `/transaksi?${s}` : "/transaksi";
  };
  const item = (active: boolean) => cn("grid h-full w-10 place-items-center transition-colors", active ? "bg-active text-ink" : "text-muted hover:bg-raised hover:text-ink");
  return (
    <div className="flex h-10 overflow-hidden rounded-full border border-line bg-surface">
      <Link href={href()} className={item(view === "daftar")} aria-label="Tampilan daftar" title="Daftar" scroll={false}><LayoutList className="size-4" strokeWidth={1.5} /></Link>
      <Link href={href("tabel")} className={item(view === "tabel")} aria-label="Tampilan tabel" title="Tabel" scroll={false}><Table2 className="size-4" strokeWidth={1.5} /></Link>
    </div>
  );
}
