-- One opaque receipt secret per team (existing rows were NULL until now).
UPDATE "Team"
SET "receiptToken" = encode(gen_random_bytes(32), 'hex')
WHERE "receiptToken" IS NULL;
