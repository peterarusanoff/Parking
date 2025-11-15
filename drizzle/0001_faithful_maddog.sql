CREATE TYPE "public"."webhook_event_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_payment_method_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"card_brand" varchar(50),
	"card_last4" varchar(4),
	"card_exp_month" integer,
	"card_exp_year" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"status" "webhook_event_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_user_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_stripe_pm_idx" ON "payment_methods" USING btree ("stripe_payment_method_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_is_default_idx" ON "payment_methods" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_stripe_event_idx" ON "webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_type_idx" ON "webhook_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx" ON "webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");