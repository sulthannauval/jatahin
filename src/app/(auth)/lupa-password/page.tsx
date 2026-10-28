import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../shell";
import { EmailLinkForm } from "../forms";

export const metadata: Metadata = { title: "Lupa password" };

export default function ForgotPage() {
  return (
    <AuthShell title="Lupa password" sub="Atur ulang melalui email" footer={<Link href="/login" className="font-medium text-brand hover:underline">Kembali ke halaman masuk</Link>}>
      <p className="mb-4 text-sm leading-6 text-ink-2">Masukkan email login Anda. Tautan untuk membuat password baru akan dikirim dan berlaku 30 menit.</p>
      <EmailLinkForm kind="reset" />
    </AuthShell>
  );
}
