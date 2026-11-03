"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, Plus, Settings2 } from "lucide-react";
import { PaidPicker } from "@/components/bill-reminders";
import { deleteBill, findSimilarPayments, reopenBill, saveBill, savePayday, skipBill, type SimilarPayment } from "@/app/bill-actions";
import { Dialog, ErrorText, useFormAction } from "@/components/form-kit";
import { useTx } from "@/components/tx-context";
import { Badge, Button, Card, Input, Label, PanelHeader, Select } from "@/components/ui";
import type { BillsPage, BillStatus } from "@/lib/bill-queries";
import { monthName, shortDate } from "@/lib/dates";
import { groupDigits, rp } from "@/lib/money";
import { cn } from "@/lib/cn";

type Opt = { id: number; name: string };
type Row = BillsPage["rows"][number];
/** A transaction a new tagihan starts from ("Jadikan tagihan"). */
export type FromTx = { id: number; date: string; description: string; categoryId: number; potId: number | null; amount: number };

const day = (date: string) => shortDate(date).replace(/ \d{4}$/, "");
const pill = "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-field px-3 text-[13px] text-ink-2 transition-colors hover:bg-active hover:text-ink";

export function BillsManager({ data, today, from, expenseCats, incomeCats, pots }: {
  data: BillsPage; today: string; from: FromTx | null; expenseCats: Opt[]; incomeCats: Opt[]; pots: Opt[];
}) {
  const router = useRouter();
  // null: closed.
  const [editing, setEditing] = useState<{ row: Row | null } | null>(from ? { row: null } : null);
  const [payday, setPayday] = useState(false);
  const month = today.slice(0, 7);
  const close = () => {
    setEditing(null);
    if (from) router.replace("/transaksi/tagihan", { scroll: false });
  };

  const groups = useMemo(() => {
    const out: { key: string; title: string; note: string; rows: Row[] }[] = [];
    const paydayRows = data.rows.filter((r) => r.schedule === "payday");
    const days = [...new Set(data.rows.filter((r) => r.schedule === "date").map((r) => r.dueDay!))].sort((a, b) => a - b);
    for (const d of days) out.push({ key: `d${d}`, title: `Tanggal ${d}`, note: "", rows: data.rows.filter((r) => r.schedule === "date" && r.dueDay === d) });
    if (paydayRows.length) out.push({ key: "payday", title: "Pas gajian", note: data.paydayDay ? `tanggal ${data.paydayDay}` : "tanggal belum diatur", rows: paydayRows });
    return out;
  }, [data]);
  const salaryName = incomeCats.find((c) => c.id === data.salaryCategoryId)?.name;

  return (
    <>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Tagihan</h1>
        <button type="button" onClick={() => setEditing({ row: null })} className={pill}>
          <Plus className="size-3.5" strokeWidth={2} /> Tagihan
        </button>
      </div>
      <p className="mt-0.5 mb-5 text-sm text-muted">Dibayar tiap bulan. Nominalnya ikut bayaran terakhir.</p>

      {data.rows.length > 0 ? (
        <Card className="px-5 py-5 sm:px-6">
          <p className="text-sm text-muted">{monthName(month)}</p>
          <p className="num mt-1 text-[28px] leading-[1.15] font-bold tracking-[-0.03em]">{data.left > 0 ? `${rp(data.left)} lagi` : "Semua sudah beres"}</p>
          <p className="num mt-1.5 text-[13px] text-muted">
            {data.paid} dari {data.rows.length} sudah dibayar atau dilewati · total {rp(data.total)} per bulan
          </p>
        </Card>
      ) : (
        <Card className="px-5 py-6 sm:px-6">
          <p className="text-[15px] font-medium">Belum ada tagihan</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Tambahkan yang dibayar tiap bulan, seperti listrik, internet, atau BPJS. Bisa juga dari transaksi lama: buka transaksinya, lalu pilih Jadikan tagihan.
          </p>
          <Button className="mt-4" onClick={() => setEditing({ row: null })}><Plus className="size-4" /> Tambah tagihan</Button>
        </Card>
      )}

      {/* Payday: when tagihan "pas gajian" are due, and which category the salary goes in */}
      <div className="mt-3 flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Gajian</span>
          <span className={cn("block text-[13px]", data.paydayDay ? "text-muted" : "text-[var(--pill-warn-ink)]")}>
            {data.paydayDay ? `Tiap tanggal ${data.paydayDay}${salaryName ? ` · ${salaryName}` : ""}` : "Belum diatur. Tagihan pas gajian muncul setelah diatur."}
          </span>
        </span>
        <button type="button" onClick={() => setPayday(true)} className={pill}>
          <Settings2 className="size-3.5" strokeWidth={1.75} /> {data.paydayDay ? "Ubah" : "Atur"}
        </button>
      </div>

      {groups.length > 0 && (
        <Card className="mt-3 overflow-hidden">
          {groups.map((g, i) => (
            <div key={g.key} className={cn(i > 0 && "border-t border-rule")}>
              <PanelHeader title={g.title} note={g.note} />
              <ul className="divide-y divide-rule">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setEditing({ row: r })} className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised/50 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{r.name}</span>
                        <span className="block truncate text-xs text-muted">{[r.categoryName, r.potName, r.note].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("num text-sm font-semibold", r.lastAmount === null && "font-normal text-muted")}>{r.lastAmount === null ? "Nominal belum ada" : rp(r.lastAmount)}</span>
                        <StatusBadge status={r.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={!!editing} onClose={close} title={editing?.row ? `Ubah ${editing.row.name}` : "Tagihan baru"}>
        {editing && (
          <BillForm
            key={editing.row?.id ?? "new"}
            bill={editing.row}
            from={editing.row ? null : from}
            expenseCats={expenseCats}
            pots={pots}
            month={month}
            onDone={close}
          />
        )}
      </Dialog>
      <Dialog open={payday} onClose={() => setPayday(false)} title="Gajian">
        {payday && <PaydayForm day={data.paydayDay} categoryId={data.salaryCategoryId} incomeCats={incomeCats} onDone={() => setPayday(false)} />}
      </Dialog>
    </>
  );
}

function StatusBadge({ status: s }: { status: BillStatus }) {
  if (s.kind === "open") return <Badge tone={s.tone === "late" ? "neg" : s.tone === "today" ? "warn" : "neutral"}>{s.label}</Badge>;
  if (s.kind === "paid") return <Badge tone="pos">Dibayar {day(s.date)}</Badge>;
  if (s.kind === "skipped") return <Badge>Dilewati</Badge>;
  if (s.kind === "next") return <span className="text-xs text-muted">{day(s.due)}</span>;
  return <Badge tone="warn">Atur gajian</Badge>;
}

function BillForm({ bill, from, expenseCats, pots, month, onDone }: {
  bill: Row | null; from: FromTx | null; expenseCats: Opt[]; pots: Opt[]; month: string; onDone: () => void;
}) {
  const { toast, openTx } = useTx();
  const [state, action, pending] = useFormAction(saveBill, onDone);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(bill?.name ?? from?.description ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(bill?.categoryId ?? from?.categoryId ?? "");
  const [potId, setPotId] = useState<number | "">(bill?.potId ?? from?.potId ?? "");
  const [schedule, setSchedule] = useState<"payday" | "date">(bill?.schedule ?? "payday");
  const [amount, setAmount] = useState(bill ? (bill.amount ? groupDigits(String(bill.amount)) : "") : from ? groupDigits(String(from.amount)) : "");
  // The transaction this tagihan starts from: its last payment.
  const [source, setSource] = useState<{ id: number; description: string; date: string; amount: number } | null>(from);
  const [similar, setSimilar] = useState<SimilarPayment[]>([]);
  const [busy, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // While typing a new tagihan's name: past spending with a name like it.
  useEffect(() => {
    if (bill || source || name.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => void findSimilarPayments(name).then((r) => live && setSimilar(r)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [name, bill, source]);
  const shown = !bill && !source && name.trim().length >= 2 ? similar : [];

  const use = (p: SimilarPayment) => {
    setName(p.description);
    setCategoryId(p.categoryId);
    setPotId(p.potId ?? "");
    setAmount(groupDigits(String(p.amount)));
    setSource({ id: p.id, description: p.description, date: p.date, amount: p.amount });
    setSimilar([]);
  };
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? r.message ?? "" : r.error ?? "", r.ok ? "ok" : "error");
      if (r.ok) after?.();
    });
  const s = bill?.status;
  // The month a skip applies to: the one being asked for, else the next one due.
  const skipMonth = s?.kind === "open" ? s.month : s?.kind === "next" ? s.due.slice(0, 7) : null;
  const settledNow = s?.kind === "paid" || s?.kind === "skipped";
  // The last payment, when there is one: the amount field is then only for the next tagihan.
  const paid = bill?.paidAmount ?? null;
  const pay = bill && { billId: bill.id, month: bill.payMonth, name: bill.name, categoryId: bill.categoryId, potId: bill.potId, lastAmount: bill.lastAmount };

  // "Sudah dibayar" swaps the form for the list of transactions to pick from.
  if (pay && picking) {
    return (
      <div>
        <p className="-mt-2 mb-1 text-sm font-medium">{bill.name} {monthName(pay.month)} sudah dibayar?</p>
        <PaidPicker bill={pay} onDone={onDone} />
        <Button variant="ghost" className="mt-1 w-full" onClick={() => setPicking(false)}>Kembali</Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* Where this month stands first; paying ahead is only offered once this month is settled */}
      {pay && <PayBox bill={bill} pay={pay} month={month} onPay={() => { onDone(); openTx({ kind: "expense", categoryId: pay.categoryId, potId: pay.potId, amount: pay.lastAmount ?? undefined, description: pay.name, billId: pay.billId, billMonth: pay.month }); }} onPicked={() => setPicking(true)} />}
      <input type="hidden" name="id" value={bill?.id ?? ""} />
      <input type="hidden" name="fromTxId" value={source?.id ?? ""} />
      <input type="hidden" name="schedule" value={schedule} />
      <div>
        <Label htmlFor="bill-name">Nama</Label>
        <Input
          id="bill-name"
          name="name"
          value={name}
          onChange={(e) => { setName(e.target.value); if (source && !from) setSource(null); }}
          required
          maxLength={60}
          autoFocus={!bill && !from}
          autoComplete="off"
          placeholder="Contoh: Listrik PLN"
        />
        {shown.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-line" role="group" aria-label="Pernah dicatat">
            <p className="px-3 pt-2 text-xs text-muted">Pernah dicatat</p>
            <ul className="divide-y divide-rule">
              {shown.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.description}</span>
                    <span className="block text-xs text-muted">{p.categoryName} · {day(p.date)}</span>
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">{rp(p.amount)}</span>
                  <button type="button" onClick={() => use(p)} className={pill}>Pakai</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {source && (
          <p className="mt-2 rounded-xl bg-[var(--pill-hue-bg)] px-3 py-2 text-[13px] leading-5 text-[var(--pill-hue-ink)]">
            Bayaran terakhir: {source.description || "transaksi"}, {day(source.date)}, {rp(source.amount)}. Bulan berikutnya nominal ikut angka ini.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="bill-cat">Kategori</Label>
        <Select id="bill-cat" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")} required>
          <option value="">Pilih kategori</option>
          {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium">Dibayar</legend>
        <div role="radiogroup" aria-label="Dibayar" className="grid grid-cols-2 gap-2">
          {([["payday", "Pas gajian", "Muncul di lembar gajian"], ["date", "Tanggal tertentu", "Diingatkan di Beranda"]] as const).map(([k, title, sub]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={schedule === k}
              onClick={() => setSchedule(k)}
              className={cn("cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors", schedule === k ? "border-ink bg-surface" : "border-line text-ink-2 hover:bg-raised")}
            >
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>
        {schedule === "date" && (
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="bill-day" className="flex-1 text-sm text-ink-2">Tiap tanggal</label>
            <Input id="bill-day" name="dueDay" type="number" inputMode="numeric" min={1} max={31} required defaultValue={bill?.dueDay ?? ""} className="max-w-24 text-center" />
          </div>
        )}
      </fieldset>

      <div>
        <Label htmlFor="bill-amount">{paid !== null ? `Nominal ${monthName(bill!.payMonth)}` : "Nominal"}</Label>
        <Input id="bill-amount" name="amount" inputMode="numeric" value={amount} placeholder={paid !== null ? `Ikut bayaran terakhir, ${rp(paid)}` : "Boleh kosong"} onChange={(e) => setAmount(groupDigits(e.target.value))} aria-describedby="bill-amount-hint" />
        <p id="bill-amount-hint" className="mt-1.5 text-xs text-muted">
          {paid === null
            ? "Dipakai untuk tagihan pertama. Setelah itu ikut nominal terakhir dibayar."
            : amount
              ? `Dipakai untuk tagihan ${monthName(bill!.payMonth)} saja. Setelah dibayar, kembali ikut bayaran terakhir.`
              : "Isi kalau nominal tagihannya sudah keluar, jadi pas bayar tidak perlu diubah lagi."}
        </p>
      </div>

      {pots.length > 0 && (
        <div>
          <Label htmlFor="bill-pot">Dibayar dari</Label>
          <Select id="bill-pot" name="potId" value={potId} onChange={(e) => setPotId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Kantong Utama</option>
            {pots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="bill-note">Catatan</Label>
        <Input id="bill-note" name="note" defaultValue={bill?.note} maxLength={120} placeholder="Boleh kosong, misalnya: ke Mandiri" />
      </div>

      <ErrorText state={state} />
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>

      {bill && (
        <div className="space-y-2 border-t border-rule pt-4">
          {skipMonth && (
            <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => run(() => skipBill(bill.id, skipMonth), onDone)}>
              Lewati {monthName(skipMonth)}
            </Button>
          )}
          {settledNow && (
            <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => run(() => reopenBill(bill.id, month), onDone)}>
              {s?.kind === "paid" ? `Batalkan tanda lunas ${monthName(month)}` : `Jangan lewati ${monthName(month)}`}
            </Button>
          )}
          <Button
            type="button"
            variant="danger"
            className={cn("w-full", confirmDelete && "bg-[var(--pill-neg-bg)]")}
            disabled={busy}
            onClick={() => (confirmDelete ? run(() => deleteBill(bill.id), onDone) : setConfirmDelete(true))}
          >
            {confirmDelete ? `Hapus ${bill.name}` : "Hapus tagihan"}
          </Button>
          {confirmDelete && <p className="text-center text-xs text-muted">Transaksi yang sudah dicatat tetap ada.</p>}
        </div>
      )}
    </form>
  );
}

/**
 * This month's tagihan and how to pay it. When this month is already paid or skipped, that comes first in plain
 * words, and next month is a small question under it, so a later month is never read as this one being unpaid.
 */
function PayBox({ bill, pay, month, onPay, onPicked }: { bill: Row; pay: { month: string }; month: string; onPay: () => void; onPicked: () => void }) {
  const [ahead, setAhead] = useState(false);
  const now = bill.settled.find((x) => x.month === month);
  const last = bill.lastAmount !== null ? `${bill.amount === null ? "terakhir" : "nominal"} ${rp(bill.lastAmount)}` : null;
  const s = bill.status;
  const buttons = (label: string) => (
    <div className="mt-2.5 grid grid-cols-2 gap-2">
      <Button type="button" size="sm" onClick={onPay}>{label}</Button>
      <Button type="button" size="sm" variant="secondary" onClick={onPicked}>Sudah dibayar</Button>
    </div>
  );

  if (now) {
    return (
      <div className="rounded-2xl bg-[var(--pill-pos-bg)] p-3 text-[var(--pill-pos-ink)]">
        <p className="flex items-center gap-2 px-1 text-sm font-medium">
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
          {now.tx ? `${monthName(month)} sudah dibayar` : `${monthName(month)} dilewati`}
        </p>
        {now.tx && <p className="num mt-0.5 pl-7 text-[13px]">{day(now.tx.date)} · {rp(now.tx.amount)}</p>}
        <div className="mt-2.5 rounded-xl bg-surface p-3 text-ink">
          {ahead ? (
            <>
              <p className="num text-[13px] text-muted">Tagihan {monthName(pay.month)}{last ? ` · ${last}` : ""}</p>
              {buttons(`Bayar ${monthName(pay.month)}`)}
            </>
          ) : (
            <button type="button" onClick={() => setAhead(true)} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-[13px] text-ink-2 hover:text-ink">
              <span>Sekalian bayar tagihan {monthName(pay.month)}?</span>
              <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Not settled this month: what is owed, or when it is next due.
  const when = s.kind === "open" ? s.label : s.kind === "next" ? `jatuh tempo ${day(s.due)}` : null;
  return (
    <div className="rounded-2xl border border-line p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <span className="text-sm font-medium">Tagihan {monthName(pay.month)}</span>
        {s.kind === "open" ? <StatusBadge status={s} /> : when && <span className="text-[13px] text-muted">{when}</span>}
      </p>
      {last && <p className="num mt-0.5 px-1 text-[13px] text-muted">{last[0].toUpperCase() + last.slice(1)}</p>}
      {buttons("Bayar sekarang")}
    </div>
  );
}

function PaydayForm({ day: current, categoryId, incomeCats, onDone }: { day: number | null; categoryId: number | null; incomeCats: Opt[]; onDone: () => void }) {
  const [state, action, pending] = useFormAction(savePayday, onDone);
  return (
    <form action={action} className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="pd-day" className="flex-1 text-sm font-medium">Gaji masuk tiap tanggal</label>
        <Input id="pd-day" name="paydayDay" type="number" inputMode="numeric" min={1} max={31} required defaultValue={current ?? ""} autoFocus className="max-w-24 text-center" />
      </div>
      <div>
        <Label htmlFor="pd-cat">Kategori gaji</Label>
        <Select id="pd-cat" name="salaryCategoryId" defaultValue={categoryId ?? ""}>
          <option value="">Pilih saat gajian</option>
          {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <p className="mt-1.5 text-xs text-muted">Di lembar gajian, gaji dicatat ke kategori ini.</p>
      </div>
      <ErrorText state={state} />
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
    </form>
  );
}
