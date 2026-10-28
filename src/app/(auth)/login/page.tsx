import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadAccount } from "@/lib/auth/dal";
import { AuthShell } from "../shell";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthShell title="Jatahin!" sub="Masuk untuk melanjutkan" footer={<Suspense><SetupHint /></Suspense>}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

async function SetupHint() {
  if (await loadAccount()) return null;
  return <>Belum ada akun? <Link href="/daftar" className="font-medium text-brand hover:underline">Buat akun</Link></>;
}
