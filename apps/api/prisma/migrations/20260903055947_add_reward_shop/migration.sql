-- CreateEnum
CREATE TYPE "RewardRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'REWARD_DEFINITION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_DEFINITION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_PURCHASED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_FULFILLED';

-- AlterEnum
ALTER TYPE "PointTransactionType" ADD VALUE 'REWARD_REDEMPTION';

-- AlterTable
ALTER TABLE "point_transactions" ADD COLUMN     "reward_redemption_id" TEXT;

-- CreateTable
CREATE TABLE "reward_definitions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cost" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "reward_definition_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "cost_at_purchase" INTEGER NOT NULL,
    "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),
    "fulfilled_by_member_id" TEXT,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_definitions_household_id_is_active_idx" ON "reward_definitions"("household_id", "is_active");

-- CreateIndex
CREATE INDEX "reward_redemptions_household_id_status_purchased_at_idx" ON "reward_redemptions"("household_id", "status", "purchased_at");

-- CreateIndex
CREATE INDEX "reward_redemptions_reward_definition_id_idx" ON "reward_redemptions"("reward_definition_id");

-- CreateIndex
CREATE INDEX "point_transactions_reward_redemption_id_idx" ON "point_transactions"("reward_redemption_id");

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_reward_redemption_id_fkey" FOREIGN KEY ("reward_redemption_id") REFERENCES "reward_redemptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_definitions" ADD CONSTRAINT "reward_definitions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_definition_id_fkey" FOREIGN KEY ("reward_definition_id") REFERENCES "reward_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_fulfilled_by_member_id_fkey" FOREIGN KEY ("fulfilled_by_member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
