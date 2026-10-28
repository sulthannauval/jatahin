import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { peekToken, type TokenPurpose } from "@/lib/auth/tokens";
import { Notice } from "./shell";

/** Renders `children(email)` for a valid link, or an explanation with a way to request a new one. */
export async function WithToken({ purpose, searchParams, retry, children }: {
  purpose: TokenPurpose;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  retry: { href: string; label: string };
  children: (token: string, email: string) => ReactNode;
}) {
  await connection();
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const email = await peekToken(await getDb(), purpose, token);
  if (!email) {
    return (
      <div className="space-y-4">
        <Notice tone="error">Tautan tidak valid, sudah digunakan, atau sudah kedaluwarsa.</Notice>
        <Link href={retry.href} className="block text-center text-sm font-medium text-brand hover:underline">{retry.label}</Link>
      </div>
    );
  }
  return children(token, email);
}
