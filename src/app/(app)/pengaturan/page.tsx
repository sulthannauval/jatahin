import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireSession } from "@/lib/auth/dal";
import { failuresLastDay } from "@/lib/auth/account";
import { pendingEmailChange } from "@/lib/auth/tokens";
import { mailMode } from "@/lib/mail";
import { getDb } from "@/lib/db";
import { countTransactions, getSettings } from "@/lib/queries";
import { dateTimeLabel, monthLabel } from "@/lib/dates";
import { rp } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { AccountManager, ExportBackup, ImportForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const acc = await requireSession();
  const db = await getDb();
  const [cfg, txCount, failures, pendingEmail] = await Promise.all([
    getSettings(db), countTransactions(db), failuresLastDay(db), pendingEmailChange(db),
  ]);

  return (
    <>
      <PageHeader title="Pengaturan" sub="Backup, tampilan, dan akun." />
      <div className="divide-y divide-line">
        <Section
          id="import"
          title="Ekspor & impor"
          description="Unduh backup secara berkala, lalu impor lagi untuk memulihkan data. Impor juga menerima spreadsheet MoneyFlows lama."
        >
          <ExportBackup txCount={txCount} />
          <div className="my-4 border-t border-rule" />
          <ImportForm hasData={txCount > 0} />
        </Section>
        <Section id="tampilan" title="Tampilan" description="Pilihan disimpan di perangkat ini.">
          <ThemeToggle className="max-w-xs" />
        </Section>
        <Section
          id="lanjutan"
          title="Lanjutan"
          description="Diatur sekali di awal, jarang perlu diubah."
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
              Sisa Kantong Utama tiap bulan jadi saldo awal bulan berikutnya, mulai dari bulan ini.
            </p>
            <SettingsForm carryStartMonth={cfg.carryStartMonth} carryStartBalance={cfg.carryStartBalance} />
          </details>
        </Section>
        <Section
          id="akun"
          title="Akun"
          description="Hanya satu akun. Sesi berakhir setelah 7 hari tidak dibuka. Lupa password bisa diatur ulang dari halaman login."
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
