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
 * Tagihan waiting on Beranda: the payday sheet when tagihan "pas gajian" are due, and one card per dated tagihan
 * from the day before. ✕ hides a card until the app is opened again; it comes back until the tagihan is settled.
 */
export function BillReminders({ data }: { data: Data }) {
  const raw = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, () => "[]");
  const hidden = useMemo(() => new Set<string>(JSON.parse(raw)), [raw]);
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
  const hide = (key: string) => hiddenStore.set([...hidden, key]);

  const p = data.payday;
  const paydayKey = p ? `gajian:${p.month}` : "";
  const dated = data.dated.filter((d) => !hidden.has(`${d.billId}:${d.month}`));
  const showPayday = p && !hidden.has(paydayKey);
  if (!showPayday && !dated.length) return null;
  const billTotal = p ? p.bills.reduce((s, b) => s + (b.lastAmount ?? 0), 0) : 0;

  return (
    <section aria-label="Tagihan" className="mb-4 space-y-2.5">
      {showPayday && (
        <div className="rounded-2xl border border-hue bg-brand-soft px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{p.label.tone === "today" ? "Hari ini gajian" : `Gajian ${day(p.due)} belum dicatat`}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {p.salary.recordedOn ? "Gaji sudah dicatat. " : ""}{p.bills.length} tagihan{p.saving ? " dan setor tabungan" : ""} menunggu dicatat.
              </p>
              <p className="num mt-2 text-[13px] text-ink-2">
                Tagihan {rp(billTotal)}{p.saving ? ` · Tabungan ${rp(p.saving.amount)}` : ""}
              </p>
            </div>
            <CloseBtn onClick={() => hide(paydayKey)} label="Sembunyikan pengingat gajian" />
          </div>
          {/* The salary is always recorded in the record sheet; the tagihan follow in the payday sheet. */}
          {p.salary.recordedOn ? (
            <Button className="mt-3 w-full sm:w-auto" onClick={() => setSheet(true)}>Bayar tagihan gajian</Button>
          ) : (
            <Button className="mt-3 w-full sm:w-auto" onClick={() => openTx({ kind: "income", categoryId: p.salary.categoryId ?? undefined, amount: p.salary.amount ?? undefined, withBills: true })}>
              Catat gaji
            </Button>
          )}
        </div>
      )}

      {dated.map((d) => (
        <div key={`${d.billId}:${d.month}`} className="rounded-2xl border border-line bg-surface px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium">{d.name}</span>
                <Badge tone={d.tone === "late" ? "neg" : d.tone === "today" ? "warn" : "neutral"}>{d.text}</Badge>
              </p>
              <p className="num mt-0.5 text-[13px] text-muted">
                {d.tone === "late" ? `Jatuh tempo ${day(d.due)}` : d.categoryName}
                {d.lastAmount !== null ? ` · bulan lalu ${rp(d.lastAmount)}` : ""}
              </p>
            </div>
            <CloseBtn onClick={() => hide(`${d.billId}:${d.month}`)} label={`Sembunyikan pengingat ${d.name}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => openTx({ kind: "expense", categoryId: d.categoryId, potId: d.potId, amount: d.lastAmount ?? undefined, description: d.name, billId: d.billId, billMonth: d.month })}
            >
              {d.lastAmount !== null ? `Catat ${rp(d.lastAmount)}` : "Catat"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPicking(d)}>Sudah dibayar</Button>
          </div>
          {d.tone === "late" && (
            <p className="mt-2.5 text-[13px] text-muted">
              Tidak bayar bulan ini?{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { const r = await skipBill(d.billId, d.month); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
                className="cursor-pointer font-medium text-ink underline-offset-4 hover:underline"
              >
                Lewati {monthName(d.month)}
              </button>
            </p>
          )}
        </div>
      ))}

      {p && <PaydaySheet open={sheet} onClose={() => setSheet(false)} data={p} />}
      <Dialog open={!!picking} onClose={() => setPicking(null)} title={picking ? `${picking.name} sudah dibayar?` : ""}>
        {picking && <PaidPicker bill={picking} onDone={() => setPicking(null)} />}
      </Dialog>
    </section>
  );
}

function CloseBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Sembunyikan sampai aplikasi dibuka lagi" className="-mt-1.5 -mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink">
      <X className="size-4" strokeWidth={1.75} />
    </button>
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
