"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Download, Loader2, LogOut, MonitorSmartphone, Upload } from "lucide-react";
import { importSpreadsheet, logout, saveSettings } from "@/app/actions";
import { cancelEmailChange, changeEmail, changePassword, signOutEverywhere } from "@/app/account-actions";
import { MIN_PASSWORD } from "@/lib/auth/policy";
import { Dialog, ErrorText, MoneyInput, useFormAction } from "@/components/form-kit";
import { useTx } from "@/components/tx-context";
import { Button, buttonClass, Input, Label } from "@/components/ui";
import { cn } from "@/lib/cn";

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

// ── Export & import ───────────────────────────────────────────

export function ExportBackup({ txCount }: { txCount: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm">
        <span className="block font-medium">Backup data</span>
        <span className="block text-[13px] text-muted">
          {txCount} transaksi beserta kategori, kantong, pindah kantong, penyesuaian, jatah, target menabung, dan pengaturan. Email dan password tidak disertakan.
        </span>
      </p>
      {/* A plain link: the route returns a file, so there is nothing to prefetch. */}
      <a href="/pengaturan/ekspor" download className={buttonClass("secondary")}>
        <Download className="size-4" strokeWidth={1.75} /> Unduh .xlsx
      </a>
    </div>
  );
}

export function ImportForm({ hasData }: { hasData: boolean }) {
  const [state, action, pending] = useFormAction(importSpreadsheet);
  const [name, setName] = useState("");
  const [replace, setReplace] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-full border border-dashed border-control px-4 py-4 transition-colors hover:border-ink-2 hover:bg-raised/50">
        <Upload className="size-5 text-muted" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name || "Pilih file .xlsx"}</span>
          <span className="block text-xs text-muted">Backup Jatahin! atau spreadsheet MoneyFlows lama</span>
        </span>
        <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" required onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
      </label>
      {hasData && (
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" name="replace" className="mt-0.5 size-4 accent-current" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>Hapus semua data lama dan ganti dengan isi file ini</span>
        </label>
      )}
      {hasData && replace && (
        <div>
          <Label htmlFor="import-pw">Password saat ini</Label>
          <Input id="import-pw" name="password" type="password" autoComplete="current-password" required />
          <p className="mt-1 text-xs text-muted">Diperlukan karena semua data lama akan dihapus.</p>
        </div>
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
          <p className="text-xs leading-5 text-muted">Tautan konfirmasi dikirim ke email baru, berlaku 60 menit. Email login berubah setelah tautan dibuka.</p>
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
        <p className="text-sm leading-6 text-ink-2">Semua perangkat keluar, termasuk yang ini. Masuk lagi di tiap perangkat.</p>
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
