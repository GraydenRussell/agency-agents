-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "ReviewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "approvalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GOOGLE',
    "externalId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "draftReply" TEXT,
    "draftBy" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSnapshot" (
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "average" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_jobId_key" ON "ReviewRequest"("jobId");

-- CreateIndex
CREATE INDEX "ReviewRequest_status_createdAt_idx" ON "ReviewRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_customerId_idx" ON "ReviewRequest"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_externalId_key" ON "Review"("externalId");

-- CreateIndex
CREATE INDEX "Review_reviewedAt_idx" ON "Review"("reviewedAt");
