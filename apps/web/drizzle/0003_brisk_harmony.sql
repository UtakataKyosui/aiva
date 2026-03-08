ALTER TABLE "user_preferences"
ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "user_preferences"
SET "notes" = CASE
  WHEN "note" IS NULL OR btrim("note") = '' THEN '[]'::jsonb
  ELSE jsonb_build_array("note")
END;

ALTER TABLE "user_preferences"
DROP COLUMN "note";
