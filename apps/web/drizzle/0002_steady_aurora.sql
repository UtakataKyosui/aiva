ALTER TABLE "user_llm_settings"
ADD COLUMN "provider_keys" jsonb DEFAULT '{}'::jsonb NOT NULL;
