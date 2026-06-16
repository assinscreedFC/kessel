-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "clientOrgId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "clientOrgId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClientOrg" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOrg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientOrg_orgId_idx" ON "ClientOrg"("orgId");

-- CreateIndex
CREATE INDEX "DealActivity_dealId_idx" ON "DealActivity"("dealId");

-- CreateIndex
CREATE INDEX "Deal_orgId_status_position_idx" ON "Deal"("orgId", "status", "position");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "ClientOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "ClientOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOrg" ADD CONSTRAINT "ClientOrg_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
