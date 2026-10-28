import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "../../shell";
import { NewPasswordForm } from "../../forms";
import { WithToken } from "../../token-page";

export const metadata: Metadata = { title: "Buat password" };

export default function SetupPasswordPage({ searchParams }: PageProps<"/daftar/buat-password">) {
  return (
    <AuthShell title="Buat password" sub="Langkah terakhir membuat akun">
      <Suspense>
        <WithToken purpose="setup" searchParams={searchParams} retry={{ href: "/daftar", label: "Minta tautan baru" }}>
          {(token, email) => (
            <>
              <p className="mb-4 text-sm leading-6 text-ink-2">Akun untuk <span className="font-medium text-ink">{email}</span>.</p>
              <NewPasswordForm kind="setup" token={token} email={email} />
            </>
          )}
        </WithToken>
      </Suspense>
    </AuthShell>
  );
}
