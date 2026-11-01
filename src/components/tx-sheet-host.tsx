import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getFormOptions } from "@/lib/queries";
import { getPaydayPlan } from "@/lib/bill-queries";
import { today } from "@/lib/dates";
import { TxSheet } from "./tx-sheet";

export async function TxSheetHost() {
  await requireSession();
  const db = await getDb();
  const [options, payday] = await Promise.all([getFormOptions(db), getPaydayPlan(db, today())]);
  return <TxSheet options={options} payday={payday} />;
}
