"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { recordPayday } from "@/app/bill-actions";
import type { BillReminders } from "@/lib/bill-queries";
import { monthName, shortDate, today } from "@/lib/dates";
import { groupDigits, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Dialog } from "./form-kit";
import { useTx } from "./tx-context";
import { Button } from "./ui";

export type Payday = NonNullable<BillReminders["payday"]>;

const digits = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const fmt = (n: number | null) => (n ? groupDigits(String(n)) : "");
const amountInput =
  "num h-9 w-[8.5rem] shrink-0 rounded-lg border border-transparent bg-field px-2.5 text-right text-sm font-semibold outline-none transition-colors focus:border-ink focus:bg-surface";

/**
 * The step after the salary: every tagihan "pas gajian" with last month's amount ready to type over, and the
 * month's saving plan as a move to a saving kantong. One save records them all.
 */
export function PaydaySheet({ open, onClose, data, salaryAmount }: { open: boolean; onClose: () => void; data: Payday; salaryAmount?: number }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Gajian ${monthName(data.month)}`}>
      {open && <PaydayForm data={data} onDone={onClose} salaryAmount={salaryAmount} />}
    </Dialog>
  );
}

function PaydayForm({ data, onDone, salaryAmount }: { data: Payday; onDone: () => void; salaryAmount?: number }) {
  const { toast } = useTx();
  // The salary is recorded in the record sheet, never here: this sheet is the step after it.
  const s = data.salary;
  const [lines, setLines] = useState(() => new Map(data.bills.map((b) => [b.id, { on: true, amount: fmt(b.lastAmount) }])));
  const [savingOn, setSavingOn] = useState(!!data.saving);
  const [savingPot, setSavingPot] = useState(data.saving?.pots[0]?.id ?? 0);
  const [saving, setSaving] = useState(fmt(data.saving?.amount ?? null));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (id: number, patch: Partial<{ on: boolean; amount: string }>) =>
    setLines((m) => new Map(m).set(id, { ...m.get(id)!, ...patch }));
  const chosen = data.bills.filter((b) => lines.get(b.id)!.on);
  const billSum = chosen.reduce((sum, b) => sum + digits(lines.get(b.id)!.amount), 0);
  // Just saved in the record sheet, or already recorded this payday: shown so "Sisa untuk belanja" means something.
  const salaryIn = salaryAmount ?? (s.recordedOn ? s.amount ?? 0 : 0);
  const toSaving = savingOn && data.saving ? digits(saving) : 0;
  const count = chosen.length + (savingOn && data.saving ? 1 : 0);

  const save = () => {
    setError(null);
    start(async () => {
      const r = await recordPayday({
        month: data.month,
        date: today(),
        salary: null,
        bills: chosen.map((b) => ({ billId: b.id, amount: lines.get(b.id)!.amount })),
        saving: savingOn && data.saving ? { potId: savingPot, amount: saving } : null,
      });
      if (r.ok) { toast(r.message ?? "Tersimpan"); onDone(); } else setError(r.error);
    });
  };

  return (
    <div>
      {salaryIn > 0 && (
        <p className="num rounded-2xl bg-field px-4 py-3 text-sm text-ink-2">
          Gaji {rp(salaryIn)} sudah dicatat{s.recordedOn && !salaryAmount ? ` ${shortDate(s.recordedOn).replace(/ \d{4}$/, "")}` : ""}.
        </p>
      )}

      {/* Tagihan */}
      <div className={cn("flex items-baseline justify-between gap-3", salaryIn > 0 && "mt-4")}>
        <h3 className="text-sm font-medium">Tagihan pas gajian</h3>
        <span className="num text-[13px] text-muted">{chosen.length} · {rp(billSum)}</span>
      </div>
      <ul className="-mx-5 mt-1 divide-y divide-rule">
        {data.bills.map((b) => {
          const l = lines.get(b.id)!;
          const changed = b.lastAmount !== null && l.amount !== "" && digits(l.amount) !== b.lastAmount;
          return (
            <li key={b.id} className={cn("flex min-h-14 items-center gap-3 px-5 py-2", !l.on && "opacity-55")}>
              <Tick on={l.on} onChange={(on) => set(b.id, { on })} label={`Bayar ${b.name}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{b.name}</span>
                {changed ? (
                  <span className="num block text-xs text-[var(--pill-warn-ink)]">bulan lalu {rp(b.lastAmount!)}</span>
                ) : b.note ? (
                  <span className="block truncate text-xs text-muted">{b.note}</span>
                ) : b.lastAmount === null ? (
                  <span className="block text-xs text-[var(--pill-warn-ink)]">Isi nominal</span>
                ) : null}
              </span>
              <label className="sr-only" htmlFor={`pd-bill-${b.id}`}>Nominal {b.name}</label>
              <input
                id={`pd-bill-${b.id}`}
                inputMode="numeric"
                value={l.amount}
                disabled={!l.on}
                placeholder="Rp 0"
                onChange={(e) => set(b.id, { amount: groupDigits(e.target.value) })}
                className={amountInput}
              />
            </li>
          );
        })}
      </ul>

      {/* Saving plan */}
      {data.saving && (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">Sisihkan</h3>
            <span className="text-[13px] text-muted">pindah kantong</span>
          </div>
          <div className={cn("mt-1 flex min-h-14 items-center gap-3 py-2", !savingOn && "opacity-55")}>
            <Tick on={savingOn} onChange={setSavingOn} label="Sisihkan ke tabungan" />
            <span className="min-w-0 flex-1 text-sm">
              ke{" "}
              {data.saving.pots.length > 1 ? (
                <select aria-label="Kantong tabungan" value={savingPot} disabled={!savingOn} onChange={(e) => setSavingPot(Number(e.target.value))} className="cursor-pointer rounded-md bg-transparent font-medium underline decoration-control underline-offset-4 outline-none">
                  {data.saving.pots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <span className="font-medium">{data.saving.pots[0].name}</span>
              )}
              <span className="block text-xs text-muted">Target menabung {monthName(data.month)}</span>
            </span>
            <label className="sr-only" htmlFor="pd-saving">Nominal tabungan</label>
            <input id="pd-saving" inputMode="numeric" value={saving} disabled={!savingOn} onChange={(e) => setSaving(groupDigits(e.target.value))} className={amountInput} />
          </div>
        </>
      )}

      {/* What is left once it's all recorded */}
      <dl className="num mt-3 space-y-1.5 rounded-2xl bg-field px-4 py-3 text-[13px]">
        {salaryIn > 0 && <Row label="Gaji" value={rp(salaryIn)} />}
        <Row label="Tagihan" value={`− ${rp(billSum)}`} />
        {toSaving > 0 && <Row label="Ke tabungan" value={`− ${rp(toSaving)}`} />}
        {salaryIn > 0 && (
          <div className="flex justify-between gap-3 border-t border-rule pt-2 text-sm font-bold">
            <dt>Sisa untuk belanja</dt>
            <dd className={cn(salaryIn - billSum - toSaving < 0 && "text-neg")}>{rp(salaryIn - billSum - toSaving)}</dd>
          </div>
        )}
      </dl>

      {error && <p role="alert" className="mt-3 rounded-xl bg-[var(--pill-neg-bg)] px-3 py-2 text-sm text-[var(--pill-neg-ink)]">{error}</p>}
      <Button className="mt-4 w-full" size="lg" disabled={pending || count === 0} onClick={save}>
        {pending && <Loader2 className="size-4 animate-spin" />} Simpan {count} catatan
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Tick({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("grid size-6 shrink-0 cursor-pointer place-items-center rounded-lg border-[1.5px] transition-colors", on ? "border-ink bg-ink text-surface" : "border-control bg-surface")}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
