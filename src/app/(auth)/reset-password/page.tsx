import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "../shell";
import { NewPasswordForm } from "../forms";
import { WithToken } from "../token-page";

export const metadata: Metadata = { title: "Password baru" };

export default function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthShell title="Password baru" sub="Semua perangkat lain akan dikeluarkan">
      <Suspense>
        <WithToken purpose="reset" searchParams={searchParams} retry={{ href: "/lupa-password", label: "Minta tautan baru" }}>
          {(token, email) => <NewPasswordForm kind="reset" token={token} email={email} />}
        </WithToken>
      </Suspense>
    </AuthShell>
  );
}
