-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "rebookOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rebookSnoozedUntil" TEXT,
ADD COLUMN     "rebookTextedAt" TIMESTAMP(3);
