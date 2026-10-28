"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { completeReset, completeSetup, confirmEmailChange, login, requestReset, requestSetup } from "./actions";
import { Button, Input, Label, buttonClass } from "@/components/ui";
import { MIN_PASSWORD } from "@/lib/auth/policy";
import { Notice } from "./shell";

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const params = useSearchParams();
  const notice = params.get("expired") === "1" ? "Sesi Anda telah berakhir. Silakan masuk kembali." : null;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus={!state?.email} defaultValue={state?.email} key={state?.email} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/lupa-password" className="text-xs text-muted hover:text-ink">Lupa password?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus={!!state?.email} />
      </div>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : notice && <Notice>{notice}</Notice>}
      <Submit pending={pending}>Masuk</Submit>
    </form>
  );
}

/** Asks for an email and sends a link: first-time setup or forgotten password. */
export function EmailLinkForm({ kind }: { kind: "setup" | "reset" }) {
  const [state, action, pending] = useActionState(kind === "setup" ? requestSetup : requestReset, null);
  if (state?.message) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus defaultValue={state?.email} key={state?.email} />
      </div>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Submit pending={pending}>Kirim tautan</Submit>
    </form>
  );
}

export function NewPasswordForm({ kind, token, email }: { kind: "setup" | "reset"; token: string; email: string }) {
  const [state, action, pending] = useActionState(kind === "setup" ? completeSetup : completeReset, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <div>
        <Label htmlFor="password">Password baru</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} autoFocus />
      </div>
      <div>
        <Label htmlFor="repeat">Ulangi password baru</Label>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} />
        <p className="mt-1.5 text-xs text-muted">Minimal {MIN_PASSWORD} karakter. Kalimat pendek yang mudah diingat lebih aman daripada kata acak yang pendek.</p>
      </div>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Submit pending={pending}>{kind === "setup" ? "Buat akun" : "Simpan password"}</Submit>
    </form>
  );
}

export function ConfirmEmailForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(confirmEmailChange, null);
  if (state?.message) {
    return (
      <div className="space-y-4">
        <Notice tone="ok">{state.message}</Notice>
        <Link href="/" className={buttonClass("secondary", "md") + " w-full"}>Buka Jatahin!</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm leading-6 text-ink-2">Jadikan <span className="font-medium text-ink">{email}</span> sebagai email login?</p>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Submit pending={pending}>Konfirmasi</Submit>
    </form>
  );
}
