-- Phase 3 — PAY-01/02/03 schema additions
-- Adds deposit percent fields, payment token hash, and idempotence table for Stripe webhooks.

-- AlterTable: Organization — default deposit percent (PAY-01)
ALTER TABLE "organization" ADD COLUMN "defaultDepositPercent" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: Proposal — per-proposal deposit percent override (PAY-01)
ALTER TABLE "Proposal" ADD COLUMN "depositPercent" INTEGER;

-- AlterTable: Payment — public payment token hash (PAY-02)
ALTER TABLE "Payment" ADD COLUMN "paymentTokenHash" TEXT;

-- CreateIndex: Payment.paymentTokenHash @unique
CREATE UNIQUE INDEX "Payment_paymentTokenHash_key" ON "Payment"("paymentTokenHash");

-- CreateTable: ProcessedStripeEvent — webhook idempotence (PAY-03)
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ProcessedStripeEvent.eventId @unique
CREATE UNIQUE INDEX "ProcessedStripeEvent_eventId_key" ON "ProcessedStripeEvent"("eventId");
