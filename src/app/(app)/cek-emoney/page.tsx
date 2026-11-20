import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { EMoneyReader } from "./reader";

export const metadata: Metadata = { title: "Cek E-Money" };

/**
 * Tap a prepaid card on the phone to see its balance and the transactions it keeps. Android app only (NFC);
 * read-only and on its own: nothing is saved and nothing in Kantong or Transaksi changes.
 */
export default async function CekEMoneyPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Cek E-Money" sub="Saldo dan riwayat yang tersimpan di kartu." />
      <EMoneyReader />
    </div>
  );
}
