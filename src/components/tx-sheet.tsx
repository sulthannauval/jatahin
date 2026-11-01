"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Calendar, Check, Loader2, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createCategory, deleteTransaction, deleteTransfer, saveTransaction, saveTransfer, type ActionResult } from "@/app/actions";
import { reopenBill } from "@/app/bill-actions";
import { addDays, dayLabel, today } from "@/lib/dates";
import { groupDigits, rp } from "@/lib/money";
import { guessCategory } from "@/lib/quick";
import { EXPENSE_GROUPS, INCOME_GROUPS } from "@/lib/finance";
import type { FormOptions } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { useTx, type TxDraft } from "./tx-context";
import { Picker, type PickerSection } from "./picker";
import { PaydaySheet, type Payday } from "./payday-sheet";

export function TxSheet({ options, payday }: { options: FormOptions; payday: Payday | null }) {
  const { draft, closeTx, openTx } = useTx();
  const ref = useRef<HTMLDialogElement>(null);
  // "Sekalian bayar tagihan?": the payday sheet opens once the salary is saved.
  const [paydayOpen, setPaydayOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (draft && !d.open) d.showModal();
    if (!draft && d.open) d.close();
  }, [draft]);

  // The home-screen shortcuts open the app at /?catat=pengeluaran or /?catat=pemasukan.
  useEffect(() => {
    const url = new URL(window.location.href);
    const catat = url.searchParams.get("catat");
    if (!catat) return;
    url.searchParams.delete("catat");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    openTx({ kind: catat === "pemasukan" ? "income" : "expense" });
  }, [openTx]);

  // "N" opens a new transaction from anywhere (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      openTx();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTx]);

  return (
    <>
      <dialog ref={ref} className="sheet" onClose={closeTx} onClick={(e) => e.target === ref.current && closeTx()} aria-labelledby="tx-title">
        {draft && <TxForm key={draft.nonce} draft={draft} options={options} payday={payday} onPayday={() => setPaydayOpen(true)} />}
      </dialog>
      {payday && <PaydaySheet open={paydayOpen} onClose={() => setPaydayOpen(false)} data={payday} salaryDone />}
    </>
  );
}

