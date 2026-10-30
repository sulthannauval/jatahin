import { getAccount } from "@/lib/auth/account";
import { backupFile } from "@/lib/backup/file";
import { weeklyBackupMail } from "@/lib/backup/weekly";
import { isCronRequest } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { sendMail } from "@/lib/mail";

// Called by Vercel Cron (vercel.json) every Monday morning: emails the full .xlsx backup to the login email.
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = await getDb();
  const acc = await getAccount(db);
  if (!acc) return Response.json({ ok: true, skipped: "no account yet" });

  const now = new Date();
  const file = await backupFile(db, now);
  try {
    await sendMail(weeklyBackupMail(acc.email, file, now));
  } catch (e) {
    console.error("Weekly backup email not sent:", e);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, ...file.counts });
}
