"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { LOCK_MINUTES, bumpSessionVersion, isLockedOut, recordFailure, setPasswordHash } from "@/lib/auth/account";
import { cancelTokens, issueToken, recentTokens } from "@/lib/auth/tokens";
import { normalizeEmail, passwordProblem } from "@/lib/auth/policy";
import { clientIp, requireSession, startSession } from "@/lib/auth/dal";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { MAIL_FAILED, appUrl, mailMode, sendMail, trySendMail } from "@/lib/mail";
import { dateTimeLabel } from "@/lib/dates";
import type { ActionResult } from "./actions";

const VERIFY_MINUTES = 60;
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Checks the current password, counting wrong guesses toward the sign-in lockout. */
async function confirmPassword(hash: string, password: string): Promise<string | null> {
  const db = await getDb();
  const ip = await clientIp();
  if (await isLockedOut(db, ip)) return `Terlalu banyak percobaan gagal. Coba lagi ${LOCK_MINUTES} menit lagi.`;
  if (await verifyPassword(password, hash)) return null;
  await recordFailure(db, ip);
  return "Password saat ini salah.";
}

export async function changePassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const acc = await requireSession();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const problem = passwordProblem(next, String(fd.get("repeat") ?? ""));
  if (problem) return fail(problem);
  const err = await confirmPassword(acc.passwordHash, current);
  if (err) return fail(err);
  if (current === next) return fail("Password baru harus berbeda dari password saat ini.");

  const version = await setPasswordHash(await getDb(), await hashPassword(next));
  // Keep this device signed in; every other session now carries an old version.
  await startSession(version);
  await trySendMail({
    to: acc.email,
    subject: "Password Jatahin! telah diubah",
    lines: [
      `Password akun Jatahin! Anda diubah pada ${dateTimeLabel(new Date())}. Semua perangkat lain telah dikeluarkan.`,
      "Jika ini bukan Anda, segera atur ulang password melalui halaman login.",
    ],
  });
  refresh();
  return { ok: true, message: "Password diperbarui. Perangkat lain telah dikeluarkan." };
}

/** Sends a confirmation link to the new address; the login email changes only after it's opened. */
export async function changeEmail(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const acc = await requireSession();
  const email = normalizeEmail(fd.get("email"));
  if (!email) return fail("Format email tidak valid.");
  if (email === acc.email) return fail("Email baru sama dengan email saat ini.");
  const err = await confirmPassword(acc.passwordHash, String(fd.get("password") ?? ""));
  if (err) return fail(err);
  const db = await getDb();
  if ((await recentTokens(db, "email_change", 15)) >= 3) return fail("Terlalu banyak permintaan. Coba lagi 15 menit lagi.");

  if (mailMode() === "off") return fail("Pengiriman email belum diatur (RESEND_API_KEY).");

  let base: string;
  try {
    base = await appUrl();
  } catch (e) {
    console.error("Email change link not sent:", e);
    return fail(MAIL_FAILED);
  }
  const token = await issueToken(db, "email_change", email, VERIFY_MINUTES);
  try {
    await sendMail({
      to: email,
      subject: "Konfirmasi email login Jatahin!",
      lines: [
        `Buka tautan berikut untuk menjadikan ${email} sebagai email login Jatahin!.`,
        `Tautan berlaku ${VERIFY_MINUTES} menit. Abaikan email ini jika Anda tidak memintanya.`,
      ],
      link: { label: "Konfirmasi email", url: `${base}/verifikasi-email?token=${token}` },
    });
  } catch (e) {
    console.error("Email change link not sent:", e);
    await cancelTokens(db, "email_change");
    return fail(MAIL_FAILED);
  }
  refresh();
  return { ok: true, message: `Tautan konfirmasi dikirim ke ${email}.` };
}

export async function cancelEmailChange(): Promise<ActionResult> {
  await requireSession();
  await cancelTokens(await getDb(), "email_change");
  refresh();
  return { ok: true, message: "Perubahan email dibatalkan." };
}

export async function signOutEverywhere(): Promise<void> {
  await requireSession();
  await bumpSessionVersion(await getDb());
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
