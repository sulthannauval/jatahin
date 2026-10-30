import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadAccount } from "@/lib/auth/dal";
import { AuthShell } from "../shell";
import { EmailLinkForm } from "../forms";

export const metadata: Metadata = { title: "Buat akun" };

export default function SetupPage() {
  return (
    <AuthShell title="Buat akun" sub="Hanya untuk email pemilik" footer={<>Sudah punya akun? <Link href="/login" className="font-medium text-brand-ink hover:underline">Masuk</Link></>}>
      <p className="mb-4 text-sm leading-6 text-ink-2">Masukkan email pemilik. Tautan untuk membuat password akan dikirim ke email tersebut.</p>
      <Suspense>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}

async function Gate() {
  if (await loadAccount()) redirect("/login");
  return <EmailLinkForm kind="setup" />;
}
