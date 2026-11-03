import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { bills, categories, transactions } from "../db/schema";
import { loadBills } from "../bill-queries";
import { linkPayment } from "../bill-writes";

vi.mock("server-only", () => ({}));

async function freshDb(): Promise<DB> {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return drizzle(client, { schema }) as unknown as DB;
}

describe("the amount set for the next tagihan", () => {
  it("is used until a payment is recorded, then the last payment is followed again", async () => {
    const db = await freshDb();
    await db.insert(categories).values({ id: 1, name: "Utility", kind: "expense", group: "Kebutuhan" });
    await db.insert(bills).values({ id: 1, name: "Listrik PLN", categoryId: 1, amount: 500000 });
    await db.insert(transactions).values([
      { id: 1, date: "2026-10-10", categoryId: 1, description: "Listrik PLN", amount: 519280 },
      { id: 2, date: "2026-11-10", categoryId: 1, description: "Listrik PLN", amount: 487000 },
    ]);
    const amounts = async () => (await loadBills(db)).bills[0];

    // Before the first payment: the amount typed in.
    expect((await amounts()).lastAmount).toBe(500000);

    // Paid: the amount is used up and the payment is followed.
    await linkPayment(db, 1, "2026-10", 1);
    expect(await amounts()).toMatchObject({ amount: null, lastAmount: 519280, paidAmount: 519280 });

    // The November bill came early: its amount wins over October's payment.
    await db.update(bills).set({ amount: 487000 }).where(eq(bills.id, 1));
    expect(await amounts()).toMatchObject({ lastAmount: 487000, paidAmount: 519280 });

    // A skipped month uses nothing up.
    await linkPayment(db, 1, "2026-12", null);
    expect((await amounts()).lastAmount).toBe(487000);

    await linkPayment(db, 1, "2026-11", 2);
    expect(await amounts()).toMatchObject({ amount: null, lastAmount: 487000, paidAmount: 487000 });
  });
});
