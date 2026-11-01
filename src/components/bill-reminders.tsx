"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { findPaymentChoices, markBillPaid, skipBill, type PaymentChoice } from "@/app/bill-actions";
import type { BillReminders as Data } from "@/lib/bill-queries";
import { monthName, shortDate } from "@/lib/dates";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Dialog } from "./form-kit";
import { useTx } from "./tx-context";
import { Badge, Button } from "./ui";
import { PaydaySheet } from "./payday-sheet";

const day = (date: string) => shortDate(date).replace(/ \d{4}$/, "");
const HIDDEN = "jt-bill-hidden";
const AWAY = "jt-away-at";
/** Back after this long away counts as opening the app again, even if the phone kept it alive. */
const REOPEN_MS = 30 * 60 * 1000;

type Dated = Data["dated"][number];

/** Hidden cards live in sessionStorage: gone when the app is closed, kept while moving between pages. */
const hiddenStore = {
  subscribe(cb: () => void) {
    window.addEventListener("jt-bill-hidden", cb);
    return () => window.removeEventListener("jt-bill-hidden", cb);
  },
  get: () => sessionStorage.getItem(HIDDEN) ?? "[]",
  set(keys: string[] | null) {
    if (keys) sessionStorage.setItem(HIDDEN, JSON.stringify(keys));
    else sessionStorage.removeItem(HIDDEN);
    window.dispatchEvent(new Event("jt-bill-hidden"));
  },
};

/**
 * Tagihan waiting on Beranda, as one short banner so Kantong Utama stays on the first screen: the most pressing one
 * named, the rest counted. Tapping it opens "Perlu dibayar" with every action. ✕ hides it until the app is opened
 * again; it keeps coming back until each tagihan is settled (the payday one until the salary is recorded).
 */
