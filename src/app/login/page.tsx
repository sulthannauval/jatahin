import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Mark } from "@/components/nav";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Mark className="size-10" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Jatahin!</h1>
            <p className="text-sm text-muted">Masuk untuk melanjutkan</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
