"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Archive, ArchiveRestore, Loader2, LogOut, MonitorSmartphone, Pencil, Plus, Upload, X } from "lucide-react";
import {
  importSpreadsheet, logout, saveCategory, savePot, saveSettings, setCategoryArchived, setPotArchived, type ActionResult,
} from "@/app/actions";
import { cancelEmailChange, changeEmail, changePassword, signOutEverywhere } from "@/app/account-actions";
import { MIN_PASSWORD } from "@/lib/auth/policy";
import { EXPENSE_GROUPS, INCOME_GROUPS } from "@/lib/finance";
import { groupDigits, rp } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { useTx } from "@/components/tx-context";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/cn";

type Cat = { id: number; name: string; kind: "income" | "expense"; group: string; archived: boolean };
type Pot = {
  id: number; name: string; note: string; target: number | null; targetDate: string | null; priority: number | null;
  openingBalance: number; openingDate: string | null; archived: boolean;
};

/** useActionState that toasts the result and runs onOk. */
function useFormAction(fn: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>, onOk?: () => void) {
  const { toast } = useTx();
  return useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await fn(prev, fd);
    if (r.ok) { toast(r.message ?? "Tersimpan"); onOk?.(); }
    return r;
  }, null);
}

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium">{title}</h2>
            <button onClick={onClose} className="grid size-9 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised" aria-label="Tutup"><X className="size-4" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

function ErrorText({ state }: { state: ActionResult | null }) {
  return state && !state.ok ? <p role="alert" className="rounded-xl bg-[var(--pill-neg-bg)] px-3 py-2 text-sm text-[var(--pill-neg-ink)]">{state.error}</p> : null;
}

function MoneyInput(props: { name: string; defaultValue?: number | null; placeholder?: string; id?: string }) {
  const [v, setV] = useState(props.defaultValue ? groupDigits(String(props.defaultValue)) : "");
  return <Input id={props.id} name={props.name} inputMode="numeric" value={v} placeholder={props.placeholder ?? "0"} onChange={(e) => setV(groupDigits(e.target.value))} />;
}

