import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireSession } from "@/lib/auth/dal";
import { failuresLastDay } from "@/lib/auth/account";
import { pendingEmailChange } from "@/lib/auth/tokens";
import { mailMode } from "@/lib/mail";
import { getDb } from "@/lib/db";
import { countTransactions, getCategories, getSavings, getPots, getSettings } from "@/lib/queries";
import { dateTimeLabel, monthLabel } from "@/lib/dates";
import { rp } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { AccountManager, CategoryManager, ImportForm, PotManager, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const acc = await requireSession();
  const db = await getDb();
  const [cats, allPots, savings, cfg, txCount, failures, pendingEmail] = await Promise.all([
    getCategories(db, true), getPots(db, true), getSavings(db), getSettings(db), countTransactions(db), failuresLastDay(db), pendingEmailChange(db),
  ]);
  const bal = new Map(savings.pots.map((p) => [p.id, p.balance]));
  const activeCats = cats.filter((c) => !c.archived);

  return (
    <>
      <PageHeader title="Pengaturan" sub={`${txCount} transaksi tersimpan · ${activeCats.length} kategori aktif · ${allPots.filter((p) => !p.archived).length} pos tabungan`} />
      <div className="divide-y divide-line">
        <Section
          id="kategori"
          title="Kategori"
          description="Tipe pengeluaran digunakan dalam ringkasan (Wajib, Kebutuhan, Keinginan, Saving, Lainnya). Kategori yang disembunyikan tetap tersimpan dalam riwayat."
        >
          <CategoryManager categories={cats} />
        </Section>
        <Section
          id="pos"
          title="Pos tabungan & goal"
          description="Pos yang memiliki target menjadi goal dan diselesaikan sesuai urutan. Saldo dihitung dari saldo acuan (per awal tanggal acuan), ditambah setoran dan dikurangi penarikan sejak tanggal tersebut."
          aside={<p className="num mt-3 text-sm">Total sekarang <span className="font-bold">{rp(savings.total)}</span></p>}
        >
          <PotManager pots={allPots.map((p) => ({ ...p, balance: bal.get(p.id) ?? p.openingBalance }))} />
        </Section>
        <Section
          id="import"
          title="Impor dari Excel"
          description="Ekspor dari Google Sheets melalui File → Download → Microsoft Excel (.xlsx). Sheet Daily Log, Monthly Budget, Saving Goals, dan Categories dibaca secara otomatis."
        >
          <ImportForm hasData={txCount > 0} />
        </Section>
        <Section id="tampilan" title="Tampilan" description="Mode terang digunakan secara bawaan. Pilihan disimpan di perangkat ini.">
          <ThemeToggle className="max-w-xs" />
        </Section>
        <Section
          id="lanjutan"
          title="Lanjutan"
          description="Diatur sekali saat mulai menggunakan aplikasi dan umumnya tidak perlu diubah."
        >
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block">Saldo bawaan antar bulan</span>
                <span className="block text-[13px] text-muted">
                  {cfg.carryStartMonth ? `Mulai ${monthLabel(cfg.carryStartMonth)}, saldo awal ${rp(cfg.carryStartBalance)}` : "Belum diatur"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" strokeWidth={1.75} />
            </summary>
            <p className="mt-3 mb-4 text-[13px] leading-5 text-muted">
              Sisa dana setiap bulan (pemasukan dikurangi pengeluaran) otomatis menjadi saldo awal bulan berikutnya, dimulai dari bulan ini. Pengaturan ini membuat Saldo bersih di Ringkasan berkesinambungan antarbulan.
            </p>
            <SettingsForm carryStartMonth={cfg.carryStartMonth} carryStartBalance={cfg.carryStartBalance} />
          </details>
        </Section>
        <Section
          id="akun"
          title="Akun"
          description="Hanya satu akun yang dapat masuk. Sesi berlaku 30 hari per perangkat. Lupa password dapat diatur ulang melalui email dari halaman login."
        >
          <AccountManager
            info={{
              email: acc.email,
              pendingEmail,
              passwordChanged: dateTimeLabel(acc.passwordChangedAt),
              lastLogin: acc.lastLoginAt ? `${dateTimeLabel(acc.lastLoginAt)}${acc.lastLoginIp && acc.lastLoginIp !== "unknown" ? ` · IP ${acc.lastLoginIp}` : ""}` : null,
              failures,
              mail: mailMode(),
            }}
          />
        </Section>
      </div>
    </>
  );
}

function Section({ id, title, description, aside, children }: { id: string; title: string; description: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-6 grid-cols-1 gap-3 py-6 first:pt-0 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-8 [&>*]:min-w-0">
      <div className="lg:pt-2">
        <h2 className="text-[15px] font-medium">{title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>
        {aside}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">{children}</div>
    </section>
  );
}