function TxForm({ draft, options, payday, onPayday }: { draft: TxDraft; options: FormOptions; payday: Payday | null; onPayday: () => void }) {
  const { closeTx, toast } = useTx();
  const router = useRouter();
  const [kind, setKind] = useState(draft.kind);
  const [categoryId, setCategoryId] = useState<number | undefined>(draft.categoryId);
  // Kantong pickers use 0 for Kantong Utama, which has no row.
  const [potId, setPotId] = useState<number>(draft.potId ?? 0);
  const [fromPotId, setFromPotId] = useState<number | undefined>(draft.id || draft.fromPotId !== undefined ? draft.fromPotId ?? 0 : 0);
  const [toPotId, setToPotId] = useState<number | undefined>(draft.id || draft.toPotId !== undefined ? draft.toPotId ?? 0 : undefined);
  const [amount, setAmount] = useState(draft.amount ? groupDigits(String(draft.amount)) : "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [date, setDate] = useState(draft.date ?? today());
  // True while the category was filled in from the note, so typing on can still change it.
  const [autoCat, setAutoCat] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const again = useRef(false);
  const [payNow, setPayNow] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const isEdit = !!draft.id;

  const isMove = kind === "transfer";
  // Categories made in this sheet, usable before the server's list catches up.
  const [added, setAdded] = useState<FormOptions["categories"]>([]);
  const allCats = useMemo(() => [...options.categories, ...added.filter((a) => !options.categories.some((c) => c.id === a.id))], [options.categories, added]);
  const cats = useMemo(() => allCats.filter((c) => c.kind === kind), [allCats, kind]);
  const cat = allCats.find((c) => c.id === categoryId);
  const [newCat, setNewCat] = useState<{ name: string; group: string } | null>(null);
  const suggestions = (!isMove && categoryId && options.suggestions[categoryId]) || [];
  const groups = (kind === "income" ? INCOME_GROUPS : EXPENSE_GROUPS) as readonly string[];
  const kantongSections = useMemo<PickerSection[]>(() => {
    const opt = (p: FormOptions["pots"][number]) => ({ id: p.id, name: p.name, hint: rp(p.balance) });
    return [
      { title: "Utama", options: [{ id: 0, name: "Kantong Utama", hint: rp(options.utama) }] },
      { title: "Tabungan", options: options.pots.filter((p) => p.kind === "saving").map(opt) },
      { title: "Belanja", options: options.pots.filter((p) => p.kind === "spending").map(opt) },
    ].filter((sec) => sec.options.length);
  }, [options.pots, options.utama]);
  const catIds = useMemo(() => new Set(cats.map((c) => c.id)), [cats]);
  const frequent = useMemo(() => options.frequent.filter((e) => catIds.has(e.categoryId)).slice(0, 6), [options.frequent, catIds]);
  // Past notes for this kind, most used first, offered while typing.
  const pastNotes = useMemo(
    () => [...new Set(options.history.filter((h) => catIds.has(h.categoryId)).map((h) => h.description))].slice(0, 60),
    [options.history, catIds],
  );
  // Dropdown sections: the most-used first, then every category under its type.
  const catSections = useMemo<PickerSection[]>(() => {
    const byGroup = [...groups, ...new Set(cats.map((c) => c.group).filter((g) => !groups.includes(g)))]
      .map((g) => ({ title: g, options: cats.filter((c) => c.group === g).map((c) => ({ id: c.id, name: c.name, group: c.group })) }))
      .filter((sec) => sec.options.length);
    return [{ title: "Sering digunakan", options: cats.slice(0, 5).map((c) => ({ id: c.id, name: c.name, group: c.group })) }, ...byGroup];
  }, [cats, groups]);

  const [state, action, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const res = fd.get("kind") === "transfer" ? await saveTransfer(prev, fd) : await saveTransaction(prev, fd);
    if (res.ok) {
      const undo = res.undo;
      toast(res.message ?? "Tersimpan", "ok", undo && {
        label: "Bukan ini",
        run: () => void reopenBill(undo.billId, undo.month).then((r) => toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error")),
      });
      // Only when the offer was still showing and ticked as it was saved.
      if (fd.get("payday") === "1" && !again.current) {
        closeTx();
        onPayday();
      } else if (again.current) {
        setAmount("");
        setDescription("");
        amountRef.current?.focus();
      } else closeTx();
    }
    return res;
  }, null);

  useEffect(() => {
    // New entries start on the amount; the dialog would otherwise focus the first button.
    if (!isEdit) requestAnimationFrame(() => amountRef.current?.focus());
  }, [isEdit]);

  const switchKind = (k: TxDraft["kind"]) => {
    setKind(k);
    setNewCat(null);
    if (cat && cat.kind !== k) setCategoryId(undefined);
  };
  const pick = (id: number) => {
    setCategoryId(id);
    setAutoCat(false);
  };
  const typeNote = (text: string) => {
    setDescription(text);
    if (categoryId && !autoCat) return;
    const guess = guessCategory(options.history, text, catIds);
    if (guess === categoryId) return;
    setCategoryId(guess ?? undefined);
    setAutoCat(guess !== null);
  };
  const applyEntry = (e: (typeof frequent)[number]) => {
    setCategoryId(e.categoryId);
    setPotId(e.potId ?? 0);
    setDescription(e.description);
    setAmount(groupDigits(String(e.amount)));
    setAutoCat(false);
    // Ready to type over the amount if it differs this time.
    requestAnimationFrame(() => amountRef.current?.select());
  };

  const t = today();
  const yesterday = addDays(t, -1);
  // Recording the salary: offer the tagihan pas gajian right after.
  const offer = !isEdit && kind === "income" && !!payday && categoryId === payday.salary.categoryId;
  const size = amount.length > 11 ? "text-[34px]" : amount.length > 8 ? "text-[40px]" : "text-[48px]";

  return (
    <form action={action} className="flex max-h-[inherit] flex-col">
      <input type="hidden" name="id" value={draft.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="payday" value={offer && payNow ? "1" : ""} />
      {isMove ? (
        <>
          <input type="hidden" name="fromPotId" value={fromPotId || ""} />
          <input type="hidden" name="toPotId" value={toPotId || ""} />
        </>
      ) : (
        <>
          <input type="hidden" name="categoryId" value={categoryId ?? ""} />
          <input type="hidden" name="potId" value={potId || ""} />
          <input type="hidden" name="billId" value={draft.billId ?? ""} />
          <input type="hidden" name="billMonth" value={draft.billMonth ?? ""} />
        </>
      )}

      {/* Header: title centred, close on the right; the kind sits under it as a small pill track */}
      <div className="relative px-5 pt-5">
        <h2 id="tx-title" className="text-center text-[15px] font-medium">{isMove ? (isEdit ? "Ubah pindah kantong" : "Pindah uang") : isEdit ? "Ubah transaksi" : "Catat transaksi"}</h2>
        <button type="button" onClick={closeTx} className="absolute top-3.5 right-3.5 grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink" aria-label="Tutup">
          <X className="size-4" strokeWidth={1.75} />
        </button>
        <div className="mx-auto mt-4 flex w-fit rounded-full bg-field p-1" role="radiogroup" aria-label="Jenis">
          {/* An entry stays what it is when edited: income and spending can swap, a move stays a move */}
          {(isEdit ? (isMove ? (["transfer"] as const) : (["expense", "income"] as const)) : (["expense", "income", "transfer"] as const)).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => switchKind(k)}
              className={cn(
                "h-8 cursor-pointer rounded-full px-4 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150",
                kind === k ? "bg-elevated text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--border)]" : "text-muted hover:text-ink",
              )}
            >
              {k === "expense" ? "Pengeluaran" : k === "income" ? "Pemasukan" : "Pindah"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto px-5 pb-5">
        {/* Amount: the one big thing, no box */}
        <label htmlFor="tx-amount" className="sr-only">Nominal</label>
        <div className="flex items-center justify-center gap-2 pt-7 pb-6">
          <span className={cn("text-2xl font-medium", amount ? "text-muted" : "text-control")}>Rp</span>
          {/* The input sizes itself to its text: a hidden twin span sets the width of the shared grid cell. */}
          <span className={cn("num inline-grid font-bold tracking-[-0.03em]", size)}>
            <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">{amount || "0"}</span>
            <input
              ref={amountRef}
              id="tx-amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              size={1}
              autoFocus={!isEdit}
              value={amount}
              onChange={(e) => setAmount(groupDigits(e.target.value))}
              className={cn("col-start-1 row-start-1 w-full min-w-0 bg-transparent p-0 font-[inherit] tracking-[inherit] text-ink caret-hue outline-none placeholder:text-control", kind === "income" && amount && "text-pos")}
              required
            />
          </span>
        </div>

        {isMove && <p className="-mt-3 mb-4 text-center text-xs text-muted">Bukan pemasukan atau pengeluaran</p>}

        {!isEdit && !isMove && frequent.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs text-muted">Sering dicatat</p>
            <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
              {frequent.map((e) => {
                const name = e.description || options.categories.find((c) => c.id === e.categoryId)?.name;
                const pot = e.potId !== null ? options.pots.find((p) => p.id === e.potId)?.name : null;
                return (
                  <button
                    key={`${e.categoryId}-${e.potId}-${e.description}`}
                    type="button"
                    onClick={() => applyEntry(e)}
                    className="flex shrink-0 cursor-pointer flex-col items-start rounded-xl border border-line px-3 py-1.5 text-left transition-colors hover:bg-field"
                  >
                    <span className="max-w-40 truncate text-[13px] text-ink">{name}{pot ? ` · ${pot}` : ""}</span>
                    <span className="num text-xs text-muted">{rp(e.amount)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Details as a grouped list: label on the left, the value inline */}
        <div className="overflow-hidden rounded-2xl bg-field">
          {isMove ? (
            <>
              <Picker label="Dari" placeholder="Pilih kantong" searchable={false} sections={kantongSections} value={fromPotId} onChange={setFromPotId} />
              <div className="mx-4 h-px bg-elevated" />
              <Picker label="Ke" placeholder="Pilih kantong" searchable={false} sections={kantongSections} value={toPotId} onChange={setToPotId} invalid={!!state && !state.ok && toPotId === undefined} />
            </>
          ) : (
            <>
              <Picker
                label="Kategori"
                placeholder="Pilih kategori"
                sections={catSections}
                value={categoryId}
                onChange={pick}
                invalid={!!state && !state.ok && !categoryId}
                onCreate={(q) => setNewCat({ name: q, group: kind === "income" ? "Rutin" : "Kebutuhan" })}
                createLabel="Kategori baru"
              />
              {newCat && (
                <NewCategory
                  kind={kind === "income" ? "income" : "expense"}
                  groups={groups}
                  initial={newCat}
                  onCancel={() => setNewCat(null)}
                  onCreated={(c) => { setAdded((a) => [...a, c]); pick(c.id); setNewCat(null); toast("Kategori ditambah"); }}
                />
              )}
              {/* Most entries use Kantong Utama, so this row only appears once other kantong exist */}
              {options.pots.length > 0 && (
                <>
                  <div className="mx-4 h-px bg-elevated" />
                  <Picker label={kind === "income" ? "Ke kantong" : "Dari kantong"} placeholder="Kantong Utama" searchable={false} sections={kantongSections} value={potId} onChange={setPotId} />
                </>
              )}
            </>
          )}
          <div className="mx-4 h-px bg-elevated" />
          <label className="flex min-h-12 items-center gap-3 px-4">
            <span className="w-20 shrink-0 text-[13px] text-muted">Catatan</span>
            <input
              id="tx-desc"
              name="description"
              value={description}
              onChange={(e) => typeNote(e.target.value)}
              list={isEdit || isMove ? undefined : "tx-notes"}
              placeholder="Opsional"
              autoComplete="off"
              maxLength={200}
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
            />
          </label>
          {!isEdit && (
            <datalist id="tx-notes">
              {pastNotes.map((d) => <option key={d} value={d} />)}
            </datalist>
          )}
          <div className="mx-4 h-px bg-elevated" />
          <div className="flex min-h-12 items-center gap-3 px-4">
            <span className="w-20 shrink-0 text-[13px] text-muted">Tanggal</span>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {[{ v: t, l: "Hari ini" }, { v: yesterday, l: "Kemarin" }].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => setDate(o.v)}
                  aria-pressed={date === o.v}
                  className={cn("h-8 cursor-pointer rounded-full px-3 text-[13px] transition-colors", date === o.v ? "bg-elevated text-ink shadow-[0_0_0_1px_var(--border)]" : "text-muted hover:text-ink")}
                >
                  {o.l}
                </button>
              ))}
              <label className="relative ml-auto flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors hover:text-ink">
                <Calendar className="size-3.5" strokeWidth={1.75} />
                <span className={cn(date !== t && date !== yesterday && "text-ink")}>{date !== t && date !== yesterday ? dayLabel(date, t) : "Pilih"}</span>
                <input
                  type="date"
                  name="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pilih tanggal"
                  required
                />
              </label>
            </div>
          </div>
        </div>

        {suggestions.length > 0 && !description && (
          <div className="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5" aria-label="Catatan sebelumnya">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setDescription(s)} className="h-8 shrink-0 cursor-pointer rounded-full border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-field hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Something paid every month can become a tagihan from here */}
        {isEdit && kind === "expense" && draft.kind === "expense" && (
          <button
            type="button"
            onClick={() => { closeTx(); router.push(`/transaksi/tagihan?dari=${draft.id}`); }}
            className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-field px-3.5 text-[13px] text-ink-2 transition-colors hover:bg-active hover:text-ink"
          >
            <Repeat className="size-3.5" strokeWidth={1.75} /> Jadikan tagihan
          </button>
        )}

        {/* Recording the salary: the tagihan pas gajian can follow right after */}
        {offer && (
          <button
            type="button"
            role="checkbox"
            aria-checked={payNow}
            onClick={() => setPayNow(!payNow)}
            className={cn("mt-3 flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors", payNow ? "border-hue bg-brand-soft" : "border-line hover:bg-field")}
          >
            <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-lg border-[1.5px]", payNow ? "border-ink bg-ink text-surface" : "border-control bg-surface")}>
              {payNow && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Sekalian bayar tagihan?</span>
              <span className="num block text-xs text-muted">
                {payday.bills.length} tagihan, {rp(payday.bills.reduce((t, b) => t + (b.lastAmount ?? 0), 0))}. Dicek dulu sebelum disimpan.
              </span>
            </span>
          </button>
        )}

        {state && !state.ok && (
          <p role="alert" className="mt-4 rounded-xl bg-[var(--pill-neg-bg)] px-3.5 py-2.5 text-sm text-[var(--pill-neg-ink)]">{state.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-rule bg-elevated px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {isEdit ? (
          <Button
            type="button"
            variant="danger"
            size="lg"
            disabled={deleting}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startDelete(async () => {
                const r = isMove ? await deleteTransfer(draft.id!) : await deleteTransaction(draft.id!);
                if (r.ok) { toast(r.message ?? "Dihapus"); closeTx(); } else toast(r.error, "error");
              });
            }}
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            {confirmDelete ? "Konfirmasi hapus" : "Hapus"}
          </Button>
        ) : (
          <Button type="submit" variant="secondary" size="lg" disabled={pending} onClick={() => (again.current = true)}>
            Simpan &amp; tambah
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={pending} onClick={() => (again.current = false)}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {offer && payNow ? "Simpan & cek tagihan" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A small form inside the sheet for a category that doesn't exist yet. Not a <form> (it sits inside the sheet's),
 * so Enter in the name saves this and never the transaction.
 */
function NewCategory({ kind, groups, initial, onCancel, onCreated }: {
  kind: "income" | "expense";
  groups: readonly string[];
  initial: { name: string; group: string };
  onCancel: () => void;
  onCreated: (c: FormOptions["categories"][number]) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [group, setGroup] = useState(initial.group);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => {
    if (!name.trim()) { setError("Isi nama kategori."); return; }
    start(async () => {
      const r = await createCategory({ name, kind, group });
      if (r.ok) onCreated({ id: r.id, name: name.trim(), kind, group });
      else setError(r.error);
    });
  };
  return (
    <div className="mx-2 mb-2 rounded-xl bg-elevated p-3 shadow-[0_0_0_1px_var(--border)]" role="group" aria-label="Kategori baru">
      <label className="block text-[13px] text-muted" htmlFor="newcat-name">Nama kategori {kind === "income" ? "pemasukan" : "pengeluaran"}</label>
      <input
        id="newcat-name"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } }}
        autoFocus
        maxLength={60}
        autoComplete="off"
        aria-describedby={error ? "newcat-error" : undefined}
        className="mt-1 h-10 w-full rounded-lg bg-field px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      />
      <p className="mt-3 text-[13px] text-muted" id="newcat-group">Tipe</p>
      <div role="radiogroup" aria-labelledby="newcat-group" className="mt-1 flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={group === g}
            onClick={() => setGroup(g)}
            className={cn("h-8 cursor-pointer rounded-full px-3 text-[13px] transition-colors", group === g ? "bg-ink text-surface" : "bg-field text-ink-2 hover:bg-active hover:text-ink")}
          >
            {g}
          </button>
        ))}
      </div>
      {error && <p id="newcat-error" role="alert" className="mt-2 text-[13px] text-neg">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={onCancel}>Batal</Button>
        <Button type="button" size="sm" className="flex-1" disabled={pending} onClick={save}>{pending && <Loader2 className="size-3.5 animate-spin" />} Simpan kategori</Button>
      </div>
    </div>
  );
}