// ── Categories ────────────────────────────────────────────────

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [editing, setEditing] = useState<Partial<Cat> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { toast } = useTx();
  const [, start] = useTransition();
  const close = () => setEditing(null);
  const [state, action, pending] = useFormAction(saveCategory, close);

  const list = (kind: "income" | "expense") => categories.filter((c) => c.kind === kind && (showArchived || !c.archived));
  const archivedCount = categories.filter((c) => c.archived).length;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {(["expense", "income"] as const).map((kind) => (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{kind === "expense" ? "Pengeluaran" : "Pemasukan"}</h3>
              <button onClick={() => setEditing({ kind, group: kind === "expense" ? "Wajib" : "Rutin" })} className="flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px] text-ink-2 hover:bg-raised hover:text-ink">
                <Plus className="size-3.5" /> Tambah
              </button>
            </div>
            <ul className="divide-y divide-rule rounded-xl border border-line">
              {list(kind).map((c) => (
                <li key={c.id} className={cn("flex items-center gap-2 px-3 py-2", c.archived && "opacity-50")}>
                  <span className="min-w-0 flex-1 text-sm leading-5">{c.name}</span>
                  <Badge>{c.group}</Badge>
                  <button onClick={() => setEditing(c)} className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label={`Ubah ${c.name}`}><Pencil className="size-3.5" /></button>
                  <button
                    onClick={() => start(async () => { const r = await setCategoryArchived(c.id, !c.archived); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
                    className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
                    aria-label={c.archived ? `Aktifkan ${c.name}` : `Sembunyikan ${c.name}`}
                    title={c.archived ? "Aktifkan lagi" : "Sembunyikan (histori tetap aman)"}
                  >
                    {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-3 text-xs text-muted hover:text-ink">
          {showArchived ? "Sembunyikan" : "Tampilkan"} {archivedCount} kategori tersembunyi
        </button>
      )}

      <Dialog open={!!editing} onClose={close} title={editing?.id ? "Ubah kategori" : "Kategori baru"}>
        {editing && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={editing.id ?? ""} />
            <input type="hidden" name="kind" value={editing.kind} />
            <div><Label htmlFor="cat-name">Nama</Label><Input id="cat-name" name="name" defaultValue={editing.name} required autoFocus maxLength={60} /></div>
            <div>
              <Label htmlFor="cat-group">Tipe</Label>
              <Select id="cat-group" name="group" defaultValue={editing.group}>
                {(editing.kind === "expense" ? EXPENSE_GROUPS : INCOME_GROUPS).map((g) => <option key={g}>{g}</option>)}
              </Select>
              <p className="mt-1.5 text-xs text-muted">
                {editing.kind === "expense" ? "Tipe \"Saving\" digunakan untuk setoran ke pos tabungan." : "Tipe \"Bukan Income\" digunakan untuk penarikan dari pos tabungan dan tidak dihitung dalam saving rate."}
              </p>
            </div>
            <ErrorText state={state} />
            <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
          </form>
        )}
      </Dialog>
    </>
  );
}

// ── Pots & goals ──────────────────────────────────────────────

export function PotManager({ pots }: { pots: (Pot & { balance: number })[] }) {
  const [editing, setEditing] = useState<Partial<Pot> | null>(null);
  const { toast } = useTx();
  const [, start] = useTransition();
  const close = () => setEditing(null);
  const [state, action, pending] = useFormAction(savePot, close);

  return (
    <>
      <ul className="divide-y divide-rule rounded-xl border border-line">
        {pots.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 px-3 py-2.5", p.archived && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs leading-5 text-muted">
                {p.target ? `Goal #${p.priority ?? "–"} · target ${rp(p.target)}${p.targetDate ? ` · ${shortDate(p.targetDate)}` : ""}` : "Tanpa target"}
              </p>
            </div>
            <span className="num text-sm">{rp(p.balance)}</span>
            <button onClick={() => setEditing(p)} className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label={`Ubah ${p.name}`}><Pencil className="size-3.5" /></button>
            <button
              onClick={() => start(async () => { const r = await setPotArchived(p.id, !p.archived); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
              aria-label={p.archived ? `Aktifkan ${p.name}` : `Sembunyikan ${p.name}`}
            >
              {p.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing({})}><Plus className="size-3.5" /> Pos baru</Button>

      <Dialog open={!!editing} onClose={close} title={editing?.id ? `Ubah ${editing.name}` : "Pos tabungan baru"}>
        {editing && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={editing.id ?? ""} />
            <div><Label htmlFor="pot-name">Nama pos</Label><Input id="pot-name" name="name" defaultValue={editing.name} required maxLength={60} /></div>
            <fieldset className="rounded-xl border border-line p-3 pt-2">
              <legend className="px-1 text-xs text-ink-2">Goal (kosongkan target untuk tabungan tanpa target)</legend>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="pot-target">Target (Rp)</Label><MoneyInput id="pot-target" name="target" defaultValue={editing.target} placeholder="—" /></div>
                <div><Label htmlFor="pot-prio">Urutan</Label><Input id="pot-prio" name="priority" type="number" min={1} max={99} defaultValue={editing.priority ?? ""} /></div>
                <div className="col-span-2"><Label htmlFor="pot-date">Target tanggal</Label><Input id="pot-date" name="targetDate" type="date" defaultValue={editing.targetDate ?? ""} /></div>
              </div>
            </fieldset>
            <fieldset className="rounded-xl border border-line p-3 pt-2">
              <legend className="px-1 text-xs text-ink-2">Saldo acuan (saldo sebelum mulai dicatat di aplikasi)</legend>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="pot-ob">Saldo</Label><MoneyInput id="pot-ob" name="openingBalance" defaultValue={editing.openingBalance} /></div>
                <div><Label htmlFor="pot-od">Per tanggal</Label><Input id="pot-od" name="openingDate" type="date" defaultValue={editing.openingDate ?? ""} /></div>
              </div>
              <p className="mt-2 text-xs text-muted">Isi dengan saldo pada awal tanggal ini, sebelum transaksi hari tersebut. Transaksi sejak tanggal ini akan ikut dihitung.</p>
            </fieldset>
            <div><Label htmlFor="pot-note">Catatan</Label><Input id="pot-note" name="note" defaultValue={editing.note} maxLength={300} /></div>
            <ErrorText state={state} />
            <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
          </form>
        )}
      </Dialog>
    </>
  );
}

// ── General settings ──────────────────────────────────────────

export function SettingsForm({ carryStartMonth, carryStartBalance }: { carryStartMonth: string | null; carryStartBalance: number }) {
  const [state, action, pending] = useFormAction(saveSettings);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="st-cm">Mulai hitung dari bulan</Label>
          <Input id="st-cm" name="carryStartMonth" type="month" defaultValue={carryStartMonth ?? ""} />
        </div>
        <div>
          <Label htmlFor="st-cb">Saldo awal bulan itu</Label>
          <MoneyInput id="st-cb" name="carryStartBalance" defaultValue={carryStartBalance} />
        </div>
      </div>
      <ErrorText state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
    </form>
  );
}

// ── Import ────────────────────────────────────────────────────

export function ImportForm({ hasData }: { hasData: boolean }) {
  const [state, action, pending] = useFormAction(importSpreadsheet);
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-full border border-dashed border-control px-4 py-4 transition-colors hover:border-ink-2 hover:bg-raised/50">
        <Upload className="size-5 text-muted" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name || "Pilih file .xlsx dari spreadsheet lama"}</span>
          <span className="block text-xs text-muted">Google Sheets → File → Download → Microsoft Excel (.xlsx)</span>
        </span>
        <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" required onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
      </label>
      {hasData && (
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" name="replace" className="mt-0.5 size-4 accent-current" />
          <span>Hapus semua data lama dan ganti dengan isi file ini</span>
        </label>
      )}
      <ErrorText state={state} />
      {state?.ok && <p className="rounded-xl bg-[var(--pill-pos-bg)] px-3 py-2 text-sm text-[var(--pill-pos-ink)]">{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Impor</Button>
    </form>
  );
}

// ── Account ───────────────────────────────────────────────────

export type AccountInfo = {
  email: string;
  pendingEmail: string | null;
  passwordChanged: string;
  lastLogin: string | null;
  failures: number;
  mail: "resend" | "console" | "off";
};

const MAIL_STATUS = {
  resend: { text: "Aktif. Tautan dan pemberitahuan keamanan dikirim ke email login.", warn: false },
  console: { text: "Mode lokal. Email tidak dikirim, isinya ditampilkan di terminal.", warn: false },
  off: { text: "Belum diatur (RESEND_API_KEY). Lupa password dan ganti email belum dapat digunakan.", warn: true },
};

export function AccountManager({ info }: { info: AccountInfo }) {
  const [open, setOpen] = useState<"email" | "password" | "everywhere" | null>(null);
  const close = () => setOpen(null);
  const { toast } = useTx();
  const [emailState, emailAction, emailPending] = useFormAction(changeEmail, close);
  const [pwState, pwAction, pwPending] = useFormAction(changePassword, close);
  const [outPending, startOut] = useTransition();
  const [, startCancel] = useTransition();
  const mail = MAIL_STATUS[info.mail];

  return (
    <>
      <dl className="divide-y divide-rule rounded-xl border border-line">
        <Row
          label="Email login"
          value={info.email}
          extra={info.pendingEmail && (
            <span className="text-[var(--pill-warn-ink)]">
              Menunggu konfirmasi dari {info.pendingEmail} ·{" "}
              <button
                className="cursor-pointer underline underline-offset-2 hover:text-ink"
                onClick={() => startCancel(async () => { const r = await cancelEmailChange(); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
              >
                Batalkan
              </button>
            </span>
          )}
          action={<Button variant="secondary" size="sm" onClick={() => setOpen("email")} disabled={info.mail === "off"}>Ubah</Button>}
        />
        <Row label="Password" value={`Diubah ${info.passwordChanged}`} action={<Button variant="secondary" size="sm" onClick={() => setOpen("password")}>Ubah</Button>} />
        <Row
          label="Aktivitas masuk"
          value={info.lastLogin ? `Terakhir ${info.lastLogin}` : "Belum tercatat"}
          extra={<span className={cn(info.failures > 0 && "text-[var(--pill-neg-ink)]")}>{info.failures === 0 ? "Tidak ada percobaan gagal dalam 24 jam terakhir" : `${info.failures} percobaan gagal dalam 24 jam terakhir`}</span>}
        />
        <Row label="Pengiriman email" value={mail.text} warn={mail.warn} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <LogoutButton />
        <Button variant="secondary" onClick={() => setOpen("everywhere")}><MonitorSmartphone className="size-4" /> Keluar dari semua perangkat</Button>
      </div>

      <Dialog open={open === "email"} onClose={close} title="Ubah email login">
        <form action={emailAction} className="space-y-4">
          <div><Label htmlFor="acc-email">Email baru</Label><Input id="acc-email" name="email" type="email" autoComplete="email" required autoFocus maxLength={200} /></div>
          <div><Label htmlFor="acc-email-pw">Password saat ini</Label><Input id="acc-email-pw" name="password" type="password" autoComplete="current-password" required /></div>
          <p className="text-xs leading-5 text-muted">Tautan konfirmasi dikirim ke email baru dan berlaku 60 menit. Email login berubah setelah tautan tersebut dibuka.</p>
          <ErrorText state={emailState} />
          <Button type="submit" className="w-full" disabled={emailPending}>{emailPending && <Loader2 className="size-4 animate-spin" />} Kirim tautan konfirmasi</Button>
        </form>
      </Dialog>

      <Dialog open={open === "password"} onClose={close} title="Ubah password">
        <form action={pwAction} className="space-y-4">
          <input type="text" name="username" autoComplete="username" value={info.email} readOnly hidden />
          <div><Label htmlFor="acc-cur">Password saat ini</Label><Input id="acc-cur" name="current" type="password" autoComplete="current-password" required autoFocus /></div>
          <div><Label htmlFor="acc-new">Password baru</Label><Input id="acc-new" name="next" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></div>
          <div><Label htmlFor="acc-rep">Ulangi password baru</Label><Input id="acc-rep" name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></div>
          <p className="text-xs leading-5 text-muted">Minimal {MIN_PASSWORD} karakter. Setelah disimpan, semua perangkat lain dikeluarkan dan pemberitahuan dikirim ke email login.</p>
          <ErrorText state={pwState} />
          <Button type="submit" className="w-full" disabled={pwPending}>{pwPending && <Loader2 className="size-4 animate-spin" />} Simpan password</Button>
        </form>
      </Dialog>

      <Dialog open={open === "everywhere"} onClose={close} title="Keluar dari semua perangkat?">
        <p className="text-sm leading-6 text-ink-2">Semua sesi diakhiri, termasuk di perangkat ini. Anda perlu masuk kembali di setiap perangkat.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close}>Batal</Button>
          <Button className="flex-1" disabled={outPending} onClick={() => startOut(() => signOutEverywhere())}>
            {outPending && <Loader2 className="size-4 animate-spin" />} Keluar semua
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Row({ label, value, extra, action, warn }: { label: string; value: string; extra?: ReactNode; action?: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className={cn("text-sm leading-5 break-words", warn && "text-[var(--pill-neg-ink)]")}>{value}</dd>
        {extra && <dd className="mt-0.5 text-xs leading-5 text-muted">{extra}</dd>}
      </div>
      {action}
    </div>
  );
}

export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(() => logout())}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Keluar
    </Button>
  );
}
