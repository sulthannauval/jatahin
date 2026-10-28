import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getFormOptions } from "@/lib/queries";
import { TxSheet } from "./tx-sheet";

export async function TxSheetHost() {
  await requireSession();
  const options = await getFormOptions(await getDb());
  return <TxSheet options={options} />;
}
