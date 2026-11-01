CREATE TYPE "public"."bill_schedule" AS ENUM('payday', 'date');--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"bill_id" integer NOT NULL,
	"month" date NOT NULL,
	"transaction_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_bill_id_month_pk" PRIMARY KEY("bill_id","month")
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"pot_id" integer,
	"schedule" "bill_schedule" DEFAULT 'payday' NOT NULL,
	"due_day" integer,
	"amount" bigint,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_due_day" CHECK (("bills"."schedule" = 'payday' and "bills"."due_day" is null) or ("bills"."schedule" = 'date' and "bills"."due_day" between 1 and 31)),
	CONSTRAINT "bills_amount_positive" CHECK ("bills"."amount" is null or "bills"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "payday_day" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "salary_category_id" integer;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payments_transaction_idx" ON "bill_payments" USING btree ("transaction_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_salary_category_id_categories_id_fk" FOREIGN KEY ("salary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;