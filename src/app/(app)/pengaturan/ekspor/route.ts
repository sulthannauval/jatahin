import writeXlsxFile from "write-excel-file/node";
import { requireSession } from "@/lib/auth/dal";
import { readBackup } from "@/lib/backup/db";
import { toSheets } from "@/lib/backup/format";
import { getDb } from "@/lib/db";
import { today } from "@/lib/dates";

// Downloads every finance table as one .xlsx file that the import form can restore.
export async function GET() {
  await requireSession();
  const now = new Date();
  const sheets = toSheets(await readBackup(await getDb()), now);
  const buffer = await writeXlsxFile(sheets, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jatahin-backup-${today(now)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
