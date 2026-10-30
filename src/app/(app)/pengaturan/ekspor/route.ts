import { requireSession } from "@/lib/auth/dal";
import { XLSX_TYPE, backupFile } from "@/lib/backup/file";
import { getDb } from "@/lib/db";

// Downloads every finance table as one .xlsx file that the import form can restore.
export async function GET() {
  await requireSession();
  const { filename, content } = await backupFile(await getDb());
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
