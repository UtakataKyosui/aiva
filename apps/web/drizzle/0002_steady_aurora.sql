SET search_path TO public;
--> statement-breakpoint
ALTER TABLE "user_llm_settings"
ADD COLUMN "provider_keys" jsonb DEFAULT '{}'::jsonb NOT NULL;
