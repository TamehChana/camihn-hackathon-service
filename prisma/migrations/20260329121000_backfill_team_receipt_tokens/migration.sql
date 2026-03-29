-- One opaque receipt secret per team (64 hex chars, matches app randomBytes(32).toString("hex")).
-- Uses gen_random_uuid() (built-in) instead of pgcrypto's gen_random_bytes (extension may be off).
UPDATE "Team"
SET "receiptToken" = lower(replace(gen_random_uuid()::text, '-', '')) || lower(replace(gen_random_uuid()::text, '-', ''))
WHERE "receiptToken" IS NULL;
