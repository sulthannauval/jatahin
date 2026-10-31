CREATE TYPE "public"."pot_kind" AS ENUM('saving', 'spending');--> statement-breakpoint
CREATE TABLE "saving_plans" (
	"month" date PRIMARY KEY NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "saving_plans_amount_nonneg" CHECK ("saving_plans"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"from_pot_id" integer,
	"to_pot_id" integer,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_amount_positive" CHECK ("transfers"."amount" > 0),
	CONSTRAINT "transfers_two_kantong" CHECK ("transfers"."from_pot_id" is distinct from "transfers"."to_pot_id")
);
--> statement-breakpoint
ALTER TABLE "pots" ADD COLUMN "kind" "pot_kind" DEFAULT 'saving' NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_pot_id_pots_id_fk" FOREIGN KEY ("from_pot_id") REFERENCES "public"."pots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_pot_id_pots_id_fk" FOREIGN KEY ("to_pot_id") REFERENCES "public"."pots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_date_idx" ON "transfers" USING btree ("date");--> statement-breakpoint
-- Savings deposits and withdrawals were income and spending in special categories. They become moves between
-- Kantong Utama (null) and the kantong, keeping their date, amount, note and time of entry.
INSERT INTO "transfers" ("date", "from_pot_id", "to_pot_id", "amount", "note", "created_at")
SELECT t."date",
	CASE WHEN c."role" = 'saving_withdraw' THEN t."pot_id" END,
	CASE WHEN c."role" = 'saving_deposit' THEN t."pot_id" END,
	t."amount", t."description", t."created_at"
FROM "transactions" t JOIN "categories" c ON c."id" = t."category_id"
WHERE c."role" IS NOT NULL AND t."pot_id" IS NOT NULL
ORDER BY t."id";--> statement-breakpoint
-- The budget for the deposit category becomes the month's saving plan.
INSERT INTO "saving_plans" ("month", "amount")
SELECT b."month", sum(b."amount")
FROM "budgets" b JOIN "categories" c ON c."id" = b."category_id"
WHERE c."role" = 'saving_deposit' AND b."amount" > 0
GROUP BY b."month";--> statement-breakpoint
DELETE FROM "budgets" b USING "categories" c WHERE c."id" = b."category_id" AND c."role" IS NOT NULL;--> statement-breakpoint
DELETE FROM "transactions" t USING "categories" c WHERE c."id" = t."category_id" AND c."role" IS NOT NULL AND t."pot_id" IS NOT NULL;--> statement-breakpoint
-- Any savings entry without a kantong (never made by the app) stays as ordinary income or spending in its category.
DELETE FROM "categories" c WHERE c."role" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "transactions" t WHERE t."category_id" = c."id");
