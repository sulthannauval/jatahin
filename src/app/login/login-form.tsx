"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { login } from "./actions";
import { Button, Input, Label } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const next = useSearchParams().get("next") ?? "/";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus={!state?.email} defaultValue={state?.email} key={state?.email} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus={!!state?.email} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-[var(--pill-neg-bg)] px-3 py-2 text-sm text-[var(--pill-neg-ink)]">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Masuk
      </Button>
    </form>
  );
}
