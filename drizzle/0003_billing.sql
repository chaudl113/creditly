CREATE TYPE "public"."checkout_kind" AS ENUM('subscription', 'credit_pack');--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "checkout_kind" NOT NULL,
	"product_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_ref" text NOT NULL,
	"payment_intent_id" text,
	"user_id" uuid NOT NULL,
	"kind" "checkout_kind" NOT NULL,
	"product_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"credits_granted" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_ref_unique" UNIQUE("stripe_ref"),
	CONSTRAINT "payments_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"credits_reclaimed" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"deliveries" integer DEFAULT 1 NOT NULL,
	"note" text,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"price_cents" integer NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"stripe_event_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "stripe_events_received_idx" ON "stripe_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");