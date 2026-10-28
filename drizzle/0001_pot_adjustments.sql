CREATE TABLE "pot_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"pot_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pot_adjustments_nonzero" CHECK ("pot_adjustments"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "pot_adjustments" ADD CONSTRAINT "pot_adjustments_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pot_adjustments_pot_idx" ON "pot_adjustments" USING btree ("pot_id");