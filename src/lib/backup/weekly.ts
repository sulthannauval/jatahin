import { TZ } from "../dates";
import type { BackupFile } from "./file";

/** The weekly backup email: the .xlsx file attached, with what it holds and how to restore it. */
export function weeklyBackupMail(to: string, file: BackupFile, now: Date) {
  const date = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(now);
  const c = file.counts;
  return {
    to,
    subject: `Backup mingguan Jatahin! ${date}`,
    lines: [
      `Terlampir backup otomatis seluruh data Jatahin! per ${date}.`,
      `Isi: ${c.transactions} transaksi, ${c.transfers} pindah kantong, ${c.categories} kategori, ${c.pots} kantong, ${c.adjustments} penyesuaian kantong, dan ${c.budgets} budget.`,
      "Untuk memulihkan, buka Pengaturan → Ekspor & impor lalu pilih file ini. Simpan email ini sebagai cadangan.",
    ],
    attachments: [{ filename: file.filename, content: file.content }],
  };
}
