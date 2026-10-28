import "server-only";
import { headers } from "next/headers";

// Sends through Resend's HTTP API when RESEND_API_KEY is set. In local development without a key,
// the message (with its link) is printed to the terminal instead.

type Mail = { to: string; subject: string; lines: string[]; link?: { label: string; url: string } };

export type MailMode = "resend" | "console" | "off";

export function mailMode(): MailMode {
  if (process.env.RESEND_API_KEY) return "resend";
  return process.env.NODE_ENV === "production" ? "off" : "console";
}

/** Base URL for links in emails. Never taken from request headers in production (they can be forged). */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV !== "production") return `http://${(await headers()).get("host") ?? "localhost:3000"}`;
  throw new Error("APP_URL is not set");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(m: Mail): { text: string; html: string } {
  const text = [...m.lines, ...(m.link ? ["", `${m.link.label}: ${m.link.url}`] : []), "", "— Jatahin!"].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1b2330;max-width:480px">
<p style="font-size:17px;font-weight:600;margin:0 0 16px">Jatahin!</p>
${m.lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("\n")}
${m.link ? `<p style="margin:20px 0"><a href="${esc(m.link.url)}" style="display:inline-block;background:#2f5bd3;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:500">${esc(m.link.label)}</a></p>
<p style="margin:0;font-size:13px;color:#667085">Jika tombol tidak berfungsi, salin tautan ini:<br>${esc(m.link.url)}</p>` : ""}
</div>`;
  return { text, html };
}

export async function sendMail(m: Mail): Promise<void> {
  const mode = mailMode();
  const { text, html } = render(m);
  if (mode === "console") {
    console.log(`\n┌─ Email (lokal, tidak dikirim) ─────────────\n│ Kepada: ${m.to}\n│ Subjek: ${m.subject}\n│\n${text.split("\n").map((l) => "│ " + l).join("\n")}\n└────────────────────────────────────────────\n`);
    return;
  }
  if (mode === "off") throw new Error("Pengiriman email belum diatur (RESEND_API_KEY).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Jatahin! <onboarding@resend.dev>", to: [m.to], subject: m.subject, text, html }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text().catch(() => ""));
    throw new Error("Email gagal dikirim. Coba lagi beberapa saat lagi.");
  }
}

/** For notices that shouldn't block the action if the email fails. */
export async function trySendMail(m: Mail): Promise<void> {
  try { await sendMail(m); } catch (e) { console.error(e); }
}
