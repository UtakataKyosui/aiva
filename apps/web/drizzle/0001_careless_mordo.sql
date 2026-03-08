SET search_path TO public;
--> statement-breakpoint
CREATE TABLE "user_llm_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD COLUMN "llm_provider" text;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD COLUMN "llm_model_id" text;--> statement-breakpoint
ALTER TABLE "user_llm_settings" ADD CONSTRAINT "user_llm_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_llm_settings_user_id_idx" ON "user_llm_settings" USING btree ("user_id");
