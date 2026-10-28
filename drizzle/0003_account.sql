CREATE TABLE "account" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	CONSTRAINT "account_single_row" CHECK ("account"."id" = 1)
);
