import writeXlsxFile from "write-excel-file/node";
import type { DB } from "../db";
import { today } from "../dates";
import { readBackup } from "./db";
import { toSheets } from "./format";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type BackupFile = {
  filename: string;
  content: Buffer;
  counts: { transactions: number; categories: number; pots: number; adjustments: number; budgets: number };
};

/** Every finance table as one .xlsx file that the import form can restore. */
export async function backupFile(db: DB, now = new Date()): Promise<BackupFile> {
  const data = await readBackup(db);
  const content = await writeXlsxFile(toSheets(data, now), { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return {
    filename: `jatahin-backup-${today(now)}.xlsx`,
    content,
    counts: {
      transactions: data.transactions.length, categories: data.categories.length, pots: data.pots.length,
      adjustments: data.adjustments.length, budgets: data.budgets.length,
    },
  };
}
