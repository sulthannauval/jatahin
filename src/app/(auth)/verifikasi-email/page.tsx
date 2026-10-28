import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "../shell";
import { ConfirmEmailForm } from "../forms";
import { WithToken } from "../token-page";

export const metadata: Metadata = { title: "Konfirmasi email" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verifikasi-email">) {
  return (
    <AuthShell title="Konfirmasi email" sub="Email login baru">
      <Suspense>
        <WithToken purpose="email_change" searchParams={searchParams} retry={{ href: "/pengaturan#akun", label: "Buka Pengaturan" }}>
          {(token, email) => <ConfirmEmailForm token={token} email={email} />}
        </WithToken>
      </Suspense>
    </AuthShell>
  );
}
