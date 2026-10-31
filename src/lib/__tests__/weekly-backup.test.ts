import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import readExcelFile from "read-excel-file/node";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { categories, transactions } from "../db/schema";
import { isCronRequest } from "../cron";
import { backupFile } from "../backup/file";
import { weeklyBackupMail } from "../backup/weekly";
import { isBackup, parseBackup, type InSheet } from "../backup/format";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

async function freshDb(): Promise<DB> {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return drizzle(client, { schema }) as unknown as DB;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cron secret", () => {
  it("accepts only the exact bearer secret", () => {
    const secret = "s3cret-value-for-tests-0123456789";
    expect(isCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronRequest(secret, secret)).toBe(false);
    expect(isCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronRequest(null, secret)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(isCronRequest("Bearer ", "")).toBe(false);
    expect(isCronRequest("Bearer undefined", undefined)).toBe(false);
  });

  it("is scheduled for Monday 06:00 in Jakarta (Sunday 23:00 UTC)", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(cfg.crons).toEqual([{ path: "/api/cron/backup", schedule: "0 23 * * 0" }]);
  });
});

describe("weekly backup email", () => {
  it("attaches a restorable backup named with the Jakarta date", async () => {
    const db = await freshDb();
    await db.insert(categories).values({ id: 1, name: "Makan", kind: "expense" });
    await db.insert(transactions).values({ date: "2026-11-01", categoryId: 1, amount: 25000 });

    const now = new Date("2026-11-01T23:00:00Z"); // Monday 06:00 WIB
    const mail = weeklyBackupMail("me@example.com", await backupFile(db, now), now);
    expect(mail.subject).toBe("Backup mingguan Jatahin! 2 November 2026");
    expect(mail.lines[1]).toBe("Isi: 1 transaksi, 0 pindah kantong, 1 kategori, 0 kantong, 0 penyesuaian kantong, dan 0 jatah.");
    expect(mail.attachments[0].filename).toBe("jatahin-backup-2026-11-02.xlsx");

    const sheets = (await readExcelFile(mail.attachments[0].content)) as unknown as InSheet[];
    expect(isBackup(sheets)).toBe(true);
    expect(parseBackup(sheets).transactions).toHaveLength(1);
  });

  it("sends the attachment to Resend as base64", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await import("../mail");

    const content = Buffer.from("isi file");
    await sendMail({ to: "me@example.com", subject: "s", lines: ["a"], attachments: [{ filename: "b.xlsx", content }] });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.attachments).toEqual([{ filename: "b.xlsx", content: content.toString("base64") }]);

    await sendMail({ to: "me@example.com", subject: "s", lines: ["a"] });
    const plain = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(plain).not.toHaveProperty("attachments");
  });

  it("hides the Resend error behind an Indonesian message", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid key", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendMail, MAIL_FAILED } = await import("../mail");
    await expect(sendMail({ to: "me@example.com", subject: "s", lines: ["a"] })).rejects.toThrow(MAIL_FAILED);
  });
});
