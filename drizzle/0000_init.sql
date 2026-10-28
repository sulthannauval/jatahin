CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."category_role" AS ENUM('saving_deposit', 'saving_withdraw');--> statement-breakpoint
CREATE TABLE "budgets" (
	"month" date NOT NULL,
	"category_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "budgets_month_category_id_pk" PRIMARY KEY("month","category_id"),
	CONSTRAINT "budgets_amount_nonneg" CHECK ("budgets"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"group" text DEFAULT 'Lainnya' NOT NULL,
	"role" "category_role",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"target" bigint,
	"target_date" date,
	"priority" integer,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"opening_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pots_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"carry_start_month" text,
	"carry_start_balance" bigint DEFAULT 0 NOT NULL,
	"monthly_income_target" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category_id" integer NOT NULL,
	"pot_id" integer,
	"description" text DEFAULT '' NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_kind_idx" ON "categories" USING btree ("name","kind");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");