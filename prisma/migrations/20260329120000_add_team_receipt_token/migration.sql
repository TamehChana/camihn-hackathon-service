-- AlterTable
ALTER TABLE "Team" ADD COLUMN "receiptToken" TEXT;

-- CreateIndex (nullable unique: multiple NULLs allowed in PostgreSQL)
CREATE UNIQUE INDEX "Team_receiptToken_key" ON "Team"("receiptToken");
