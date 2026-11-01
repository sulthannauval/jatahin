import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LayoutList, Table2 } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getActivity, getCategories, type ActivityRow } from "@/lib/queries";
import { currentMonth, isMonthKey, monthLabel, monthName, today } from "@/lib/dates";
import { getBillsPage, type BillsPage } from "@/lib/bill-queries";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge, Card, EmptyState } from "@/components/ui";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxList } from "@/components/tx-list";
import { TxTable } from "@/components/tx-table";
import { TxFilters } from "./filters";

export const metadata: Metadata = { title: "Transaksi" };

const byType: Record<string, (r: ActivityRow) => boolean> = {
  keluar: (r) => r.type === "tx" && r.kind === "expense",
  masuk: (r) => r.type === "tx" && r.kind === "income",
  pindah: (r) => r.type === "transfer",
};

/**
 * One question: "what did I spend on?" The month's two totals, a search and the kinds of entry as chips,
 * then one card per day. The sheet-style table is one toggle away on wider screens.
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/transaksi">) {
  await requireSession();
  const sp = await searchParams;
  const month = isMonthKey(sp.m) ? sp.m : currentMonth();
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const t = typeof sp.t === "string" && sp.t in byType ? sp.t : "";
  const c = t !== "pindah" && typeof sp.c === "string" && /^\d+$/.test(sp.c) ? Number(sp.c) : undefined;
  const view = sp.v === "tabel" ? "tabel" : "daftar";
  const db = await getDb();
  const [all, cats, bills] = await Promise.all([getActivity(db, { month, q, categoryId: c }), getCategories(db, true), getBillsPage(db, today())]);
  const rows = t ? all.filter(byType[t]) : all;
  // The totals stay those of the search and category, whichever kind of entry is shown.
  const income = all.reduce((s, r) => s + (r.type === "tx" && r.kind === "income" ? r.amount : 0), 0);
  const expense = all.reduce((s, r) => s + (r.type === "tx" && r.kind === "expense" ? r.amount : 0), 0);
  const count = rows.length;
  const keep = { q: q || undefined, c: c ? String(c) : undefined, t: t || undefined };

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Transaksi</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} sp={{ m: isMonthKey(sp.m) ? sp.m : undefined, ...keep }} />
          <MonthSwitcher month={month} path="/transaksi" params={{ ...keep, v: view === "tabel" ? "tabel" : undefined }} />
        </div>
      </div>
      <p className="mt-0.5 mb-4 text-sm text-muted">{count} catatan di {monthLabel(month)}{q ? ` untuk “${q}”` : ""}</p>

      <BillsCard bills={bills} />

      <Card className="grid grid-cols-2">
        <Total label="Pemasukan" value={(income ? "+" : "") + rp(income)} className={income ? "text-pos" : "text-muted"} />
        <Total label="Pengeluaran" value={rp(expense)} className={cn(!expense && "text-muted")} divider />
      </Card>

      <div className="mt-4 mb-5">
        <TxFilters categories={cats.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))} />
      </div>

      {rows.length ? (
        view === "tabel" ? <Card className="overflow-x-auto"><TxTable rows={rows} /></Card> : <TxList rows={rows} />
      ) : (
        <Card>
          <EmptyState title={q || c || t ? "Tidak ada hasil" : `Belum ada transaksi di ${monthLabel(month)}`}>
            {q || c || t ? "Coba kata kunci, jenis, atau kategori lain." : "Tekan tombol + untuk mulai mencatat."}
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

function Total({ label, value, className, divider }: { label: string; value: string; className?: string; divider?: boolean }) {
  return (
    <div className={cn("min-w-0 px-4 py-3 sm:px-5", divider && "border-l border-rule")}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn("num mt-0.5 truncate text-[17px] font-bold tracking-[-0.01em] sm:text-lg", className)}>{value}</p>
    </div>
  );
}

/** List or the sheet-style table. The table needs width, so phones only get the list. */
function ViewToggle({ view, sp }: { view: string; sp: Record<string, string | undefined> }) {
  const href = (v?: string) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...sp, v })) if (val) q.set(k, val);
    const s = q.toString();
    return s ? `/transaksi?${s}` : "/transaksi";
  };
  const item = (active: boolean) => cn("grid h-full w-10 place-items-center transition-colors", active ? "bg-active text-ink" : "text-muted hover:bg-raised hover:text-ink");
  return (
    <div className="hidden h-10 overflow-hidden rounded-full border border-line bg-surface md:flex">
      <Link href={href()} className={item(view === "daftar")} aria-label="Tampilan daftar" title="Daftar" scroll={false}><LayoutList className="size-4" strokeWidth={1.5} /></Link>
      <Link href={href("tabel")} className={item(view === "tabel")} aria-label="Tampilan tabel" title="Tabel" scroll={false}><Table2 className="size-4" strokeWidth={1.5} /></Link>
    </div>
  );
}

/** Tagihan as a feature with its state this month, not a link: what is still owed and whether any is late. */
function BillsCard({ bills: b }: { bills: BillsPage }) {
  const open = b.rows.filter((r) => r.status.kind === "open");
  const late = open.filter((r) => r.status.kind === "open" && r.status.tone === "late").length;
  const dueToday = open.some((r) => r.status.kind === "open" && r.status.tone === "today");
  const unpaid = b.rows.length - b.paid;
  const line = !b.rows.length
    ? "Catat yang dibayar tiap bulan, lalu diingatkan"
    : unpaid > 0
      ? `${unpaid} belum dibayar · ${rp(b.left)}`
      : `Semua beres bulan ${monthName(currentMonth())}`;
  return (
    <Link href="/transaksi/tagihan" className="mb-3 flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3 transition-colors hover:bg-raised/50">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">Tagihan</span>
        <span className="num block truncate text-[13px] text-muted">{line}</span>
      </span>
      {late > 0 ? <Badge tone="neg">Telat {late}</Badge> : dueToday ? <Badge tone="warn">Hari ini</Badge> : null}
      <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
    </Link>
  );
}