export function BillReminders({ data }: { data: Data }) {
  const raw = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, () => "[]");
  const hidden = useMemo(() => new Set<string>(JSON.parse(raw)), [raw]);
  const [list, setList] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [picking, setPicking] = useState<Dated | null>(null);
  const { openTx, toast } = useTx();
  const [pending, start] = useTransition();

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") sessionStorage.setItem(AWAY, String(Date.now()));
      else if (Date.now() - Number(sessionStorage.getItem(AWAY) ?? Date.now()) > REOPEN_MS) hiddenStore.set(null);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const p = data.payday;
  const paydayKey = p ? `gajian:${p.month}` : "";
  const keyOf = (d: Dated) => `${d.billId}:${d.month}`;
  // Late first, then due today, then tomorrow.
  const rank = { late: 0, today: 1, soon: 2 } as const;
  const dated = data.dated.filter((d) => !hidden.has(keyOf(d))).sort((a, b) => rank[a.tone] - rank[b.tone] || (a.due < b.due ? -1 : 1));
  const payday = p && !hidden.has(paydayKey) ? p : null;
  const count = dated.length + (payday ? 1 : 0);
  if (!count) return null;

  const late = dated.filter((d) => d.tone === "late").length;
  const billTotal = payday ? payday.bills.reduce((s, b) => s + (b.lastAmount ?? 0), 0) : 0;
  const salaryIn = !!payday?.salary.recordedOn;
  const recordSalary = () => openTx({ kind: "income", categoryId: payday?.salary.categoryId ?? undefined, amount: payday?.salary.amount ?? undefined, withBills: true });
  const record = (d: Dated) => openTx({ kind: "expense", categoryId: d.categoryId, potId: d.potId, amount: d.lastAmount ?? undefined, description: d.name, billId: d.billId, billMonth: d.month });
  const paydayTitle = (pd: NonNullable<typeof payday>) =>
    pd.salary.recordedOn ? "Gaji sudah masuk" : pd.label.tone === "today" ? "Gajian hari ini!" : `Gaji ${day(pd.due)} belum dicatat`;
  const datedTitle = (d: Dated) => `${d.name} ${d.tone === "late" ? d.text.toLowerCase() : d.tone === "today" ? "hari ini" : "besok"}`;

  // One thing waiting: say it plainly, with its action right there. Several: count them and name each briefly.
  let title: string, sub: string, action: { label: string; run: () => void } | null = null;
  if (count === 1 && payday) {
    title = paydayTitle(payday);
    sub = salaryIn ? `${payday.bills.length} tagihan siap dibayar · ${rp(billTotal)}` : `${payday.bills.length} tagihan ikut beres sekalian`;
    action = salaryIn ? { label: "Bayar tagihan", run: () => setSheet(true) } : { label: "Catat gaji", run: recordSalary };
  } else if (count === 1) {
    const d = dated[0];
    title = datedTitle(d);
    sub = `Jatuh tempo ${day(d.due)}${d.lastAmount !== null ? ` · ${rp(d.lastAmount)}` : ""}`;
    action = { label: "Catat", run: () => record(d) };
  } else {
    title = late ? `${count} tagihan nunggu, ${late} telat` : `${count} tagihan nunggu dibayar`;
    sub = [
      ...dated.filter((d) => d.tone === "late").map((d) => `${d.name} telat`),
      ...(payday ? [payday.salary.recordedOn ? "Tagihan gajian" : payday.label.tone === "today" ? "Gajian hari ini" : "Gaji belum dicatat"] : []),
      ...dated.filter((d) => d.tone !== "late").map((d) => `${d.name} ${d.tone === "today" ? "hari ini" : "besok"}`),
    ].join(" · ");
  }
  const hideAll = () => hiddenStore.set([...hidden, ...dated.map(keyOf), ...(payday ? [paydayKey] : [])]);
  const then = (fn: () => void) => () => { setList(false); fn(); };

  return (
    <section aria-label="Tagihan" className="mb-4">
      <div className={cn("flex items-center gap-3 rounded-2xl border py-3 pr-2 pl-4 sm:pl-5", late ? "border-[var(--pill-neg-ink)]/40 bg-[var(--pill-neg-bg)]" : "border-hue bg-brand-soft")}>
        <button type="button" onClick={() => (action ? action.run() : setList(true))} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="line-clamp-2 block text-[15px] leading-5 font-semibold">{title}</span>
          <span className="num mt-0.5 line-clamp-2 block text-[13px] leading-[18px] text-ink-2">{sub}</span>
        </button>
        {action ? (
          <Button size="sm" className="shrink-0" onClick={action.run}>{action.label}</Button>
        ) : (
          <Button size="sm" variant="ink" className="shrink-0" onClick={() => setList(true)}>Lihat</Button>
        )}
        <button type="button" onClick={hideAll} aria-label="Sembunyikan pengingat tagihan" title="Sembunyikan sampai aplikasi dibuka lagi" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink">
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <Dialog open={list} onClose={() => setList(false)} title="Perlu dibayar">
        {list && (
          <ul className="-mx-5 -mt-2 divide-y divide-rule">
            {payday && (
              <li className="px-5 py-3.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium">Gajian {monthName(payday.month)}</span>
                  {!salaryIn && <Badge tone={payday.label.tone === "today" ? "warn" : "neutral"}>{payday.label.tone === "today" ? "Hari ini" : `Sejak ${day(payday.due)}`}</Badge>}
                </p>
                <p className="num mt-0.5 text-[13px] text-muted">
                  {salaryIn ? "Gaji sudah dicatat · " : ""}{payday.bills.length} tagihan {rp(billTotal)}{payday.saving ? ` · tabungan ${rp(payday.saving.amount)}` : ""}
                </p>
                <Button size="sm" className="mt-2.5" onClick={then(salaryIn ? () => setSheet(true) : recordSalary)}>{salaryIn ? "Bayar tagihan gajian" : "Catat gaji"}</Button>
              </li>
            )}
            {dated.map((d) => (
              <li key={keyOf(d)} className="px-5 py-3.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium">{d.name}</span>
                  <Badge tone={d.tone === "late" ? "neg" : d.tone === "today" ? "warn" : "neutral"}>{d.text}</Badge>
                </p>
                <p className="num mt-0.5 text-[13px] text-muted">
                  {d.tone === "late" ? `Jatuh tempo ${day(d.due)}` : d.categoryName}
                  {d.lastAmount !== null ? ` · bulan lalu ${rp(d.lastAmount)}` : ""}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={then(() => record(d))}>{d.lastAmount !== null ? `Catat ${rp(d.lastAmount)}` : "Catat"}</Button>
                  <Button size="sm" variant="secondary" onClick={then(() => setPicking(d))}>Sudah dibayar</Button>
                  {d.tone === "late" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(async () => { const r = await skipBill(d.billId, d.month); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
                    >
                      Lewati {monthName(d.month)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      {p && <PaydaySheet open={sheet} onClose={() => setSheet(false)} data={p} />}
      <Dialog open={!!picking} onClose={() => setPicking(null)} title={picking ? `${picking.name} sudah dibayar?` : ""}>
        {picking && <PaidPicker bill={picking} onDone={() => setPicking(null)} />}
      </Dialog>
    </section>
  );
}

/** "Sudah dibayar": pick the transaction that paid it, likeliest first. */
/** The tagihan month being paid, as the picker and "Catat sekarang" need it. */
export type PickBill = { billId: number; month: string; name: string; categoryId: number; potId: number | null; lastAmount: number | null };

export function PaidPicker({ bill, onDone }: { bill: PickBill; onDone: () => void }) {
  const { billId, month } = bill;
  const { toast, openTx } = useTx();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PaymentChoice[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void findPaymentChoices(billId, month, q).then((r) => {
      if (!live) return;
      setRows(r);
      setChosen((c) => (c !== null && r.some((x) => x.id === c) ? c : r[0]?.id ?? null));
    }), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [billId, month, q]);

  return (
    <div>
      <p className="-mt-2 mb-3 text-[13px] text-muted">Pilih transaksinya. Yang paling cocok di atas.</p>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <span className="sr-only">Cari transaksi</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari transaksi" className="h-10 w-full rounded-xl bg-field pr-3 pl-9 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ink/15" />
      </label>
      <div role="radiogroup" aria-label="Transaksi" className="-mx-5 mt-2 max-h-[46dvh] divide-y divide-rule overflow-y-auto">
        {rows === null && <p className="px-5 py-4 text-sm text-muted">Memuat…</p>}
        {rows?.length === 0 && <p className="px-5 py-4 text-sm text-muted">Tidak ada transaksi yang cocok di sekitar tanggal ini.</p>}
        {rows?.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={chosen === r.id}
            onClick={() => setChosen(r.id)}
            className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-raised/60"
          >
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]", chosen === r.id ? "border-ink" : "border-control")}>
              {chosen === r.id && <span className="size-2.5 rounded-full bg-ink" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{r.description || r.categoryName}</span>
              <span className="block truncate text-xs text-muted">{r.categoryName} · {day(r.date)}</span>
            </span>
            <span className="num shrink-0 text-sm font-semibold">{rp(r.amount)}</span>
          </button>
        ))}
      </div>
      <Button
        className="mt-4 w-full"
        disabled={chosen === null || pending}
        onClick={() => start(async () => {
          const r = await markBillPaid(billId, month, chosen!);
          toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error");
          if (r.ok) onDone();
        })}
      >
        {pending && <Loader2 className="size-4 animate-spin" />} Tandai lunas
      </Button>
      <p className="mt-3 text-center text-[13px] text-muted">
        Belum dicatat?{" "}
        <button type="button" onClick={() => { onDone(); openTx({ kind: "expense", categoryId: bill.categoryId, potId: bill.potId, amount: bill.lastAmount ?? undefined, description: bill.name, billId, billMonth: month }); }} className="cursor-pointer font-medium text-ink underline-offset-4 hover:underline">
          Catat sekarang
        </button>
      </p>
    </div>
  );
}
