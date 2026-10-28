"use server";

// Everything that happens before signing in: sign-in, first-time setup, forgotten password,
// and confirming a new email address. Links sent by email are one-time and short-lived.
import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { LOCK_MINUTES, clearFailures, createAccount, getAccount, isLockedOut, recordFailure, recordLogin, setEmail, setPasswordHash } from "@/lib/auth/account";
import { consumeToken, issueToken, recentTokens } from "@/lib/auth/tokens";
import { normalizeEmail, passwordProblem } from "@/lib/auth/policy";
import { clientIp, loadAccount, startSession } from "@/lib/auth/dal";
import { appUrl, mailMode, sendMail, trySendMail } from "@/lib/mail";
import { dateTimeLabel } from "@/lib/dates";

export type AuthState = { error?: string; message?: string; email?: string } | null;

const SETUP_MINUTES = 60;
const RESET_MINUTES = 30;
const MAX_LINKS = 3; // per purpose per 15 minutes
const EXPIRED = "Tautan tidak valid, sudah digunakan, atau sudah kedaluwarsa. Silakan minta tautan baru.";

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// ── Sign in ───────────────────────────────────────────────────

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd, "email").trim().toLowerCase();
  const password = str(fd, "password");
  if (!process.env.SESSION_SECRET) return { error: "Server belum dikonfigurasi (SESSION_SECRET)." };
  const acc = await loadAccount();
  if (!acc) return { error: "Akun belum dibuat. Buat akun terlebih dahulu.", email };

  const ip = await clientIp();
  const db = await getDb();
  if (await isLockedOut(db, ip)) return { error: `Terlalu banyak percobaan gagal. Coba lagi ${LOCK_MINUTES} menit lagi.`, email };

  // Always run the hash check so timing doesn't reveal whether the email was right.
  const passOk = await verifyPassword(password, acc.passwordHash);
  if (!(safeEqual(email, acc.email) && passOk)) {
    await recordFailure(db, ip);
    return { error: "Email atau password salah.", email };
  }

  await Promise.all([clearFailures(db, ip), recordLogin(db, ip)]);
  await startSession(acc.sessionVersion);
  redirect(safeNext(fd.get("next")));
}

// ── First-time setup ──────────────────────────────────────────

export async function requestSetup(_: AuthState, fd: FormData): Promise<AuthState> {
  const db = await getDb();
  if (await getAccount(db)) return { error: "Akun sudah dibuat. Silakan masuk." };
  const owner = normalizeEmail(process.env.APP_USER_EMAIL);
  if (!owner) return { error: "Server belum dikonfigurasi (APP_USER_EMAIL)." };
  const email = normalizeEmail(fd.get("email"));
  if (!email) return { error: "Format email tidak valid.", email: str(fd, "email") };
  if ((await recentTokens(db, "setup", 15)) >= MAX_LINKS) return { error: "Terlalu banyak permintaan. Coba lagi 15 menit lagi.", email };

  // Only the owner's address (APP_USER_EMAIL) gets a link; the reply is the same either way.
  if (email === owner) {
    const token = await issueToken(db, "setup", email, SETUP_MINUTES);
    try {
      await sendMail({
        to: email,
        subject: "Buat akun Jatahin!",
        lines: ["Gunakan tautan berikut untuk membuat password dan mulai menggunakan Jatahin!.", `Tautan berlaku ${SETUP_MINUTES} menit dan hanya dapat digunakan sekali.`],
        link: { label: "Buat password", url: `${await appUrl()}/daftar/buat-password?token=${token}` },
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Email gagal dikirim.", email };
    }
  }
  return { message: `Jika ${email} adalah email pemilik yang terdaftar, tautan untuk membuat akun telah dikirim. Periksa kotak masuk dan folder spam.` };
}

export async function completeSetup(_: AuthState, fd: FormData): Promise<AuthState> {
  const problem = passwordProblem(str(fd, "password"), str(fd, "repeat"));
  if (problem) return { error: problem };
  const db = await getDb();
  if (await getAccount(db)) return { error: "Akun sudah dibuat. Silakan masuk." };
  const email = await consumeToken(db, "setup", str(fd, "token"));
  if (!email) return { error: EXPIRED };
  if (!(await createAccount(db, email, await hashPassword(str(fd, "password"))))) return { error: "Akun sudah dibuat. Silakan masuk." };
  await recordLogin(db, await clientIp());
  await startSession(1);
  redirect("/");
}

// ── Forgotten password ────────────────────────────────────────

export async function requestReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = normalizeEmail(fd.get("email"));
  if (!email) return { error: "Format email tidak valid.", email: str(fd, "email") };
  if (mailMode() === "off") return { error: "Pengiriman email belum diatur. Gunakan npm run reset-password dari terminal.", email };

  const db = await getDb();
  const acc = await getAccount(db);
  // Same reply whether or not the address matches, so the form can't be used to guess the login email.
  if (acc && email === acc.email && (await recentTokens(db, "reset", 15)) < MAX_LINKS) {
    const token = await issueToken(db, "reset", email, RESET_MINUTES);
    await trySendMail({
      to: email,
      subject: "Atur ulang password Jatahin!",
      lines: [
        "Kami menerima permintaan untuk mengatur ulang password akun Jatahin! Anda.",
        `Tautan berlaku ${RESET_MINUTES} menit dan hanya dapat digunakan sekali. Abaikan email ini jika Anda tidak memintanya; password tidak akan berubah.`,
      ],
      link: { label: "Atur ulang password", url: `${await appUrl()}/reset-password?token=${token}` },
    });
  }
  return { message: `Jika ${email} terdaftar, tautan untuk mengatur ulang password telah dikirim. Periksa kotak masuk dan folder spam.` };
}

export async function completeReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const problem = passwordProblem(str(fd, "password"), str(fd, "repeat"));
  if (problem) return { error: problem };
  const db = await getDb();
  const email = await consumeToken(db, "reset", str(fd, "token"));
  const acc = await getAccount(db);
  if (!email || !acc || acc.email !== email) return { error: EXPIRED };

  const version = await setPasswordHash(db, await hashPassword(str(fd, "password")));
  await clearFailures(db);
  await recordLogin(db, await clientIp());
  await startSession(version);
  await trySendMail({
    to: acc.email,
    subject: "Password Jatahin! telah diubah",
    lines: [
      `Password akun Jatahin! Anda diatur ulang pada ${dateTimeLabel(new Date())}. Semua perangkat lain telah dikeluarkan.`,
      "Jika ini bukan Anda, segera atur ulang password melalui halaman login.",
    ],
  });
  redirect("/");
}

// ── New email address ─────────────────────────────────────────

export async function confirmEmailChange(_: AuthState, fd: FormData): Promise<AuthState> {
  const db = await getDb();
  const email = await consumeToken(db, "email_change", str(fd, "token"));
  const acc = await getAccount(db);
  if (!email || !acc) return { error: EXPIRED };
  await setEmail(db, email);
  if (acc.email !== email) {
    await trySendMail({
      to: acc.email,
      subject: "Email login Jatahin! telah diganti",
      lines: [`Email login akun Jatahin! Anda diganti menjadi ${email} pada ${dateTimeLabel(new Date())}.`, "Jika ini bukan Anda, segera hubungi penyedia email Anda dan atur ulang password."],
    });
  }
  return { message: `Email login sekarang ${email}. Gunakan email ini saat masuk berikutnya.` };
}
